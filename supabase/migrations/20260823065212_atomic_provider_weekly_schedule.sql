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
