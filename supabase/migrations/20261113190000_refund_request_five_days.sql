-- Refund requests close 5 days after the day of the appointment.
--
-- The user's rule (2026-11-13): "client has five days after the day of the
-- appointment to request for a refund". The appointment day itself doesn't
-- count; the client can ask until 23:59 UK time on the fifth day after it
-- (appointment Monday 10th -> last day Saturday 15th). Before this there was
-- no limit at all.
--
-- Only refund REQUESTS close. Complaints go to support and stay open. A
-- request already open on day 5 carries on as before (provider 3 days, then
-- Cerviced), and a provider can still refund at any time.
--
-- Redefined from live pg_get_functiondef with an md5 guard: if live changed
-- since this file was written, it refuses rather than overwriting it.

BEGIN;

DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.request_booking_refund(uuid,text,text)'::regprocedure))
     <> '72a54e1bf6a940ca33ba27e24ac059c6' THEN
    RAISE EXCEPTION 'request_booking_refund changed live since this migration was written; rebuild it from live';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.request_booking_refund(p_booking_id uuid, p_reason text, p_message text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reason         text;
  v_message        text;
  v_user_id        uuid;
  v_provider_id    uuid;
  v_provider_user  uuid;
  v_payment_status text;
  v_customer_name  text;
  v_service_name   text;
  v_booking_date   date;
  v_id             uuid;
  v_held_pence     integer;
BEGIN
  -- One of the sheet's preset reasons (SUPPORT_REASONS.refund in
  -- src/features/bookings/bookingSupportRequest.ts — change both together).
  -- It goes verbatim into the provider's push and email, so it is never
  -- free text; the client's own words go in p_message, which stays in-app.
  v_reason := BTRIM(COALESCE(p_reason, ''));
  IF v_reason NOT IN (
    'The provider cancelled', 'The provider didn''t turn up', 'The service wasn''t what I booked',
    'I was charged the wrong amount', 'I cancelled within their policy', 'Something else'
  ) THEN
    RAISE EXCEPTION 'Please pick what the refund is for.';
  END IF;
  v_message := LEFT(NULLIF(BTRIM(COALESCE(p_message, '')), ''), 1000);

  SELECT b.user_id, b.provider_id, b.payment_status, b.customer_name,
         b.service_name_snapshot, b.booking_date
    INTO v_user_id, v_provider_id, v_payment_status, v_customer_name,
         v_service_name, v_booking_date
    FROM public.bookings b
   WHERE b.id = p_booking_id
   FOR UPDATE;

  IF NOT FOUND OR v_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;


  -- Cerviced only gets involved with money paid through the app (mirrors
  -- getRefundRequestScope in src/features/bookings/bookingSupportRequest.ts).
  IF v_payment_status NOT IN ('deposit_paid', 'fully_paid', 'partially_refunded') THEN
    RAISE EXCEPTION 'Nothing for this booking is left to refund through Cerviced.';
  END IF;

  -- After the paid-in-app check, so an off-app booking keeps its own reason.
  -- A client can ask until the end of the fifth UK day after the day of the
  -- appointment (REFUND_REQUEST_DAYS in src/features/bookings/
  -- bookingSupportRequest.ts; change both together). A complaint is not
  -- affected: it goes to support, not through here.
  IF (now() AT TIME ZONE 'Europe/London')::date > v_booking_date + 5 THEN
    RAISE EXCEPTION 'Refund requests for this booking closed at the end of %, 5 days after the appointment. If something went wrong, you can still make a complaint from the booking.',
      TO_CHAR(v_booking_date + 5, 'FMDay FMDD FMMonth');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.refund_requests r
     WHERE r.booking_id = p_booking_id AND r.status IN ('with_provider', 'under_review')
  ) THEN
    RAISE EXCEPTION 'You already have a refund request open for this booking.';
  END IF;

  INSERT INTO public.refund_requests (booking_id, client_id, provider_id, reason, message)
  VALUES (p_booking_id, v_user_id, v_provider_id, v_reason, v_message)
  RETURNING id INTO v_id;

  SELECT p.user_id INTO v_provider_user FROM public.providers p WHERE p.id = v_provider_id;
  -- release-payouts skips a held payout while a request is open, so say so.
  SELECT pp.payout_amount INTO v_held_pence
    FROM public.provider_payouts pp
   WHERE pp.booking_id = p_booking_id AND pp.status = 'held';
  IF v_provider_user IS NOT NULL THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role, metadata)
    VALUES (
      v_provider_user, 'refund_requested', 'Refund Requested',
      COALESCE(NULLIF(BTRIM(v_customer_name), ''), 'A client') || ' has asked for a refund on ' ||
        COALESCE(v_service_name, 'their booking') || ' on ' ||
        TO_CHAR(v_booking_date, 'DD Mon YYYY') || ': ' || v_reason ||
        '. Refund it from the booking, or pass it to Cerviced to review.' ||
        ' If you don''t reply within 3 days, it goes to Cerviced to review.' ||
        CASE WHEN COALESCE(v_held_pence, 0) > 0
          THEN ' Your £' || TO_CHAR(v_held_pence / 100.0, 'FM999990.00') || ' for this booking is on hold until it''s settled.'
          ELSE '' END,
      'high', TRUE, p_booking_id, v_provider_id, 'provider',
      jsonb_build_object('refund_request_id', v_id)
    );
  END IF;

  RETURN v_id;
END;
$function$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261113190000', 'refund_request_five_days')
ON CONFLICT (version) DO NOTHING;

COMMIT;
