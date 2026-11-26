-- Reporting that the provider didn't turn up asks them for a refund.
--
-- client_mark_provider_no_show stopped the provider being paid (release-payouts
-- only pays confirmed/completed bookings) but refunded nobody: the money sat
-- with CERVICED until the client separately opened a refund request. Now, for
-- a booking paid through the app, the same call opens that request
-- (request_booking_refund, reason "The provider didn't turn up"), in the same
-- transaction, so a report can never be saved without it. The provider has 3
-- days to refund or pass it to CERVICED, as with any request. The owner's
-- call, 26 November 2026. The app replaces Cancel with this report once the
-- start time has passed.
--
-- Also: "today" and "has it started" are read in UK time, not the database's
-- UTC (the same fix 20261113140000 made elsewhere). In summer the report only
-- opened an hour after the start time, and never for an appointment after 11pm.
--
-- Redefined from live (pg_get_functiondef, read 2026-11-26) with an md5 guard.
-- Same signature, so the existing EXECUTE grants stay.

BEGIN;

DO $$
BEGIN
  IF md5(pg_get_functiondef('public.client_mark_provider_no_show'::regproc)) IS DISTINCT FROM 'e60cb6dc59e530edfdf3f403964c7085' THEN
    RAISE EXCEPTION 'public.client_mark_provider_no_show is not the version this migration was written against';
  END IF;
  IF md5(pg_get_functiondef('public.request_booking_refund'::regproc)) IS DISTINCT FROM 'f7aa3e1d064765a5e82a65e7f25c2a3d' THEN
    RAISE EXCEPTION 'public.request_booking_refund is not the version this migration was written against';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.client_mark_provider_no_show(p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_status    text;
  v_payment_status    text;
  v_booking_date      date;
  v_booking_time      time;
  v_appt_start        timestamp;
  v_now_uk            timestamp := (now() AT TIME ZONE 'Europe/London');
  v_active_reschedule boolean;
BEGIN
  SELECT b.status, b.payment_status, b.booking_date, b.booking_time
    INTO v_current_status, v_payment_status, v_booking_date, v_booking_time
    FROM public.bookings b
   WHERE b.id = p_booking_id
     AND b.user_id = auth.uid()
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_current_status IN ('cancelled', 'completed', 'no_show', 'provider_no_show') THEN
    RAISE EXCEPTION 'Booking is already %, no further status changes allowed', v_current_status;
  END IF;

  IF v_current_status NOT IN ('confirmed', 'in_progress') THEN
    RAISE EXCEPTION 'Cannot mark provider no-show from status %', v_current_status;
  END IF;

  -- Booking dates and times are UK wall-clock time.
  v_appt_start := (v_booking_date + v_booking_time)::timestamp;

  IF v_booking_date <> v_now_uk::date THEN
    RAISE EXCEPTION 'Provider no-show can only be marked on the day of the appointment';
  END IF;

  IF v_now_uk < v_appt_start THEN
    RAISE EXCEPTION 'Cannot mark provider no-show before the appointment start time';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.booking_reschedule_requests r
     WHERE r.booking_id = p_booking_id
       AND r.status IN ('pending', 'provider_responded')
  ) INTO v_active_reschedule;
  IF v_active_reschedule THEN
    RAISE EXCEPTION 'Cannot mark provider no-show while a reschedule request is active for this booking';
  END IF;

  UPDATE public.bookings
     SET status = 'provider_no_show',
         no_show_marked_at = NOW()
   WHERE id = p_booking_id;

  -- Paid through the app: ask the provider for a refund, unless the client
  -- already has a request open. Same paid statuses request_booking_refund
  -- accepts; it runs as this same client (auth.uid()).
  IF v_payment_status IN ('deposit_paid', 'fully_paid', 'partially_refunded')
     AND NOT EXISTS (
       SELECT 1 FROM public.refund_requests r
        WHERE r.booking_id = p_booking_id AND r.status IN ('with_provider', 'under_review')
     ) THEN
    PERFORM public.request_booking_refund(p_booking_id, 'The provider didn''t turn up', NULL);
  END IF;
END;
$function$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261126170000', 'provider_no_show_opens_refund_request')
ON CONFLICT DO NOTHING;

COMMIT;
