-- 20261109250000_release_time.sql
--
-- A monthly release opens at the provider's own time, not a fixed 09:00 UTC.
--
-- New key: providers.automation_settings.scheduleReleaseTime, 'HH:MM', UK
-- time (Europe/London). Missing or unreadable = '09:00'. No new column; the
-- app writes it through merge_provider_automation_settings like the day.
--
-- Also moves the monthly release from UTC to UK time. 09:00 UTC was 10am
-- in summer, which the app's own explainer had to apologise for ("9am (10am
-- in summer)"). In winter (now) nothing moves for anyone: 9am UK = 09:00 UTC.
-- Months are UK months too, so a midnight release on the 1st opens at UK
-- midnight rather than an hour late in summer.
--
-- Redefines, each from its live definition on 2026-11-09 (md5 guards below):
--   • provider_last_bookable_date  — release moment = day + time, UK time.
--     Read by enforce_booking_bookability (every booking), get_services_open_
--     within, the openings and fully-booked alerts; they follow with no change.
--   • provider_next_release_after — same moment, for Close Schedule's
--     "reopens on your release day".
--   • process_follow_schedule_release_nudges — UK day/month, and a UK-month
--     once-per-month guard (with a UTC guard, a midnight release on the 1st in
--     summer would have sent twice: 23:00 UTC and again after 00:00 UTC).
-- And reschedules cron job 150 from once a day at 09:00 UTC to every five
-- minutes, so the "has opened up" push lands within five minutes of the
-- provider's chosen time. The function's own guards (release day today, next
-- month really open, not already told this month) keep it to one send.
--
-- The app's copy of the rule is src/utils/bookingHorizon.ts; keep in step.
-- CREATE OR REPLACE keeps each function's existing grants.

BEGIN;

DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.provider_last_bookable_date(uuid)'::regprocedure)) <> 'ca8c8d4cd0c30698a78d9c1e48926b99' THEN
    RAISE EXCEPTION 'provider_last_bookable_date changed since this was written; rebuild it from the live definition';
  END IF;
  IF md5(pg_get_functiondef('public.provider_next_release_after(uuid, timestamp with time zone)'::regprocedure)) <> '4b3f788c1eebee4e8e2e3f035f909329' THEN
    RAISE EXCEPTION 'provider_next_release_after changed since this was written; rebuild it from the live definition';
  END IF;
  IF md5(pg_get_functiondef('public.process_follow_schedule_release_nudges()'::regprocedure)) <> 'b40e34854d7e1b1098b732596bff4ef2' THEN
    RAISE EXCEPTION 'process_follow_schedule_release_nudges changed since this was written; rebuild it from the live definition';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobid = 150 AND jobname = 'provider-follow-schedule-release-nudges') THEN
    RAISE EXCEPTION 'cron job 150 is not the release-nudge job any more';
  END IF;
END
$guard$;

-- The stored release time, or 09:00. Regex before cast inside CASE: Postgres
-- doesn't promise a WHERE/AND runs the regex first.
CREATE OR REPLACE FUNCTION public.provider_release_time(p_automation_settings jsonb)
 RETURNS time
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN (p_automation_settings->>'scheduleReleaseTime') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      THEN (p_automation_settings->>'scheduleReleaseTime')::time
    ELSE TIME '09:00'
  END;
$function$;

