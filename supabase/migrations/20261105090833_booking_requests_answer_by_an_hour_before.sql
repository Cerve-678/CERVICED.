-- A booking request is answered 24 hours after it's made, or an hour before
-- the appointment if that comes sooner. A client who books at noon for 5pm
-- the same day can't wait 24 hours, so the provider now has until 4pm, and is
-- told so as an urgent request. A request made with less than an hour to go
-- has until the appointment starts (the old rule). Unanswered requests are
-- still declined automatically and refunded in full; the job that does it now
-- runs every 5 minutes instead of 30, so a 4pm deadline isn't missed by half
-- an hour.
--
-- The provider's request notification is written in four places
-- (handle_new_booking, claim_cart_booking_slots, finalize_checkout,
-- claim_waitlist_hold). Each is patched on its LIVE definition: an md5 guard
-- refuses if live has moved on, and every text replacement must hit exactly
-- the number of times expected or the migration stops. Only the provider's
-- title and the end of their message change.
--
-- The app's copy and the tests read the same rule from
-- src/features/bookings/requestWindow.ts.
BEGIN;

DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.process_expire_stale_pending_bookings'::regproc))
     <> 'ad8df183bddfa60b40475ee1cf164df5' THEN
    RAISE EXCEPTION 'process_expire_stale_pending_bookings changed live; rebase this migration on it';
  END IF;
END
$guard$;

-- When an unanswered request is declined. Appointment times are UK local.
CREATE OR REPLACE FUNCTION public.booking_request_deadline(
  p_created_at   TIMESTAMPTZ,
  p_booking_date DATE,
  p_booking_time TIME
)
 RETURNS TIMESTAMPTZ
 LANGUAGE sql
 STABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT CASE
    WHEN s.starts_at - INTERVAL '1 hour' <= p_created_at THEN s.starts_at
    ELSE LEAST(p_created_at + INTERVAL '24 hours', s.starts_at - INTERVAL '1 hour')
  END
  FROM (SELECT (p_booking_date + p_booking_time) AT TIME ZONE 'Europe/London' AS starts_at) s
$function$;

-- "4:00pm today", "8:00am tomorrow", "4:00pm on Friday 7th Nov 2026".
CREATE OR REPLACE FUNCTION public.format_request_answer_by(p_answer_by TIMESTAMPTZ, p_from TIMESTAMPTZ)
 RETURNS TEXT
 LANGUAGE sql
 STABLE PARALLEL SAFE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.format_notification_time((p_answer_by AT TIME ZONE 'Europe/London')::TIME) ||
    CASE (p_answer_by AT TIME ZONE 'Europe/London')::DATE - (p_from AT TIME ZONE 'Europe/London')::DATE
      WHEN 0 THEN ' today'
      WHEN 1 THEN ' tomorrow'
      ELSE ' on ' || public.format_notification_date((p_answer_by AT TIME ZONE 'Europe/London')::DATE)
    END
$function$;

-- The provider's notification title: the usual one, or an urgent one with the
-- time when the appointment, not the 24 hours, sets the deadline.
CREATE OR REPLACE FUNCTION public.booking_request_title(p_booking_id UUID, p_title TEXT)
 RETURNS TEXT
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((
    SELECT 'Urgent request: answer by ' || public.format_request_answer_by(d.answer_by, NOW())
      FROM public.bookings b
      CROSS JOIN LATERAL (
        SELECT public.booking_request_deadline(b.created_at, b.booking_date, b.booking_time) AS answer_by
      ) d
     WHERE b.id = p_booking_id
       AND d.answer_by < b.created_at + INTERVAL '24 hours'
  ), p_title)
$function$;

-- The sentence that ends the provider's request notification.
CREATE OR REPLACE FUNCTION public.booking_request_answer_note(p_booking_id UUID)
 RETURNS TEXT
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((
    SELECT CASE
      WHEN d.answer_by < b.created_at + INTERVAL '24 hours' THEN
        ' It''s short notice, so accept or decline by ' ||
        public.format_request_answer_by(d.answer_by, NOW()) ||
        ', or it''s declined automatically.'
      ELSE
        ' You have 24 hours to answer, until ' ||
        public.format_request_answer_by(d.answer_by, NOW()) ||
        '. After that it''s declined automatically.'
    END
      FROM public.bookings b
      CROSS JOIN LATERAL (
        SELECT public.booking_request_deadline(b.created_at, b.booking_date, b.booking_time) AS answer_by
      ) d
     WHERE b.id = p_booking_id
  ), '')
