-- 20261110140000_service_latest_start.sql
--
-- A service can have its own latest start time ("Latest start" in Edit
-- Service). A 3-hour colour set to 2pm is never offered at 3pm, even when the
-- provider works until 7.
--
-- New column: services.latest_start_time time, NULL = any time in working
-- hours (every existing service stays NULL, so nothing changes for anyone
-- until a provider sets one). Compared against booking_time as written, the
-- same local UK clock time every other schedule rule here uses.
--
-- Redefines, each from its live definition on 2026-11-10 (md5 guards below):
--   • enforce_booking_bookability — refuses a start after the service's
--     latest start, on insert (holds included) and on a move to a new date or
--     time. Not waived by any emergency-request opt-in; skipped only by the
--     provider's own squeeze-in (cerviced.bypass_working_hours), like the
--     working-hours check it sits beside. Message is a plain P0001 the app
--     shows as written.
--   • get_services_open_within — the "fully booked / next free day" check
--     only counts starts at or before the service's latest start.
--   • get_providers_availability — Search's today / tomorrow / this week
--     dots, likewise. Its existing WHERE is bracketed so the new line can't
--     bind into one side of the OR; meaning of the existing lines unchanged.
--
-- The app's copy of the rule is AvailabilityService (getAvailableSlots,
-- isSlotAvailable, the back-to-back chain finder, findNextAvailableDate).
-- CREATE OR REPLACE keeps each function's existing grants.

BEGIN;

DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.enforce_booking_bookability()'::regprocedure)) <> '9d8b792cced299c3a9d641bf6a442a0d' THEN
    RAISE EXCEPTION 'enforce_booking_bookability changed since this was written; rebuild it from the live definition';
  END IF;
  IF md5(pg_get_functiondef('public.get_services_open_within(uuid[], integer)'::regprocedure)) <> 'd4e12bb30c980712f3212bf98e08bf0d' THEN
    RAISE EXCEPTION 'get_services_open_within changed since this was written; rebuild it from the live definition';
  END IF;
  IF md5(pg_get_functiondef('public.get_providers_availability(text[], text)'::regprocedure)) <> '4428a77b024c880023cbcb9e6b36f2d2' THEN
    RAISE EXCEPTION 'get_providers_availability changed since this was written; rebuild it from the live definition';
  END IF;
END
$guard$;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS latest_start_time time;

COMMENT ON COLUMN public.services.latest_start_time IS
  'Latest time of day this service can start (UK local, same clock as bookings.booking_time). NULL = any time within working hours. Enforced by enforce_booking_bookability.';

CREATE OR REPLACE FUNCTION public.enforce_booking_bookability()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_last_bookable DATE;
  v_notice_hours INTEGER;
  v_has_override BOOLEAN;
  v_fits_window BOOLEAN;
  v_legacy_open TIME;
  v_legacy_close TIME;
  v_legacy_closed BOOLEAN;
  v_bypass_hours BOOLEAN;
  v_bypass_policy BOOLEAN;
  -- Emergency-request opt-ins, read once alongside the settings above.
  v_allow_hours BOOLEAN;
  v_allow_blocked BOOLEAN;
  v_allow_notice BOOLEAN;
  v_allow_window BOOLEAN;
  v_emergency BOOLEAN;
  v_day_is_shut BOOLEAN := FALSE;
  v_latest_start TIME;
