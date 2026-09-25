-- replace_provider_weekly_schedule(): a provider's whole weekly schedule -- the
-- legacy day rows in provider_availability AND the v2 working windows in
-- provider_availability_windows -- written in ONE transaction, so a dropped
-- connection can never leave new day rows over old windows (or no windows).
--
-- APPLIED LIVE: recorded as 20260901021349 (atomic_provider_weekly_schedule),
-- then corrected by 20260901170907 (fix_replace_provider_weekly_schedule_ordinality_syntax),
-- which swapped the WITH ORDINALITY overlap check for row_number() OVER ().
-- This file is the live definition as of 2026-09-25 (copied from
-- pg_get_functiondef, not from the earlier draft of this file), so a fresh
-- environment rebuilt from these files matches production.
--
-- SECURITY INVOKER is the default and pg_get_functiondef does not print it;
-- it is spelled out here because it is the point: the provider's own RLS on
-- both tables still decides what they may write.
--
-- History: the app called this before it was applied, every save failed with
-- "function not found", and the call was backed out (2026-08-26). The function
-- has been live since 2026-09-01; saveProviderWeeklySchedule() calls it again.

CREATE OR REPLACE FUNCTION public.replace_provider_weekly_schedule(
  p_provider_id uuid,
  p_days jsonb,
  p_windows jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF jsonb_typeof(p_days) <> 'array' OR jsonb_typeof(p_windows) <> 'array' THEN
    RAISE EXCEPTION 'schedule payloads must be arrays';
  END IF;

  IF jsonb_array_length(p_days) <> 7 OR (
    SELECT count(DISTINCT d.day_of_week)
    FROM jsonb_to_recordset(p_days) AS d(day_of_week integer)
  ) <> 7 THEN
    RAISE EXCEPTION 'weekly schedule must contain each day exactly once';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_days) AS d(
      day_of_week integer, open_time time, close_time time, is_closed boolean
    )
    WHERE d.day_of_week NOT BETWEEN 0 AND 6
       OR (NOT d.is_closed AND d.open_time >= d.close_time)
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_windows) AS w(
      day_of_week integer, start_time time, end_time time
    )
    WHERE w.day_of_week NOT BETWEEN 0 AND 6 OR w.start_time >= w.end_time
  ) OR EXISTS (
    SELECT 1
    FROM (
      SELECT day_of_week, start_time, end_time, row_number() OVER () AS rn
      FROM jsonb_to_recordset(p_windows) AS w(day_of_week integer, start_time time, end_time time)
    ) a
    JOIN (
      SELECT day_of_week, start_time, end_time, row_number() OVER () AS rn
      FROM jsonb_to_recordset(p_windows) AS w(day_of_week integer, start_time time, end_time time)
    ) b ON a.day_of_week = b.day_of_week AND a.rn < b.rn
    WHERE a.start_time < b.end_time AND a.end_time > b.start_time
  ) THEN
    RAISE EXCEPTION 'invalid weekly schedule';
  END IF;

  INSERT INTO public.provider_availability (
    provider_id, day_of_week, open_time, close_time, is_closed
  )
  SELECT p_provider_id, d.day_of_week, d.open_time, d.close_time, d.is_closed
  FROM jsonb_to_recordset(p_days) AS d(
    day_of_week integer, open_time time, close_time time, is_closed boolean
  )
  ON CONFLICT (provider_id, day_of_week) DO UPDATE
  SET open_time = EXCLUDED.open_time,
      close_time = EXCLUDED.close_time,
      is_closed = EXCLUDED.is_closed;

  DELETE FROM public.provider_availability_windows
  WHERE provider_id = p_provider_id;

  INSERT INTO public.provider_availability_windows (
    provider_id, day_of_week, start_time, end_time
  )
  SELECT p_provider_id, w.day_of_week, w.start_time, w.end_time
  FROM jsonb_to_recordset(p_windows) AS w(
    day_of_week integer, start_time time, end_time time
  );
END;
$function$;

-- Live grants: postgres, service_role, authenticated. No PUBLIC, no anon.
REVOKE ALL ON FUNCTION public.replace_provider_weekly_schedule(uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_provider_weekly_schedule(uuid, jsonb, jsonb) TO authenticated;
