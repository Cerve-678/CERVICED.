-- APPLIED 2026-09-01 (recorded version 20260901021349, renamed from its
-- authored 20260826110000 per the standing gotcha).
--
-- This defines replace_provider_weekly_schedule(). Parked on 2026-08-26
-- pending the provider terms & policy work — that work has since shipped
-- (T&Cs are a form of their own, not a providers column; policy editing
-- moved to Business Profile's PoliciesScreen), so this was applied and
-- saveProviderWeeklySchedule in src/services/databaseService.ts now calls
-- the RPC instead of doing the two writes non-atomically.
--
-- AS-WRITTEN BELOW, THIS BODY IS BROKEN: the windows self-overlap check uses
-- `jsonb_to_recordset(...) WITH ORDINALITY AS a(col defs)`, which is not
-- valid Postgres syntax outside ROWS FROM(...) and throws
-- "WITH ORDINALITY cannot be used with a column definition list" on every
-- single call, for any input. Caught by functional verification immediately
-- after applying, before the app was wired to call it. Fixed by
-- 20260901170907_fix_replace_provider_weekly_schedule_ordinality_syntax.sql,
-- applied straight after — kept as a separate file rather than edited in
-- place here, matching how this repo already handles a defect found only
-- after applying (see the 2026-08-31 hair-type-match entry in
-- supabase/MIGRATION_OWNER.md for the same two-file pattern). Read this file
-- for history only; the live function is the fix file's body.

CREATE OR REPLACE FUNCTION public.replace_provider_weekly_schedule(
  p_provider_id uuid,
  p_days jsonb,
  p_windows jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
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
    FROM jsonb_to_recordset(p_windows) WITH ORDINALITY AS a(
      day_of_week integer, start_time time, end_time time, row_number bigint
    )
    JOIN jsonb_to_recordset(p_windows) WITH ORDINALITY AS b(
      day_of_week integer, start_time time, end_time time, row_number bigint
    ) ON a.day_of_week = b.day_of_week AND a.row_number < b.row_number
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
$$;

REVOKE ALL ON FUNCTION public.replace_provider_weekly_schedule(uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_provider_weekly_schedule(uuid, jsonb, jsonb) TO authenticated;
