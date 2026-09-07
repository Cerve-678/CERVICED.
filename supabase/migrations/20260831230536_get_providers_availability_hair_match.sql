-- Folds providers.hair_types_catered matching into get_providers_availability
-- so Search's availability RPC and its separate hair-type lookup
-- (getProviderHairTypeMatches) stop being two round trips over the same
-- providers rows, filtered by the same slug/id set, behind the same
-- has_gone_live/is_active gate. Same shape as the earlier
-- getProviderPriceRanges + getProviderAudienceMatches -> getProviderServiceFacets
-- combine, applied to the `providers` table + RPC path instead of `services`.
--
-- p_hair_type is optional (default NULL) so existing callers that only want
-- availability keep working unchanged; hair_match is `true` for every row
-- when no hair type was requested. When one is requested, the match rule is
-- exactly matchesHairType() (src/utils/hairTypeMatch.ts): an empty/null
-- hair_types_catered means "caters to all" and matches everything, otherwise
-- the requested type must be present in the array.
--
-- CREATE OR REPLACE cannot add an output column to an existing table
-- function, hence the explicit DROP first.
DROP FUNCTION IF EXISTS public.get_providers_availability(text[]);

CREATE FUNCTION public.get_providers_availability(p_slugs text[], p_hair_type text DEFAULT NULL)
 RETURNS TABLE(slug text, status text, hair_match boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
WITH listed AS (
  SELECT p.id, p.slug, p.hair_types_catered
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
  END AS status,
  -- Same empty-means-all rule as matchesHairType() in
  -- src/utils/hairTypeMatch.ts. `true` when no hair type was requested at
  -- all, so existing (p_slugs)-only callers see every row match.
  CASE
    WHEN p_hair_type IS NULL THEN TRUE
    WHEN l.hair_types_catered IS NULL OR array_length(l.hair_types_catered, 1) IS NULL THEN TRUE
    ELSE p_hair_type = ANY(l.hair_types_catered)
  END AS hair_match
FROM listed l
LEFT JOIN rolled r ON r.provider_id = l.id;
$function$;

-- DROP wipes prior grants; live grants before this migration were
-- authenticated + service_role only (anon was revoked in the 2026-08-20
-- hardening pass) — restore exactly that, not a wider set.
GRANT EXECUTE ON FUNCTION public.get_providers_availability(text[], text) TO authenticated, service_role;
