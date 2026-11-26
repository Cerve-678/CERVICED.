-- A provider can't cancel (and so fully refund) a booking once it has started.
--
-- provider_cancel_own_booking() and provider_cancel_group_booking() only
-- refused cancelled / completed / no_show. A provider could therefore cancel
-- a confirmed booking after its start time, or one in_progress or
-- provider_no_show, and the client was refunded in full as though the
-- provider had never turned up: the visit, or the no-show and its dispute,
-- was erased and CERVICED's fee returned.
--
-- Now only 'pending' (declining a request) and 'confirmed' can be cancelled,
-- and a confirmed booking only before its start in UK time. After that the
-- provider uses "Issue a refund" (refund-payment), which records a refund
-- without rewriting what happened.
--
-- Known, not changed here: provider_cancel_group_booking() doesn't start the
-- refund itself; process_unsent_refunds() (20261112120000) sends it within
-- about 10 minutes.
--
-- Redefined from live with md5 guards.

BEGIN;

DO $$
BEGIN
  IF md5(pg_get_functiondef('public.provider_cancel_own_booking(uuid)'::regprocedure)) <> '9383979b1711cd68d124ae4da18cea81' THEN
    RAISE EXCEPTION 'provider_cancel_own_booking changed live since this migration was written; redo it from live';
  END IF;
  IF md5(pg_get_functiondef('public.provider_cancel_group_booking(uuid)'::regprocedure)) <> 'c608b73d5df11a2d1dfe972d53b66297' THEN
    RAISE EXCEPTION 'provider_cancel_group_booking changed live since this migration was written; redo it from live';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.provider_cancel_own_booking(p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status             TEXT;
  v_payment_intent_id  TEXT;
  v_payment_status     TEXT;
  v_stripe_refund_id   TEXT;
  v_starts_at          TIMESTAMPTZ;
BEGIN
  SELECT b.status, b.payment_intent_id, b.payment_status, b.stripe_refund_id,
         (b.booking_date + b.booking_time) AT TIME ZONE 'Europe/London'
    INTO v_status, v_payment_intent_id, v_payment_status, v_stripe_refund_id, v_starts_at
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
   WHERE b.id = p_booking_id
     AND p.user_id = auth.uid()
   FOR UPDATE OF b;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  -- Only a request (declining it) or an upcoming confirmed booking can be
  -- cancelled. in_progress, provider_no_show and on_hold used to slip through
  -- and were refunded in full, erasing the visit or the no-show (20261113110000).
  IF v_status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'This booking can no longer be cancelled';
  END IF;

  -- Once a confirmed appointment has started (UK time), cancelling it would
  -- refund everything as if the provider never showed. Money back after the
  -- start is a refund the provider chooses, through refund-payment. A pending
  -- request can still be declined: it expires and is refunded in full anyway.
  IF v_status = 'confirmed' AND now() >= v_starts_at THEN
    RAISE EXCEPTION 'This appointment has already started, so it can''t be cancelled now. If the client should get money back, use Issue a refund on the booking.';
  END IF;

  UPDATE public.bookings SET status = 'cancelled' WHERE id = p_booking_id;

  -- Provider-caused cancellation: return the client's money. refund-payment is
  -- idempotent and a no-op for an unpaid booking, so this is safe to fire.
  IF v_payment_intent_id IS NOT NULL
     AND v_payment_status IN ('fully_paid', 'deposit_paid')
     AND v_stripe_refund_id IS NULL THEN
    PERFORM public.refund_booking_async(p_booking_id, 'provider_cancelled');
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.provider_cancel_group_booking(p_group_booking_id uuid)
 RETURNS TABLE(booking_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_provider_id UUID;
  r RECORD;
BEGIN
  SELECT p.id INTO v_provider_id
    FROM public.providers p WHERE p.user_id = auth.uid();

  IF v_provider_id IS NULL THEN
    RAISE EXCEPTION 'No provider profile for caller';
  END IF;

  FOR r IN
    SELECT b.id, b.status,
           (b.booking_date + b.booking_time) AT TIME ZONE 'Europe/London' AS starts_at
      FROM public.bookings b
     WHERE b.group_booking_id = p_group_booking_id
       AND b.provider_id = v_provider_id
     FOR UPDATE OF b
  LOOP
    -- Same rule as provider_cancel_own_booking() (20261113110000).
    IF r.status NOT IN ('pending', 'confirmed') THEN
      RAISE EXCEPTION 'This group booking can no longer be cancelled';
    END IF;
    IF r.status = 'confirmed' AND now() >= r.starts_at THEN
      RAISE EXCEPTION 'This appointment has already started, so it can''t be cancelled now. If the client should get money back, use Issue a refund on the booking.';
    END IF;
  END LOOP;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No bookings found in this group for the calling provider';
  END IF;

  RETURN QUERY
    UPDATE public.bookings b
       SET status = 'cancelled'
     WHERE b.group_booking_id = p_group_booking_id
       AND b.provider_id = v_provider_id
    RETURNING b.id;
END;
$function$
;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261113110000', 'provider_cancel_stops_at_start')
ON CONFLICT (version) DO NOTHING;

COMMIT;
