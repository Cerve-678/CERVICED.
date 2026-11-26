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
-- get_services_open_within (20261026100000) — the one free-slot check behind
-- the profile's Fully Booked, Search and the bell — reads the horizon through
-- provider_last_bookable_date, so redefining that helper here is all it needs.
--
-- Redefines, each from its live definition (2026-10-26) with only the
-- horizon logic changed:
--   provider_last_bookable_date        (added by 20261026100000)
--   enforce_booking_bookability        (window check → the helper above, and
--                                       no longer re-checked on an UPDATE that
--                                       keeps the booking's date and provider)
--   process_follow_schedule_release_nudges (live providers only; sends only
--                                       once next month is open; "December
--                                       has opened up … Get booking now.")
-- Adds merge_provider_automation_settings (section 5), so settings screens
-- change only their own keys instead of writing the whole bundle back.
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

-- ── 5. settings screens change only their own keys ──────────────────────────
-- automation_settings is one JSON bundle edited from several screens
-- (Automations, Payments, Scheduling's release day). Each used to write the
-- whole bundle back from a copy loaded when the screen opened, so saving one
-- screen could silently undo a change made in another. This changes only the
-- named keys, in one statement, so there's nothing stale to write back.
-- SECURITY INVOKER: the providers RLS still applies, and the owner check is
-- explicit too.
CREATE OR REPLACE FUNCTION public.merge_provider_automation_settings(
  p_provider_id uuid,
  p_set jsonb,
  p_remove text[] DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.providers
     SET automation_settings =
           (COALESCE(automation_settings, '{}'::jsonb) - COALESCE(p_remove, '{}'::text[]))
           || COALESCE(p_set, '{}'::jsonb)
   WHERE id = p_provider_id
     AND user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Provider not found, or not yours to change';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.merge_provider_automation_settings(uuid, jsonb, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_provider_automation_settings(uuid, jsonb, text[]) TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261026110000', 'monthly_release')
ON CONFLICT (version) DO NOTHING;

COMMIT;
