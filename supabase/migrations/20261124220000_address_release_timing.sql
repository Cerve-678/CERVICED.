-- The address reaches a client on time, whenever the booking was made.
--
-- 1. Booking dates and times are UK wall-clock time, but the timed release
--    ("day before", "two days before" and so on) read them as UTC, so during
--    British Summer Time every timed release, and its notification, came an
--    hour late. is_address_released and process_address_release_notifications
--    now read them as Europe/London.
-- 2. A booking confirmed after its timed release moment had already passed (a
--    last-minute booking, or a waitlist slot taken the day before) showed the
--    address in the app but waited up to an hour for the release job to stamp
--    it and send "address released". auto_release_address now releases and
--    notifies it as soon as it's confirmed, the same as "on confirmation".
-- 3. The release job runs every 10 minutes instead of hourly, so a timed
--    release lands within 10 minutes of its moment.
--
-- The user's call, 2026-11-24. Each function is rebuilt from its live
-- definition, guarded by md5 so a newer version is never overwritten.

BEGIN;

DO $$
BEGIN
  IF (SELECT md5(pg_get_functiondef('public.is_address_released(text,text,timestamp with time zone,date,time without time zone)'::regprocedure)))
     <> '5873f9644f441e8a34bae18a1785766e' THEN
    RAISE EXCEPTION 'is_address_released changed live since this migration was written';
  END IF;
  IF (SELECT md5(pg_get_functiondef('public.auto_release_address()'::regprocedure)))
     <> 'a3e51cbb9e473508f5297cc46c6eaff1' THEN
    RAISE EXCEPTION 'auto_release_address changed live since this migration was written';
  END IF;
  IF (SELECT md5(pg_get_functiondef('public.process_address_release_notifications()'::regprocedure)))
     <> 'e9e4525f29d0a150bf6d7f63265bb95a' THEN
    RAISE EXCEPTION 'process_address_release_notifications changed live since this migration was written';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.is_address_released(p_status text, p_policy text, p_released_at timestamp with time zone, p_booking_date date, p_booking_time time without time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    -- A concrete release timestamp (manual release, or the on_confirmation
    -- trigger) always wins.
    WHEN p_released_at IS NOT NULL THEN TRUE
    WHEN p_policy = 'always' THEN TRUE
    WHEN p_policy = 'on_confirmation'
      THEN p_status IN ('confirmed', 'in_progress', 'completed')
    -- Time-based: released once we are within N hours of the appointment.
    -- Wall-clock time is interpreted as UTC (the app has no per-provider tz yet).
    WHEN p_policy IN ('day_before','two_days_before','three_days_before','five_days_before','week_before')
      THEN now() >= ((p_booking_date + p_booking_time) AT TIME ZONE 'Europe/London') - (
        CASE p_policy
          WHEN 'day_before'        THEN INTERVAL '24 hours'
          WHEN 'two_days_before'   THEN INTERVAL '48 hours'
          WHEN 'three_days_before' THEN INTERVAL '72 hours'
          WHEN 'five_days_before'  THEN INTERVAL '120 hours'
          WHEN 'week_before'       THEN INTERVAL '168 hours'
        END
      )
    -- 'manual', NULL, or unknown → only the explicit timestamp (handled above).
    ELSE FALSE
  END;
$function$;

CREATE OR REPLACE FUNCTION public.process_address_release_notifications()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r        RECORD;
  v_hours  INT;
BEGIN
  FOR r IN
    SELECT
      b.id                    AS booking_id,
      b.booking_date,
      b.booking_time,
      p.address_release_policy
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
    WHERE b.status IN ('confirmed', 'in_progress')
      AND b.address_released_at IS NULL
      AND p.address_release_policy IN (
        'day_before', 'two_days_before', 'three_days_before',
        'five_days_before', 'week_before'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
         WHERE n.booking_id = b.id
           AND n.type       = 'address_released'
      )
  LOOP
    v_hours := CASE r.address_release_policy
      WHEN 'day_before'        THEN 24
      WHEN 'two_days_before'   THEN 48
      WHEN 'three_days_before' THEN 72
      WHEN 'five_days_before'  THEN 120
      WHEN 'week_before'       THEN 168
      ELSE NULL
    END;

    CONTINUE WHEN v_hours IS NULL;

    CONTINUE WHEN now() < (
      (r.booking_date::TIMESTAMP + r.booking_time) AT TIME ZONE 'Europe/London'
      - (v_hours || ' hours')::INTERVAL
    );

    UPDATE public.bookings
       SET address_released_at = NOW()
     WHERE id = r.booking_id AND address_released_at IS NULL;

    PERFORM public.notify_address_released(r.booking_id);
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_release_address()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_released BOOLEAN := FALSE;
BEGIN
  IF NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM 'confirmed' THEN
    UPDATE public.bookings
       SET address_released_at = NOW()
     WHERE id = NEW.id
       AND address_released_at IS NULL
       AND EXISTS (
         SELECT 1 FROM public.providers p
          WHERE p.id = NEW.provider_id
            AND (p.address_release_policy = 'on_confirmation'
                 -- A timed release ("day before" and so on) whose moment has
                 -- already passed by the time the booking is confirmed: a
                 -- last-minute or waitlist booking. Released and notified now,
                 -- not at the next run of the release job.
                 OR (p.address_release_policy IN ('day_before', 'two_days_before', 'three_days_before',
                                                  'five_days_before', 'week_before')
                     AND public.is_address_released('confirmed', p.address_release_policy, NULL,
                                                    NEW.booking_date, NEW.booking_time)))
       );

    GET DIAGNOSTICS v_released = ROW_COUNT;

    IF v_released THEN
      PERFORM public.notify_address_released(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'address-release-notifications'),
  schedule => '*/10 * * * *'
);

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261124220000', 'address_release_timing');

COMMIT;
