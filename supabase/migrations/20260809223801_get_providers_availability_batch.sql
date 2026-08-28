-- Batched, coarse near-term availability for a set of providers, keyed by
-- slug, in a single query — the search grid needs one status per card and
-- must not fire the per-provider AvailabilityService.getAvailabilitySummary
-- (5+ queries each) in an N+1 loop.
--
-- This returns the SAME day-level approximation getAvailabilitySummary uses
-- for its at-a-glance dot ('open' when booked minutes < open minutes, 'full'
-- otherwise) — explicitly a coarse signal for display, NEVER a booking gate.
-- The real slot simulation still owns anything that actually books time.
--
-- Status per provider over the next 7 days (today .. today+6):
--   'available' — at least one working day with headroom (booked < 70% open)
--   'limited'   — has working day(s) but every open day is >=70% consumed
--   'none'      — no working/openable day in the window (all closed/blocked/
--                 fully booked), or no schedule published at all
--
-- has_gone_live + is_active gated (client-facing). SECURITY DEFINER so it can
-- read schedule/booking rows behind RLS, but it only ever emits a coarse
-- status string — no private fields, no booking details — for publicly
-- listed providers.
CREATE OR REPLACE FUNCTION public.get_providers_availability(p_slugs text[])
RETURNS TABLE(slug text, status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
WITH listed AS (
  SELECT p.id, p.slug
  FROM public.providers p
  WHERE p.slug = ANY(p_slugs)
    AND p.has_gone_live = TRUE
    AND p.is_active = TRUE
),
-- The 7-day window, as concrete dates + their day_of_week (0=Sun .. 6=Sat).
days AS (
  SELECT d::date AS day, EXTRACT(DOW FROM d)::int AS dow
  FROM generate_series(CURRENT_DATE, CURRENT_DATE + 6, INTERVAL '1 day') AS d
),
-- Working minutes per (provider, day), taking the newer availability_windows
-- table when present and falling back to the legacy provider_availability
-- open/close row otherwise — the same precedence resolveWorkingWindows uses.
-- Overrides that close a specific date zero it out; blocked dates zero it out.
base_windows AS (
  SELECT l.id AS provider_id, dd.day,
    COALESCE(
      (SELECT SUM(GREATEST(0, EXTRACT(EPOCH FROM (w.end_time - w.start_time)) / 60))
         FROM public.provider_availability_windows w
        WHERE w.provider_id = l.id AND w.day_of_week = dd.dow),
      (SELECT SUM(GREATEST(0, EXTRACT(EPOCH FROM (a.close_time - a.open_time)) / 60))
         FROM public.provider_availability a
        WHERE a.provider_id = l.id AND a.day_of_week = dd.dow AND a.is_closed = FALSE),
      0
    ) AS open_minutes
  FROM listed l
  CROSS JOIN days dd
),
-- Apply date-specific overrides + blocked dates on top of the weekly pattern.
open_minutes AS (
  SELECT bw.provider_id, bw.day,
    CASE
      WHEN EXISTS (SELECT 1 FROM public.provider_blocked_dates bd
                    WHERE bd.provider_id = bw.provider_id AND bd.blocked_date = bw.day)
        THEN 0
      WHEN EXISTS (SELECT 1 FROM public.provider_availability_overrides o
                    WHERE o.provider_id = bw.provider_id AND o.availability_date = bw.day
                      AND o.is_closed = TRUE)
        THEN 0
      -- An open-override with explicit hours replaces the weekly minutes.
      WHEN EXISTS (SELECT 1 FROM public.provider_availability_overrides o
                    WHERE o.provider_id = bw.provider_id AND o.availability_date = bw.day
                      AND o.is_closed = FALSE AND o.start_time IS NOT NULL AND o.end_time IS NOT NULL)
        THEN (SELECT SUM(GREATEST(0, EXTRACT(EPOCH FROM (o.end_time - o.start_time)) / 60))
                FROM public.provider_availability_overrides o
               WHERE o.provider_id = bw.provider_id AND o.availability_date = bw.day
                 AND o.is_closed = FALSE AND o.start_time IS NOT NULL AND o.end_time IS NOT NULL)
      ELSE bw.open_minutes
    END AS open_minutes
  FROM base_windows bw
),
-- Booked minutes per (provider, day) from live occupying bookings. Spans
-- arrive already buffer-padded from the same source get_provider_busy_spans
-- reads; we only sum durations here, never re-pad.
booked AS (
  SELECT b.provider_id, b.booking_date AS day,
    SUM(GREATEST(0, EXTRACT(EPOCH FROM (
      LEAST(COALESCE(b.effective_end, b.booking_date + COALESCE(b.end_time, b.booking_time + INTERVAL '1 hour')),
            b.booking_date::timestamp + INTERVAL '1 day' - INTERVAL '1 second')
      - GREATEST(COALESCE(b.effective_start, b.booking_date + b.booking_time),
                 b.booking_date::timestamp)
    )) / 60)) AS booked_minutes
  FROM public.bookings b
  JOIN listed l ON l.id = b.provider_id
  WHERE b.booking_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 6
    AND b.status IN ('pending', 'confirmed', 'in_progress', 'on_hold')
  GROUP BY b.provider_id, b.booking_date
),
per_day AS (
  SELECT om.provider_id, om.day, om.open_minutes,
    COALESCE(bk.booked_minutes, 0) AS booked_minutes
  FROM open_minutes om
  LEFT JOIN booked bk ON bk.provider_id = om.provider_id AND bk.day = om.day
),
rolled AS (
  SELECT provider_id,
    -- A day is "openable with headroom" when it has working minutes and
    -- bookings consume < 70% of them.
    BOOL_OR(open_minutes > 0 AND booked_minutes < open_minutes * 0.70) AS has_headroom,
    BOOL_OR(open_minutes > 0) AS has_any_open_day
  FROM per_day
  GROUP BY provider_id
)
SELECT l.slug,
  CASE
    WHEN r.has_headroom THEN 'available'
    WHEN r.has_any_open_day THEN 'limited'
    ELSE 'none'
  END AS status
FROM listed l
LEFT JOIN rolled r ON r.provider_id = l.id;
$function$;

-- Client-facing read; authenticated users only (no anon). Coarse status only.
REVOKE ALL ON FUNCTION public.get_providers_availability(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_providers_availability(text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_providers_availability(text[]) TO authenticated;;