REVOKE ALL ON FUNCTION public.provider_release_time(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.provider_last_bookable_date(p_provider_id uuid)
 RETURNS date
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH p AS (
    SELECT
      pr.booking_window_days,
      -- {1,2}: Postgres doesn't promise the regex runs before the cast, so a
      -- long digit string could overflow ::int and fail every booking.
      CASE WHEN (pr.automation_settings->>'scheduleReleaseDay') ~ '^[0-9]{1,2}$'
            AND (pr.automation_settings->>'scheduleReleaseDay')::int BETWEEN 1 AND 31
           THEN (pr.automation_settings->>'scheduleReleaseDay')::int
      END AS release_day,
      public.provider_release_time(pr.automation_settings) AS release_time,
      -- A UK month, and a UK wall-clock release time (20261109250000).
      date_trunc('month', now() AT TIME ZONE 'Europe/London')::date AS month_start
    FROM public.providers pr
    WHERE pr.id = p_provider_id
  )
  SELECT CASE
    WHEN p.release_day IS NOT NULL THEN
      CASE
        WHEN now() >=
             ((p.month_start
               + (LEAST(p.release_day, EXTRACT(DAY FROM (p.month_start + INTERVAL '1 month - 1 day'))::int) - 1)
               + p.release_time) AT TIME ZONE 'Europe/London')
          THEN (p.month_start + INTERVAL '2 months - 1 day')::date
        ELSE (p.month_start + INTERVAL '1 month - 1 day')::date
      END
    WHEN COALESCE(p.booking_window_days, 60) > 0 THEN CURRENT_DATE + COALESCE(p.booking_window_days, 60)
    ELSE NULL
  END
  FROM p;
$function$;

CREATE OR REPLACE FUNCTION public.provider_next_release_after(p_provider_id uuid, p_after timestamp with time zone)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH p AS (
    -- CASE, not WHERE: Postgres doesn't promise the regex runs before the cast.
    SELECT CASE WHEN (pr.automation_settings->>'scheduleReleaseDay') ~ '^[0-9]{1,2}$'
                 AND (pr.automation_settings->>'scheduleReleaseDay')::int BETWEEN 1 AND 31
                THEN (pr.automation_settings->>'scheduleReleaseDay')::int
           END AS release_day,
           public.provider_release_time(pr.automation_settings) AS release_time,
           date_trunc('month', p_after AT TIME ZONE 'Europe/London')::date AS month_start
      FROM public.providers pr
     WHERE pr.id = p_provider_id
  ),
  moments AS (
    SELECT ((m.month_start
             + (LEAST(p.release_day, EXTRACT(DAY FROM (m.month_start + INTERVAL '1 month - 1 day'))::int) - 1)
             + p.release_time) AT TIME ZONE 'Europe/London') AS at
      FROM p
      CROSS JOIN LATERAL (VALUES (p.month_start), ((p.month_start + INTERVAL '1 month')::date)) AS m(month_start)
     WHERE p.release_day IS NOT NULL
  )
  SELECT min(at) FROM moments WHERE at > p_after;
$function$;

CREATE OR REPLACE FUNCTION public.process_follow_schedule_release_nudges()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r RECORD;
  -- All in UK time (20261109250000), like provider_last_bookable_date.
  v_uk_now TIMESTAMP := now() AT TIME ZONE 'Europe/London';
  v_month_start DATE := date_trunc('month', v_uk_now)::date;
  v_last_day_of_month INT := EXTRACT(DAY FROM (v_month_start + INTERVAL '1 month - 1 day'))::INT;
  v_today INT := EXTRACT(DAY FROM v_uk_now)::INT;
  v_next_month_start DATE := (v_month_start + INTERVAL '1 month')::date;
  v_next_month_name TEXT := to_char(v_month_start + INTERVAL '1 month', 'FMMonth');
  -- The instant this UK month began: "already told this month" means since then.
  v_month_began TIMESTAMPTZ := v_month_start::timestamp AT TIME ZONE 'Europe/London';
BEGIN
  FOR r IN
    SELECT
      f.id AS follow_id,
      f.user_id,
      f.provider_id,
      p.display_name
    FROM public.provider_follows f
    JOIN public.providers p ON p.id = f.provider_id
    WHERE f.notify_enabled = TRUE
      AND p.has_gone_live = TRUE
      AND p.is_active = TRUE
      AND (p.automation_settings->>'scheduleReleaseDay') ~ '^[0-9]{1,2}$'
      AND LEAST((p.automation_settings->>'scheduleReleaseDay')::INT, v_last_day_of_month) = v_today
      AND (f.last_notified_at IS NULL OR f.last_notified_at < v_month_began)
      -- Say "released" only once next month really is bookable: that happens
      -- at the provider's release time, and this runs every five minutes.
      AND public.provider_last_bookable_date(p.id) >= v_next_month_start
      -- A provider who chose to stay closed past their release day has opened
      -- nothing, so "Get booking now" wouldn't be true.
      AND NOT public.provider_schedule_is_closed(p.id)
  LOOP
    UPDATE public.provider_follows
       SET last_notified_at = NOW()
     WHERE id = r.follow_id
       AND (last_notified_at IS NULL OR last_notified_at < v_month_began);
    IF NOT FOUND THEN CONTINUE; END IF;

    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, provider_id, metadata)
    VALUES (
      r.user_id,
      'announcement',
      -- Wording chosen by the user (2026-10-29).
      COALESCE(r.display_name, 'Your provider') || ' — ' || v_next_month_name || ' has opened up',
      v_next_month_name || ' has opened up with ' || COALESCE(r.display_name, 'your provider') || '. Get booking now.',
      'low',
      TRUE,
      r.provider_id,
      jsonb_build_object('kind', 'follow_schedule_release_nudge')
    );
  END LOOP;
END;
$function$;

SELECT cron.alter_job(150, schedule := '*/5 * * * *');

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261109250000', 'release_time')
ON CONFLICT (version) DO NOTHING;

COMMIT;
