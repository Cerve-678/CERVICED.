-- APPLIED LIVE 2026-09-25 as 20260925221735 (get_services_availability). Verified
-- after applying: ACL is postgres/service_role/authenticated only (no anon, no
-- PUBLIC), SECURITY DEFINER with search_path pinned, and a call over all 56 live
-- services ran in ~108 ms. Before applying it was checked against 15 constructed
-- scenarios (bookings, live and expired holds, blocked dates, closed and open
-- overrides, exact-fit and just-too-long boundaries, service buffers) in a
-- rolled-back transaction.
--
-- get_services_availability(): "does THIS service have an open slot this week?",
-- batched over many services in one call, for Search's "Available now" filter.
--
-- Why it exists: get_providers_availability answers a PROVIDER-level question
-- (does this diary have headroom?) that ignores how long the service takes, so
-- Search could show a provider as available "now" on the strength of a gap too
-- short for the very service the client filtered for. Combined filters must be
-- true of ONE service, and availability has to be too.
--
-- It is a port of the app's own slot rules, not a new heuristic. The reference
-- is AvailabilityService.hasNearTermAvailabilityForServices, and this follows it
-- step for step:
--   * working windows: a closed override wins; else open overrides; else the
--     weekly windows; else the legacy day row (resolveWorkingWindows). Blocked
--     dates are skipped outright.
--   * candidate slots start at a window's opening and step by the provider's
--     slot_interval_mins (15/30/60, anything else means 60), and a slot must
--     end inside its window.
--   * a slot must start no earlier than now + min_booking_notice_hrs.
--   * the service's own buffers pad the slot: before = buffer_before_mins
--     (NULL = 0), after = buffer_after_mins (NULL = the provider's buffer_mins).
--   * it must not overlap any taken span. Taken spans are exactly what
--     get_provider_busy_spans returns: pending/confirmed/in_progress/on_hold
--     bookings, already padded, minus lapsed holds and minus the caller's own
--     cart hold.
--   * the horizon is 7 days, capped by the provider's booking_window_days
--     (0 = no cap).
--
-- Deliberately NOT ported: request-outside-hours / short-notice / beyond-window
-- request modes. Those let a client ASK for a time the diary doesn't offer; they
-- are not open slots, so they don't make a provider "available now".
--
-- "Today" and "now" are London wall-clock time: the bookings, windows and
-- overrides are all stored as local dates/times, and the database clock is UTC,
-- which would be an hour out for half the year. This is a UK marketplace; if
-- providers ever get their own timezone, read it here instead.
--
-- Same access rules as get_providers_availability: SECURITY DEFINER because a
-- client cannot read other people's bookings under RLS, gated to providers that
-- are live and active, executable by authenticated + service_role only.
-- At most 300 services are considered per call; callers chunk larger sets.

CREATE OR REPLACE FUNCTION public.get_services_availability(p_service_ids uuid[])
 RETURNS TABLE(service_id uuid, has_slot boolean, next_available date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
WITH clock AS (
  SELECT (now() AT TIME ZONE 'Europe/London') AS local_now
),
svc AS (
  SELECT
    s.id,
    s.provider_id,
    s.duration_minutes AS dur,
    COALESCE(s.buffer_before_mins, 0) AS buf_before,
    COALESCE(s.buffer_after_mins, p.buffer_mins, 0) AS buf_after,
    CASE WHEN p.slot_interval_mins IN (15, 30, 60) THEN p.slot_interval_mins ELSE 60 END AS step,
    COALESCE(p.min_booking_notice_hrs, 0) AS notice_hrs,
    CASE
      WHEN COALESCE(p.booking_window_days, 60) > 0 THEN LEAST(7, COALESCE(p.booking_window_days, 60))
      ELSE 7
    END AS horizon
  FROM public.services s
  JOIN public.providers p ON p.id = s.provider_id
  WHERE s.id = ANY(p_service_ids[1:300])
    AND s.is_active = TRUE
    AND p.has_gone_live = TRUE
    AND p.is_active = TRUE
),
-- One row per (service, calendar day) inside its horizon, minus blocked dates.
svc_days AS (
  SELECT sv.id AS service_id, sv.provider_id,
         (c.local_now::date + g.n) AS day,
         EXTRACT(DOW FROM (c.local_now::date + g.n))::int AS dow
  FROM svc sv
  CROSS JOIN clock c
  CROSS JOIN LATERAL generate_series(0, sv.horizon - 1) AS g(n)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.provider_blocked_dates bd
    WHERE bd.provider_id = sv.provider_id AND bd.blocked_date = (c.local_now::date + g.n)
  )
),
-- resolveWorkingWindows(): closed override > open overrides > weekly windows > legacy row.
windows AS (
  SELECT sd.service_id, sd.provider_id, sd.day, w.start_time, w.end_time
  FROM svc_days sd
  CROSS JOIN LATERAL (
    -- open overrides with explicit hours (unless any override closes the day)
    SELECT o.start_time, o.end_time
    FROM public.provider_availability_overrides o
    WHERE o.provider_id = sd.provider_id AND o.availability_date = sd.day
      AND o.is_closed = FALSE AND o.start_time IS NOT NULL AND o.end_time IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.provider_availability_overrides c
        WHERE c.provider_id = sd.provider_id AND c.availability_date = sd.day AND c.is_closed = TRUE)
    UNION ALL
    -- weekly windows, when no override replaces them
    SELECT pw.start_time, pw.end_time
    FROM public.provider_availability_windows pw
    WHERE pw.provider_id = sd.provider_id AND pw.day_of_week = sd.dow
      AND NOT EXISTS (
        SELECT 1 FROM public.provider_availability_overrides o
        WHERE o.provider_id = sd.provider_id AND o.availability_date = sd.day
          AND (o.is_closed = TRUE OR (o.start_time IS NOT NULL AND o.end_time IS NOT NULL)))
    UNION ALL
    -- legacy single day row, when there are no weekly windows and no override
    SELECT a.open_time, a.close_time
    FROM public.provider_availability a
    WHERE a.provider_id = sd.provider_id AND a.day_of_week = sd.dow AND a.is_closed = FALSE
      AND NOT EXISTS (
        SELECT 1 FROM public.provider_availability_windows pw
        WHERE pw.provider_id = sd.provider_id AND pw.day_of_week = sd.dow)
      AND NOT EXISTS (
        SELECT 1 FROM public.provider_availability_overrides o
        WHERE o.provider_id = sd.provider_id AND o.availability_date = sd.day
          AND (o.is_closed = TRUE OR (o.start_time IS NOT NULL AND o.end_time IS NOT NULL)))
  ) AS w
),
-- Taken spans, minutes since midnight: the same rows and clamping as
-- get_provider_busy_spans (already buffer-padded from effective_start/end).
busy AS (
  SELECT b.provider_id, b.booking_date AS day,
    FLOOR(EXTRACT(EPOCH FROM (
      GREATEST(COALESCE(b.effective_start, b.booking_date + b.booking_time), b.booking_date::timestamp)
    )::time) / 60)::int AS s_min,
    FLOOR(EXTRACT(EPOCH FROM (
      LEAST(COALESCE(b.effective_end, b.booking_date + COALESCE(b.end_time, b.booking_time + INTERVAL '1 hour')),
            b.booking_date::timestamp + INTERVAL '1 day' - INTERVAL '1 second')
    )::time) / 60)::int AS e_min
  FROM public.bookings b
  WHERE b.provider_id IN (SELECT provider_id FROM svc)
    AND b.booking_date BETWEEN (SELECT local_now::date FROM clock) AND (SELECT local_now::date + 6 FROM clock)
    AND b.status IN ('pending', 'confirmed', 'in_progress', 'on_hold')
    AND (b.status <> 'on_hold' OR b.hold_expires_at IS NULL OR b.hold_expires_at > NOW())
    AND NOT (b.status = 'on_hold' AND b.hold_batch_id IS NOT NULL
             AND auth.uid() IS NOT NULL AND b.user_id = auth.uid())
),
-- Candidate slot starts: every step inside each window, fitting the service.
slots AS (
  SELECT wd.service_id, wd.provider_id, wd.day, m.start_min,
         sv.dur, sv.buf_before, sv.buf_after, sv.notice_hrs
  FROM windows wd
  JOIN svc sv ON sv.id = wd.service_id
  CROSS JOIN LATERAL generate_series(
    FLOOR(EXTRACT(EPOCH FROM wd.start_time) / 60)::int,
    FLOOR(EXTRACT(EPOCH FROM wd.end_time) / 60)::int - 1,
    sv.step
  ) AS m(start_min)
  WHERE m.start_min + sv.dur <= FLOOR(EXTRACT(EPOCH FROM wd.end_time) / 60)::int
),
open_slots AS (
  SELECT sl.service_id, sl.day
  FROM slots sl
  CROSS JOIN clock c
  WHERE (sl.day + (sl.start_min * INTERVAL '1 minute')) >= (c.local_now + (sl.notice_hrs * INTERVAL '1 hour'))
    AND NOT EXISTS (
      SELECT 1 FROM busy bz
      WHERE bz.provider_id = sl.provider_id AND bz.day = sl.day
        AND (sl.start_min - sl.buf_before) < bz.e_min
        AND bz.s_min < (sl.start_min + sl.dur + sl.buf_after)
    )
)
SELECT sv.id AS service_id,
       (MIN(os.day) IS NOT NULL) AS has_slot,
       MIN(os.day) AS next_available
FROM svc sv
LEFT JOIN open_slots os ON os.service_id = sv.id
GROUP BY sv.id;
$function$;

-- Same posture as get_providers_availability: no anon, no PUBLIC.
REVOKE ALL ON FUNCTION public.get_services_availability(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_services_availability(uuid[]) TO authenticated, service_role;
