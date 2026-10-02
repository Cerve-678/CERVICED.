-- Auto-refund the client when the PROVIDER caused a paid booking to fall through.
--
-- Product decision (user, 2026-10-02):
--   * Provider DECLINES a booking            -> client is auto-refunded in full.
--   * Provider IGNORES it until it expires   -> client is auto-refunded in full.
--   * CLIENT cancels their own booking        -> NO auto-refund (unchanged; owned
--                                                by cancel_own_booking, NOT touched
--                                                here — that is the other session's
--                                                file 20261002120000).
--   * No-show (client OR provider)            -> DEFERRED, intentionally not handled.
--
-- WHY refund-at-source, not a scheduled scan:
--   bookings has no `cancelled_by` column and a provider cancel and a client
--   cancel both land on status='cancelled' (verified live: the status check is
--   pending/confirmed/in_progress/completed/cancelled/no_show/on_hold/
--   provider_no_show). A job scanning 'cancelled' rows could not tell the two
--   apart and would wrongly refund client cancellations. So the refund is fired
--   at the exact moment of the provider-caused action, where the cause is known.
--
-- The money half only: refund-payment refunds the client's full amount_paid
-- (fee included) out of the platform balance and reverses any provider transfer
-- already made. It is idempotent (keyed on booking id) and a no-op for a booking
-- with no captured payment, so firing it defensively is safe. It does NOT cancel
-- the booking or send notifications — the cancel paths below (and their triggers)
-- still own that, avoiding the booking-domain double-notify trap.
--
-- The two modified functions are reproduced VERBATIM from the live
-- pg_get_functiondef (SECURITY DEFINER + their exact SET search_path preserved);
-- the only additions are the refund call and, in provider_cancel_own_booking,
-- the extra payment columns selected to gate it.
--
-- NUMBERING: live max(version) at authoring time was 20261002020233. This file
-- is 20261002130000, above both that and the other session's unapplied
-- 20261002120000. Before applying, confirm it is still above
-- max(version) in supabase_migrations.schema_migrations, per supabase/MIGRATION_OWNER.md.

-- ---------------------------------------------------------------------------
-- Helper: fire a client refund for one booking via the refund-payment edge
-- function, using the stored service-role key. Mirrors process_due_payouts'
-- vault + net.http_post pattern exactly. Fire-and-forget: a failure to enqueue
-- must not block the cancellation. NOT granted to anon/authenticated — it is
-- only ever called from the SECURITY DEFINER cancel paths below.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refund_booking_async(p_booking_id uuid, p_reason text DEFAULT 'provider_caused_cancellation')
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key text;
BEGIN
  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
   WHERE name = 'service_role_key'
   LIMIT 1;
  IF v_key IS NULL OR v_key = '' OR v_key LIKE '<%' THEN
    RAISE WARNING 'refund_booking_async: service_role_key unavailable; no refund fired for booking %', p_booking_id;
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := 'https://ztrfpfvvejzaysrelmfm.supabase.co/functions/v1/refund-payment',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := jsonb_build_object('bookingId', p_booking_id, 'reason', p_reason),
    timeout_milliseconds := 30000
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.refund_booking_async(uuid, text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Provider DECLINE / cancel: refund the client if the cancelled booking had a
-- captured, not-yet-refunded payment. Everything above the refund block is the
-- live definition verbatim; only the SELECT column list and the refund block
-- are new.
-- ---------------------------------------------------------------------------
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
BEGIN
  SELECT b.status, b.payment_intent_id, b.payment_status, b.stripe_refund_id
    INTO v_status, v_payment_intent_id, v_payment_status, v_stripe_refund_id
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
   WHERE b.id = p_booking_id
     AND p.user_id = auth.uid()
   FOR UPDATE OF b;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_status IN ('cancelled', 'completed', 'no_show') THEN
    RAISE EXCEPTION 'This booking can no longer be cancelled';
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
$function$;

-- ---------------------------------------------------------------------------
-- Provider IGNORE: a pending booking that was paid and then left to expire is
-- a provider non-response -> refund the client. The UPDATE still cancels every
-- stale pending booking (paid or not); the refund fires only for the paid ones.
-- Reproduced verbatim with the single UPDATE replaced by a refund-then-cancel
-- over the same predicate.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_expire_stale_pending_bookings()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rec RECORD;
BEGIN
  FOR v_rec IN
    WITH expired AS (
      UPDATE public.bookings
         SET status = 'cancelled'
       WHERE status = 'pending'
         AND (
           created_at < NOW() - INTERVAL '48 hours'
           OR (booking_date::TIMESTAMP + booking_time) < NOW()
         )
      RETURNING id, payment_intent_id, payment_status, stripe_refund_id
    )
    SELECT id
      FROM expired
     WHERE payment_intent_id IS NOT NULL
       AND payment_status IN ('fully_paid', 'deposit_paid')
       AND stripe_refund_id IS NULL
  LOOP
    PERFORM public.refund_booking_async(v_rec.id, 'provider_no_response');
  END LOOP;
END;
$function$;