BEGIN
  SELECT min_booking_notice_hrs,
         COALESCE(allow_out_of_hours_requests, false),
         COALESCE(allow_blocked_date_requests, false),
         COALESCE(allow_short_notice_requests, false),
         COALESCE(allow_beyond_window_requests, false)
    INTO v_notice_hours,
         v_allow_hours, v_allow_blocked, v_allow_notice, v_allow_window
    FROM public.providers WHERE id = NEW.provider_id;

  v_emergency := COALESCE(NEW.is_emergency_request, false);

  IF NEW.booking_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Booking date cannot be in the past';
  END IF;

  -- Always enforced, emergency or not, bypass or not: a same-day booking for
  -- a time that has already elapsed (or is exactly now) cannot be kept by
  -- anyone, provider override or not.
  IF NEW.booking_date = CURRENT_DATE AND NEW.booking_time <= LOCALTIME THEN
    RAISE EXCEPTION 'That time has already passed today';
  END IF;

  -- Provider-initiated manual booking: skips the booking-window / minimum-
  -- notice / blocked-date POLICY checks below outright, independently of any
  -- client-facing opt-in. Set exclusively by provider_create_manual_booking()
  -- via set_config('cerviced.bypass_scheduling_policy', 'on', true);
  -- transaction-local, cannot leak to any other insert.
  v_bypass_policy := COALESCE(current_setting('cerviced.bypass_scheduling_policy', true), 'off') = 'on';

  IF NOT v_bypass_policy THEN
    -- Closed by hand: no NEW bookings. Holds for a reschedule pass
    -- (reschedule_hold_for), and an UPDATE moves a booking the provider
    -- agreed to through confirm_reschedule_own_booking, so a move carries on.
    -- The provider adding their own client is exempt: inviting from their
    -- waitlist by hand is a plain insert under bookings_provider_insert. The
    -- automatic invite can also run as the provider, when they cancel, so
    -- invite_next_waitlist_entry has its own check.
    IF TG_OP = 'INSERT'
       AND NEW.reschedule_hold_for IS NULL
       AND public.provider_schedule_is_closed(NEW.provider_id)
       AND NOT EXISTS (
         SELECT 1 FROM public.providers own
          WHERE own.id = NEW.provider_id AND own.user_id = auth.uid()
       ) THEN
      RAISE EXCEPTION 'This provider is not taking bookings right now';
    END IF;

    -- The rolling window, or what a monthly release has opened so far — see
    -- provider_last_bookable_date. NULL = no limit.
    --
    -- Not re-checked when an existing booking keeps its date and provider:
    -- a time-only change (or an end_time fix) to a booking that was valid
    -- when made must not fail just because the horizon has since moved — a
    -- provider switching from a 60-day window to a monthly release would
    -- otherwise freeze every booking they hold past the end of the month.
    v_last_bookable := public.provider_last_bookable_date(NEW.provider_id);
    IF v_last_bookable IS NOT NULL
       AND NOT (TG_OP = 'UPDATE'
                AND NEW.booking_date = OLD.booking_date
                AND NEW.provider_id = OLD.provider_id)
       AND NEW.booking_date > v_last_bookable
       AND NOT (v_emergency AND v_allow_window) THEN
      RAISE EXCEPTION 'Booking is outside this provider''s booking window';
    END IF;

    IF COALESCE(v_notice_hours, 0) > 0
       AND (NEW.booking_date + NEW.booking_time) < now() + make_interval(hours => v_notice_hours)
       AND NOT (v_emergency AND v_allow_notice) THEN
      RAISE EXCEPTION 'This appointment does not meet the provider''s minimum notice';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.provider_blocked_dates
      WHERE provider_id = NEW.provider_id AND blocked_date = NEW.booking_date
    ) THEN
      IF NOT (v_emergency AND v_allow_blocked) THEN
        RAISE EXCEPTION 'Provider is unavailable on this date';
      END IF;
      -- Accepted as an emergency request, but the day has no hours of its
      -- own, so the envelope check below is what bounds the time of day.
      v_day_is_shut := TRUE;
    END IF;
  END IF;

  -- Provider-initiated squeeze-in: skips ONLY the working-hours fit check
  -- below. Set exclusively by provider_create_manual_booking() via
  -- set_config('cerviced.bypass_working_hours', 'on', true) immediately
  -- before its INSERT; transaction-local, cannot leak to any other insert.
  v_bypass_hours := COALESCE(current_setting('cerviced.bypass_working_hours', true), 'off') = 'on';

  IF NOT v_bypass_hours THEN
    -- The service's own latest start (services.latest_start_time). Hard
    -- stop: no emergency opt-in reaches past it, only the provider's own
    -- squeeze-in (the bypass above). Checked on a new booking and on a move
    -- to a new date or time, never on an UPDATE that leaves both alone, so a
    -- booking made before the provider set the limit isn't frozen by it.
    IF NEW.service_id IS NOT NULL
       AND (TG_OP = 'INSERT'
            OR NEW.booking_date IS DISTINCT FROM OLD.booking_date
            OR NEW.booking_time IS DISTINCT FROM OLD.booking_time) THEN
      SELECT s.latest_start_time INTO v_latest_start
        FROM public.services s WHERE s.id = NEW.service_id;
      IF v_latest_start IS NOT NULL AND NEW.booking_time > v_latest_start THEN
        RAISE EXCEPTION 'This service has to start by %',
          lower(to_char(DATE '2000-01-01' + v_latest_start, 'FMHH12:MIAM'));
      END IF;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.provider_availability_overrides
       WHERE provider_id = NEW.provider_id AND availability_date = NEW.booking_date
    ) INTO v_has_override;

    -- A one-off "closed" override is the same kind of statement as a blocked
    -- date — "I am not working that day" — so it answers to the same opt-in,
    -- not to the out-of-hours one.
    IF v_has_override AND EXISTS (
      SELECT 1 FROM public.provider_availability_overrides
       WHERE provider_id = NEW.provider_id AND availability_date = NEW.booking_date AND is_closed
    ) THEN
      IF NOT (v_emergency AND v_allow_blocked) THEN
        RAISE EXCEPTION 'Provider is unavailable on this date';
      END IF;
      v_day_is_shut := TRUE;
    END IF;

    IF v_day_is_shut THEN
      v_fits_window := FALSE;
    ELSE
      SELECT EXISTS (
        SELECT 1 FROM public.provider_availability_overrides
         WHERE provider_id = NEW.provider_id AND availability_date = NEW.booking_date
           AND is_closed = FALSE AND NEW.booking_time >= start_time AND NEW.end_time <= end_time
      ) INTO v_fits_window;

      IF NOT v_has_override THEN
        SELECT EXISTS (
          SELECT 1 FROM public.provider_availability_windows
           WHERE provider_id = NEW.provider_id
             AND day_of_week = EXTRACT(DOW FROM NEW.booking_date)
             AND NEW.booking_time >= start_time AND NEW.end_time <= end_time
        ) INTO v_fits_window;

        -- Providers not yet migrated retain their original single daily period.
        IF NOT v_fits_window AND NOT EXISTS (
          SELECT 1 FROM public.provider_availability_windows WHERE provider_id = NEW.provider_id
        ) THEN
          SELECT open_time, close_time, is_closed INTO v_legacy_open, v_legacy_close, v_legacy_closed
          FROM public.provider_availability
          WHERE provider_id = NEW.provider_id AND day_of_week = EXTRACT(DOW FROM NEW.booking_date);
          v_fits_window := FOUND AND NOT COALESCE(v_legacy_closed, TRUE)
            AND NEW.booking_time >= v_legacy_open AND NEW.end_time <= v_legacy_close;
        END IF;
      END IF;
    END IF;

    -- Outside the working hours. Allowed only as an emergency request, and
    -- only under the opt-in that matches WHY the day doesn't fit: a shut day
    -- was already authorised by the blocked-date opt-in above, anything else
    -- needs the out-of-hours one. No further bound on the time of day — see
    -- this migration's header.
    IF NOT COALESCE(v_fits_window, FALSE)
       AND (NOT v_emergency OR NOT (v_allow_hours OR (v_day_is_shut AND v_allow_blocked))) THEN
      RAISE EXCEPTION 'This appointment is outside the provider''s working hours';
    END IF;
  END IF;

  -- A taken slot stays taken regardless of anyone's intent — no opt-in, no
  -- override, no emergency reaches past this.
  IF EXISTS (
    SELECT 1 FROM public.bookings b
     WHERE b.provider_id = NEW.provider_id AND b.booking_date = NEW.booking_date
       AND b.status IN ('pending', 'confirmed', 'in_progress', 'on_hold')
       AND b.id IS DISTINCT FROM NEW.id
       AND NEW.booking_time < b.end_time AND NEW.end_time > b.booking_time
  ) THEN RAISE EXCEPTION 'That time is no longer available'; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_services_open_within(p_service_ids uuid[], p_within_days integer)
 RETURNS TABLE(service_id uuid, has_slot boolean, next_available date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
WITH clock AS (
  SELECT (now() AT TIME ZONE 'Europe/London') AS local_now,
         GREATEST(1, LEAST(COALESCE(p_within_days, 7), 180)) AS within_days
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
    -- The service's own latest start, in minutes from midnight. NULL = none.
    (FLOOR(EXTRACT(EPOCH FROM s.latest_start_time) / 60))::int AS latest_start_min,
    -- Days to look at, today included: the asked-for span, never past the
    -- provider's last bookable date. NULL last date = no limit.
    CASE
      WHEN public.provider_last_bookable_date(p.id) IS NULL THEN (SELECT within_days FROM clock)
      ELSE GREATEST(0, LEAST((SELECT within_days FROM clock),
                             public.provider_last_bookable_date(p.id) - (SELECT local_now::date FROM clock) + 1))
    END AS horizon
  FROM public.services s
  JOIN public.providers p ON p.id = s.provider_id
  WHERE s.id = ANY(p_service_ids[1:300])
    AND s.is_active = TRUE
    AND p.has_gone_live = TRUE
    AND p.is_active = TRUE
    AND NOT public.provider_schedule_is_closed(p.id)
),
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
windows AS (
  SELECT sd.service_id, sd.provider_id, sd.day, w.start_time, w.end_time
  FROM svc_days sd
  CROSS JOIN LATERAL (
    SELECT o.start_time, o.end_time
    FROM public.provider_availability_overrides o
    WHERE o.provider_id = sd.provider_id AND o.availability_date = sd.day
      AND o.is_closed = FALSE AND o.start_time IS NOT NULL AND o.end_time IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.provider_availability_overrides c
        WHERE c.provider_id = sd.provider_id AND c.availability_date = sd.day AND c.is_closed = TRUE)
    UNION ALL
    SELECT pw.start_time, pw.end_time
    FROM public.provider_availability_windows pw
    WHERE pw.provider_id = sd.provider_id AND pw.day_of_week = sd.dow
      AND NOT EXISTS (
        SELECT 1 FROM public.provider_availability_overrides o
        WHERE o.provider_id = sd.provider_id AND o.availability_date = sd.day
          AND (o.is_closed = TRUE OR (o.start_time IS NOT NULL AND o.end_time IS NOT NULL)))
    UNION ALL
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
    AND b.booking_date BETWEEN (SELECT local_now::date FROM clock)
                           AND (SELECT local_now::date + within_days - 1 FROM clock)
    AND b.status IN ('pending', 'confirmed', 'in_progress', 'on_hold')
    AND (b.status <> 'on_hold' OR b.hold_expires_at IS NULL OR b.hold_expires_at > NOW())
    AND NOT (b.status = 'on_hold' AND b.hold_batch_id IS NOT NULL
             AND auth.uid() IS NOT NULL AND b.user_id = auth.uid())
),
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
    AND (sv.latest_start_min IS NULL OR m.start_min <= sv.latest_start_min)
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

CREATE OR REPLACE FUNCTION public.get_providers_availability(p_slugs text[], p_hair_type text DEFAULT NULL::text)
 RETURNS TABLE(slug text, status text, hair_match boolean, available_today boolean, available_tomorrow boolean, available_this_week boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
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
service_options AS (
  SELECT s.provider_id, s.duration_minutes,
         coalesce(s.buffer_before_mins, 0) AS buffer_before_mins,
         coalesce(s.buffer_after_mins, l.buffer_mins) AS buffer_after_mins,
         s.latest_start_time
  FROM public.services s
  JOIN listed l ON l.id = s.provider_id
  WHERE s.is_active = true
),
schedule_windows AS (
  SELECT l.id AS provider_id, d.day, w.start_time, w.end_time
  FROM listed l
  CROSS JOIN days d
  CROSS JOIN LATERAL (
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
  -- The first two lines are kept exactly as live (bracketed, unchanged in
  -- meaning) so the latest-start line below applies to every provider.
  WHERE (l.booking_window_days <= 0 OR sw.day <= current_date + l.booking_window_days
    AND sw.day + make_interval(mins => slot_minute) >= c.local_now + make_interval(hours => l.min_booking_notice_hrs))
    AND (so.latest_start_time IS NULL OR slot_minute <= extract(epoch FROM so.latest_start_time)::integer / 60)
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

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261110140000', 'service_latest_start')
ON CONFLICT (version) DO NOTHING;

COMMIT;
