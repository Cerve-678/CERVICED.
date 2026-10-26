-- "Slots out every Nth" actually releases slots now.
--
-- Before: a provider's release day (automation_settings.scheduleReleaseDay)
-- only sent followers a push saying "just released new availability", while
-- the diary stayed a rolling booking_window_days horizon that moved one day
-- every midnight. Nothing was ever released. (FUTURE_LOGIC.md, "Slots out
-- every Nth".)
--
-- Now a release day IS the booking horizon, replacing booking_window_days for
-- that provider:
--   • Before the Nth at 09:00 UTC: bookable to the end of this month.
--   • From the Nth at 09:00 UTC: bookable to the end of next month.
--   • A day past the month's end (31 in a 30-day month) means its last day.
-- The horizon is computed from the clock, not stored, so it can't fail to
-- advance — a provider who never opens the app still opens next month on time.
-- The push cron runs at 09:00 UTC, the same minute, and now checks that next
-- month really is open before saying so.
--
-- Providers without a release day keep the rolling window exactly as before
-- (0 = no limit).
--
-- The app mirrors this in src/utils/bookingHorizon.ts. Keep the two in step.
--
-- Redefines, each from its live definition (2026-10-26) with only the
-- horizon logic changed:
--   provider_last_bookable_date        (added by 20261026100000)
--   enforce_booking_bookability        (window check → the helper above, and
--                                       no longer re-checked on an UPDATE that
--                                       keeps the booking's date and provider)
--   get_services_availability          (7-day horizon clamped by the helper.
--                                       Side effect: a rolling window under 7
--                                       days now includes its last day, e.g. 4
--                                       days for a 3-day window, matching what
--                                       the trigger has always accepted)
--   process_follow_schedule_release_nudges (live providers only; sends only
--                                       once next month is open; names it)
--
-- Existing bookings are untouched: before_booking_enforce_bookability only
-- fires on INSERT or a change of date/time/provider. Live at authoring: 3
-- providers have a release day (5th, 14th, 20th); on 2026-10-26 all three
-- are already past it, so each goes from "to 25 Nov" (rolling 30) to "to
-- 30 Nov". No date that was bookable closes.

BEGIN;

-- ── 1. the horizon ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.provider_last_bookable_date(p_provider_id uuid)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH p AS (
    SELECT
      pr.booking_window_days,
      -- {1,2}: Postgres doesn't promise the regex runs before the cast, so a
      -- long digit string could overflow ::int and fail every booking.
      CASE WHEN (pr.automation_settings->>'scheduleReleaseDay') ~ '^[0-9]{1,2}$'
            AND (pr.automation_settings->>'scheduleReleaseDay')::int BETWEEN 1 AND 31
           THEN (pr.automation_settings->>'scheduleReleaseDay')::int
      END AS release_day,
      date_trunc('month', now() AT TIME ZONE 'UTC')::date AS month_start
    FROM public.providers pr
    WHERE pr.id = p_provider_id
  )
  SELECT CASE
    WHEN p.release_day IS NOT NULL THEN
      CASE
        WHEN (now() AT TIME ZONE 'UTC') >=
             (p.month_start
               + (LEAST(p.release_day, EXTRACT(DAY FROM (p.month_start + INTERVAL '1 month - 1 day'))::int) - 1)
               + TIME '09:00')
          THEN (p.month_start + INTERVAL '2 months - 1 day')::date
        ELSE (p.month_start + INTERVAL '1 month - 1 day')::date
      END
    WHEN COALESCE(p.booking_window_days, 60) > 0 THEN CURRENT_DATE + COALESCE(p.booking_window_days, 60)
    ELSE NULL
  END
  FROM p;
$$;

REVOKE ALL ON FUNCTION public.provider_last_bookable_date(uuid) FROM PUBLIC, anon, authenticated;

-- ── 2. enforce it on every booking ──────────────────────────────────────────
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

-- ── 3. the 7-day "has a slot" check, clamped to what's open ─────────────────
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
    -- Up to 7 days, but never past what the provider has opened (rolling
    -- window or monthly release). NULL = no limit.
    CASE
      WHEN public.provider_last_bookable_date(p.id) IS NULL THEN 7
      ELSE GREATEST(0, LEAST(7, public.provider_last_bookable_date(p.id) - (SELECT local_now::date FROM clock) + 1))
    END AS horizon
  FROM public.services s
  JOIN public.providers p ON p.id = s.provider_id
  WHERE s.id = ANY(p_service_ids[1:300])
    AND s.is_active = TRUE
    AND p.has_gone_live = TRUE
    AND p.is_active = TRUE
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
    AND b.booking_date BETWEEN (SELECT local_now::date FROM clock) AND (SELECT local_now::date + 6 FROM clock)
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

-- ── 4. the release push only claims what happened ───────────────────────────
CREATE OR REPLACE FUNCTION public.process_follow_schedule_release_nudges()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r RECORD;
  v_last_day_of_month INT := EXTRACT(DAY FROM (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day'))::INT;
  v_today INT := EXTRACT(DAY FROM CURRENT_DATE)::INT;
  v_next_month_start DATE := (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date;
  v_next_month_name TEXT := to_char(date_trunc('month', CURRENT_DATE) + INTERVAL '1 month', 'FMMonth');
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
      AND (f.last_notified_at IS NULL OR f.last_notified_at < date_trunc('month', NOW()))
      -- Say "released" only once next month really is bookable. The horizon
      -- opens at 09:00 UTC on the release day, the same minute this runs.
      AND public.provider_last_bookable_date(p.id) >= v_next_month_start
  LOOP
    UPDATE public.provider_follows
       SET last_notified_at = NOW()
     WHERE id = r.follow_id
       AND (last_notified_at IS NULL OR last_notified_at < date_trunc('month', NOW()));
    IF NOT FOUND THEN CONTINUE; END IF;

    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, provider_id, metadata)
    VALUES (
      r.user_id,
      'announcement',
      COALESCE(r.display_name, 'Your provider') || ' — ' || v_next_month_name || ' is open',
      -- Only what was checked: the month is bookable. Whether any time in it
      -- is still free isn't, so no "before it fills up".
      COALESCE(r.display_name, 'Your provider') || ' has opened bookings for ' || v_next_month_name || '.',
      'low',
      TRUE,
      r.provider_id,
      jsonb_build_object('kind', 'follow_schedule_release_nudge')
    );
  END LOOP;
END;
$function$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261026110000', 'monthly_release')
ON CONFLICT (version) DO NOTHING;

COMMIT;
