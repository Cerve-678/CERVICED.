-- A client's own abandoned cart hold must never read back to them as
-- "this time is booked".
--
-- Reproduced live on 2026-09-07: two checkout attempts on the same provider
-- (11:30 and 12:30 on 2026-09-11) each wrote an `on_hold` row at "Confirm &
-- Pay" and neither was ever released — the app only handed a hold back when
-- the client used the payment sheet's × button, so every other exit left the
-- row for the full 10-minute TTL. get_provider_busy_spans counts held slots
-- as busy (correctly — nobody else may take them), but it made no exception
-- for the person who placed the hold, so the client was shown their own slot
-- as unavailable, with nothing saying why.
--
-- The app now releases on every exit it can observe (CartScreen's
-- abandonOutstandingCheckout). This is the half the app cannot cover: a
-- crash, a force-quit, a dev reload or a dead network still strand a hold,
-- and the expire_cart_holds() cron only sweeps it 10-15 minutes later.
--
-- Two changes, which have to land together:
--   1. Busy spans stop hiding a caller's own cart hold from that caller.
--   2. The hold RPC clears the caller's own stranded holds for the slot it is
--      about to take. Without this, (1) alone would offer the client a slot
--      whose insert bookings_no_overlap then rejects (23P01, "We couldn't
--      reserve that time") — trading a wrong message for a worse one.
--
-- Scope is deliberately narrow in both: only rows that are `on_hold`, carry a
-- hold_batch_id (a CART hold — reschedule holds have none and are left
-- alone), and belong to auth.uid(). Nothing here touches another client's
-- hold, a real booking, or a hold from the batch being placed right now.

CREATE OR REPLACE FUNCTION public.get_provider_busy_spans(p_provider_id uuid, p_from_date date, p_to_date date)
 RETURNS TABLE(booking_date date, busy_start time without time zone, busy_end time without time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    b.booking_date,
    -- Clamped to the booking's own calendar day. A buffer can push
    -- effective_start before midnight or effective_end past it; extracting
    -- ::time from those would wrap (e.g. 23:50 → 01:05) and produce an
    -- inverted span that silently blocks nothing, since callers compare
    -- start < end within one day. Clamping keeps the span well-formed; the
    -- few buffer minutes that spill into the neighbouring day are not
    -- represented, which the DB-level bookings_no_overlap constraint (which
    -- compares real timestamps, not times) still catches on write.
    --
    -- COALESCE also falls back to raw times for any row predating the
    -- effective_start/effective_end backfill (prevent_overlapping_bookings.sql).
    GREATEST(
      COALESCE(b.effective_start, b.booking_date + b.booking_time),
      b.booking_date::timestamp
    )::time AS busy_start,
    LEAST(
      COALESCE(
        b.effective_end,
        b.booking_date + COALESCE(b.end_time, b.booking_time + INTERVAL '1 hour')
      ),
      b.booking_date::timestamp + INTERVAL '1 day' - INTERVAL '1 second'
    )::time AS busy_end
  FROM public.bookings b
  WHERE b.provider_id = p_provider_id
    AND b.booking_date BETWEEN p_from_date AND p_to_date
    -- Same set the app's own conflict checks use: anything not cancelled or
    -- no-showed still occupies the slot. 'on_hold' included so a cart hold
    -- mid-checkout isn't offered to someone else.
    AND b.status IN ('pending', 'confirmed', 'in_progress', 'on_hold')
    -- A lapsed hold is not a busy slot. Between expiry and the next sweep the
    -- row still says on_hold, and without this the slot stays invisible to
    -- the very person the cascade just offered it to.
    --
    -- NULL hold_expires_at still blocks, deliberately. Reschedule holds carry
    -- no clock of their own -- they end when the reschedule request they
    -- belong to ends -- so a NULL here means "no deadline", not "expired".
    AND (b.status <> 'on_hold' OR b.hold_expires_at IS NULL OR b.hold_expires_at > NOW())
    -- ...and a CART hold the caller placed themself is not a busy slot FOR
    -- THEM. It still blocks everyone else (this exception is scoped to
    -- auth.uid()), but the client who is holding it mid-checkout must not be
    -- told their own time is taken when they go back to change it. The
    -- explicit auth.uid() IS NOT NULL guard keeps an anonymous caller (where
    -- auth.uid() is NULL) from having rows silently dropped by NULL
    -- propagation through NOT.
    AND NOT (
      b.status = 'on_hold'
      AND b.hold_batch_id IS NOT NULL
      AND auth.uid() IS NOT NULL
      AND b.user_id = auth.uid()
    )
    -- Never expose a provider who isn't publicly listed — EXCEPT to that
    -- provider themself. Without the owner branch, a provider who hasn't
    -- gone live yet would get an empty result for their OWN schedule, so
    -- their profile card and the reschedule slot picker would show a fully
    -- open diary while real bookings sat in it. The owner branch grants
    -- nothing a provider can't already read directly via
    -- bookings_provider_read; it only stops the has_gone_live filter from
    -- hiding their own data from them.
    AND EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = b.provider_id
        AND (
          (p.has_gone_live = TRUE AND p.is_active = TRUE)
          OR p.user_id = auth.uid()
        )
    )
  -- Ordered by the underlying columns, never the output aliases: a bare
  -- `busy_start` here is ambiguous against this function's own RETURNS TABLE
  -- column of the same name (the 42702 that broke claim_cart_booking_slots).
  ORDER BY b.booking_date, b.effective_start, b.booking_time;
$function$;

CREATE OR REPLACE FUNCTION public.hold_cart_booking_slots(p_hold_batch_id uuid, p_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item JSONB;
  v_provider_id UUID;
  v_service_id UUID;
  v_emergency BOOLEAN;
  v_service public.services%ROWTYPE;
  v_safety_required BOOLEAN;
  v_safety_ack BOOLEAN;
  v_policy_accepted BOOLEAN;
  v_booking_date DATE;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_provider_id := (v_item->>'provider_id')::UUID;
    v_service_id  := NULLIF(v_item->>'service_id', '')::UUID;
    v_booking_date := (v_item->>'booking_date')::DATE;

    IF EXISTS (
      SELECT 1 FROM public.providers p
       WHERE p.id = v_provider_id AND p.user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'You can''t book your own provider profile.';
    END IF;

    -- Clear this caller's OWN stranded cart holds on this provider and day
    -- before taking the slot. A client runs one checkout at a time, so any
    -- hold of theirs still sitting on this day from an earlier batch is an
    -- abandoned attempt — and bookings_no_overlap counts it, so without this
    -- a client retrying the time they just abandoned is rejected by their own
    -- leftover row (23P01, surfaced as "We couldn't reserve that time").
    --
    -- Same guards release_cart_booking_slots() uses: never touch a row that
    -- has money or a review attached. Scoped to hold_batch_id IS NOT NULL so
    -- reschedule holds (which carry none) survive, and to a DIFFERENT batch
    -- so the rows this very call is inserting are never candidates. Bounded
    -- to one provider and one date so a concurrent checkout of theirs
    -- elsewhere is left alone.
    DELETE FROM public.notifications n
     USING public.bookings b
     WHERE n.booking_id = b.id
       AND b.user_id = auth.uid()
       AND b.status = 'on_hold'
       AND b.hold_batch_id IS NOT NULL
       AND b.hold_batch_id <> p_hold_batch_id
       AND b.provider_id = v_provider_id
       AND b.booking_date = v_booking_date
       AND NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.booking_id = b.id)
       AND NOT EXISTS (SELECT 1 FROM public.reviews r WHERE r.booking_id = b.id);

    DELETE FROM public.bookings b
     WHERE b.user_id = auth.uid()
       AND b.status = 'on_hold'
       AND b.hold_batch_id IS NOT NULL
       AND b.hold_batch_id <> p_hold_batch_id
       AND b.provider_id = v_provider_id
       AND b.booking_date = v_booking_date
       AND NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.booking_id = b.id)
       AND NOT EXISTS (SELECT 1 FROM public.reviews r WHERE r.booking_id = b.id);

    -- Agreement to CERVICED's Terms and the provider's cancellation policy.
    -- One checkbox on the Confirm & Pay step gates the button that gets here,
    -- so a payload without it did not come from the app's own flow.
    v_policy_accepted := COALESCE((v_item->>'policy_accepted')::boolean, false);
    IF NOT v_policy_accepted THEN
      RAISE EXCEPTION 'Please agree to the booking terms before continuing';
    END IF;

    -- Whether an acknowledgement is required is the SERVICE's fact, read from
    -- the service row — a caller cannot talk its way out of the gate by
    -- omitting a flag. Mirrors prepare_checkout()'s derivation exactly.
    -- A hold with no service_id (a local/unresolved item) can't be checked
    -- against anything, so it carries no requirement rather than a guessed one.
    v_safety_required := false;
    IF v_service_id IS NOT NULL THEN
      SELECT s.* INTO v_service FROM public.services s WHERE s.id = v_service_id;
      IF FOUND THEN
        v_safety_required := COALESCE(v_service.patch_test_required, false)
          OR v_service.is_pregnancy_safe = false;
      END IF;
    END IF;

    v_safety_ack := COALESCE((v_item->>'safety_ack')::boolean, false);
    IF v_safety_required AND NOT v_safety_ack THEN
      RAISE EXCEPTION 'Please confirm you have seen this treatment''s safety information before continuing';
    END IF;

    v_emergency := COALESCE((v_item->>'is_emergency_request')::boolean, false);

    INSERT INTO public.bookings (
      user_id, provider_id, service_id, status,
      booking_date, booking_time, end_time,
      payment_type, base_price, add_ons_total, service_charge,
      deposit_amount, amount_paid, remaining_balance, payment_status,
      provider_name_snapshot, service_name_snapshot,
      hold_batch_id, hold_expires_at, is_emergency_request, emergency_ack_at,
      safety_ack_required, safety_ack_at, policy_accepted_at
    ) VALUES (
      auth.uid(),
      v_provider_id,
      v_service_id,
      'on_hold',
      v_booking_date,
      (v_item->>'booking_time')::TIME,
      (v_item->>'end_time')::TIME,
      'full', 0, 0, 0, 0, 0, 0, 'pending',
      'Reserving…', 'Reserving…',
      p_hold_batch_id, NOW() + INTERVAL '10 minutes',
      v_emergency, CASE WHEN v_emergency THEN now() ELSE NULL END,
      v_safety_required, CASE WHEN v_safety_required THEN now() ELSE NULL END,
      now()
    );
  END LOOP;
END;
$function$;
