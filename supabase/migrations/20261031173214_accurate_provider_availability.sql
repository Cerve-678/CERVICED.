-- Search and Home must only call a provider available when a real ordinary
-- booking slot exists. The old 70%-booked-minutes heuristic could mark a
-- fragmented or fully occupied diary as available. This batched RPC instead
-- evaluates the same ingredients as the picker: published hours and
-- overrides, blocked days, booking window, minimum notice, each active
-- service's duration/buffers, and buffer-padded live bookings.
DROP FUNCTION IF EXISTS public.get_providers_availability(text[], text);

CREATE FUNCTION public.get_providers_availability(p_slugs text[], p_hair_type text DEFAULT NULL)
RETURNS TABLE(
  slug text,
  status text,
  hair_match boolean,
  available_today boolean,
  available_tomorrow boolean,
  available_this_week boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
WITH listed AS (
  SELECT p.id, p.slug, p.hair_types_catered,
         coalesce(p.booking_window_days, 60) AS booking_window_days,
         coalesce(p.slot_interval_mins, 60) AS slot_interval_mins,
         coalesce(p.buffer_mins, 0) AS buffer_mins,
         coalesce(p.min_booking_notice_hrs, 0) AS min_booking_notice_hrs
  FROM public.providers p
  WHERE p.slug = ANY(p_slugs)
    AND p.has_gone_live = true
    AND p.is_active = true
),
clock AS (
  SELECT (now() AT TIME ZONE 'Europe/London') AS local_now
),
days AS (
  SELECT d::date AS day, extract(dow FROM d)::integer AS dow
  FROM generate_series(current_date, current_date + 6, interval '1 day') AS d
),
-- An ordinary (not by-request) candidate may use any active service. Every
-- service carries its own duration and buffer overrides, so a quick service
-- can honestly make a provider available even when a longer one cannot fit.
service_options AS (
  SELECT s.provider_id, s.duration_minutes,
         coalesce(s.buffer_before_mins, 0) AS buffer_before_mins,
         coalesce(s.buffer_after_mins, l.buffer_mins) AS buffer_after_mins
  FROM public.services s
  JOIN listed l ON l.id = s.provider_id
  WHERE s.is_active = true
),
schedule_windows AS (
  SELECT l.id AS provider_id, d.day, w.start_time, w.end_time
  FROM listed l
  CROSS JOIN days d
  CROSS JOIN LATERAL (
    -- A closed override or blocked day deliberately produces no window.
    SELECT o.start_time, o.end_time
    FROM public.provider_availability_overrides o
    WHERE o.provider_id = l.id AND o.availability_date = d.day
      AND o.is_closed = false AND o.start_time IS NOT NULL AND o.end_time IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.provider_blocked_dates bd
        WHERE bd.provider_id = l.id AND bd.blocked_date = d.day
      )
    UNION ALL
    SELECT w2.start_time, w2.end_time
    FROM public.provider_availability_windows w2
    WHERE w2.provider_id = l.id AND w2.day_of_week = d.dow
      AND NOT EXISTS (
        SELECT 1 FROM public.provider_availability_overrides o
        WHERE o.provider_id = l.id AND o.availability_date = d.day
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.provider_blocked_dates bd
        WHERE bd.provider_id = l.id AND bd.blocked_date = d.day
      )
    UNION ALL
    SELECT a.open_time, a.close_time
    FROM public.provider_availability a
    WHERE a.provider_id = l.id AND a.day_of_week = d.dow AND a.is_closed = false
      AND NOT EXISTS (
        SELECT 1 FROM public.provider_availability_overrides o
        WHERE o.provider_id = l.id AND o.availability_date = d.day
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.provider_availability_windows w2
        WHERE w2.provider_id = l.id AND w2.day_of_week = d.dow
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.provider_blocked_dates bd
        WHERE bd.provider_id = l.id AND bd.blocked_date = d.day
      )
  ) w
),
candidates AS (
  SELECT l.id AS provider_id, sw.day,
         sw.day + make_interval(mins => slot_minute) AS starts_at,
         sw.day + make_interval(mins => slot_minute + so.duration_minutes) AS ends_at,
         so.buffer_before_mins, so.buffer_after_mins
  FROM listed l
  JOIN schedule_windows sw ON sw.provider_id = l.id
  JOIN service_options so ON so.provider_id = l.id
  CROSS JOIN clock c
  CROSS JOIN LATERAL generate_series(
    extract(epoch FROM sw.start_time)::integer / 60,
    (extract(epoch FROM sw.end_time)::integer / 60) - so.duration_minutes,
    CASE WHEN l.slot_interval_mins IN (15, 30, 60) THEN l.slot_interval_mins ELSE 60 END
  ) AS slot_minute
  WHERE l.booking_window_days <= 0 OR sw.day <= current_date + l.booking_window_days
    AND sw.day + make_interval(mins => slot_minute) >= c.local_now + make_interval(hours => l.min_booking_notice_hrs)
),
bookable_slots AS (
  SELECT c.provider_id, c.day
  FROM candidates c
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.provider_id = c.provider_id
      AND b.booking_date = c.day
      AND b.status IN ('pending', 'confirmed', 'in_progress', 'on_hold')
      AND coalesce(b.effective_start, b.booking_date + b.booking_time)
            < c.ends_at + make_interval(mins => c.buffer_after_mins)
      AND coalesce(b.effective_end, b.booking_date + coalesce(b.end_time, b.booking_time + interval '1 hour'))
            > c.starts_at - make_interval(mins => c.buffer_before_mins)
  )
),
counts AS (
  SELECT provider_id,
         count(*) AS slot_count,
         bool_or(day = current_date) AS today,
         bool_or(day = current_date + 1) AS tomorrow,
         bool_or(day BETWEEN current_date AND current_date + 6) AS this_week
  FROM bookable_slots
  GROUP BY provider_id
)
SELECT l.slug,
  CASE
    WHEN coalesce(c.slot_count, 0) >= 3 THEN 'available'
    WHEN coalesce(c.slot_count, 0) > 0 THEN 'limited'
    ELSE 'none'
  END AS status,
  CASE
    WHEN p_hair_type IS NULL THEN true
    WHEN l.hair_types_catered IS NULL OR array_length(l.hair_types_catered, 1) IS NULL THEN true
    ELSE p_hair_type = ANY(l.hair_types_catered)
  END AS hair_match,
  coalesce(c.today, false) AS available_today,
  coalesce(c.tomorrow, false) AS available_tomorrow,
  coalesce(c.this_week, false) AS available_this_week
FROM listed l
LEFT JOIN counts c ON c.provider_id = l.id;
$function$;

REVOKE ALL ON FUNCTION public.get_providers_availability(text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_providers_availability(text[], text) TO authenticated, service_role;