$function$;

REVOKE ALL ON FUNCTION public.booking_request_deadline(TIMESTAMPTZ, DATE, TIME) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.format_request_answer_by(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.booking_request_title(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.booking_request_answer_note(UUID) FROM PUBLIC, anon, authenticated;

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
         AND NOW() >= public.booking_request_deadline(created_at, booking_date, booking_time)
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

-- Replace `p_old` in `p_def` exactly `p_expected` times, or stop.
CREATE FUNCTION pg_temp.patch(p_def TEXT, p_old TEXT, p_new TEXT, p_expected INT)
 RETURNS TEXT
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_found INT := (length(p_def) - length(replace(p_def, p_old, ''))) / length(p_old);
BEGIN
  IF v_found <> p_expected THEN
    RAISE EXCEPTION 'expected % of [%], found %', p_expected, p_old, v_found;
  END IF;
  RETURN replace(p_def, p_old, p_new);
END;
$function$;

DO $patch$
DECLARE
  v_def TEXT;
  -- function, live md5, booking id expression in that function
  v_targets TEXT[][] := ARRAY[
    ARRAY['handle_new_booking',       'b8be99f748703ff0a1943b02116c8355', 'NEW.id'],
    ARRAY['claim_cart_booking_slots', 'a8530bf778ff9223c5ecca60f3690d91', 'v_claimed_id'],
    ARRAY['finalize_checkout',        'f6fb07c5ab58a93bc56f4a02b6aff974', 'v_booking.id'],
    ARRAY['claim_waitlist_hold',      '75854011e5a36e9de4097ffd68b3fd29', 'p_booking_id']
  ];
  v_name TEXT;
  v_id   TEXT;
  i INT;
BEGIN
  FOR i IN 1 .. array_length(v_targets, 1) LOOP
    v_name := v_targets[i][1];
    v_id   := v_targets[i][3];
    SELECT pg_get_functiondef(p.oid) INTO v_def
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace AND p.proname = v_name;
    IF md5(v_def) <> v_targets[i][2] THEN
      RAISE EXCEPTION '% changed live; rebase this migration on it', v_name;
    END IF;

    v_def := pg_temp.patch(v_def, '''New Booking Request''',
      format('public.booking_request_title(%s, ''New Booking Request'')', v_id), 1);

    IF v_name IN ('claim_cart_booking_slots', 'finalize_checkout') THEN
      v_def := pg_temp.patch(v_def, '''Booking Request — Outside Your Hours''',
        format('public.booking_request_title(%s, ''Booking Request — Outside Your Hours'')', v_id), 1);
      v_def := pg_temp.patch(v_def, 'then confirm or decline.''',
        format('then confirm or decline.'' || public.booking_request_answer_note(%s)', v_id), 2);
    ELSE
      v_def := pg_temp.patch(v_def, '''. Please confirm or decline.''',
        format('''. Please confirm or decline.'' || public.booking_request_answer_note(%s)', v_id), 1);
    END IF;

    EXECUTE v_def;
  END LOOP;
END
$patch$;

-- Every 5 minutes, so a deadline an hour before the appointment holds.
SELECT cron.alter_job(jobid, schedule := '*/5 * * * *')
  FROM cron.job
 WHERE jobname = 'expire-stale-pending-bookings';

DO $verify$
BEGIN
  IF (SELECT count(*) FROM pg_proc
       WHERE pronamespace = 'public'::regnamespace
         AND proname IN ('handle_new_booking', 'claim_cart_booking_slots', 'finalize_checkout', 'claim_waitlist_hold')
         AND prosrc LIKE '%booking_request_answer_note%') <> 4 THEN
    RAISE EXCEPTION 'not every request notification was patched';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-stale-pending-bookings' AND schedule = '*/5 * * * *') THEN
    RAISE EXCEPTION 'expire-stale-pending-bookings is not on its 5-minute schedule';
  END IF;
END
$verify$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261105090833', 'booking_requests_answer_by_an_hour_before')
ON CONFLICT DO NOTHING;

COMMIT;
