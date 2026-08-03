-- ============================================================
-- CERVICED — Provider "fully booked" alert (2026-08-02)
-- Run this in the Supabase SQL editor, whole file, top to bottom.
-- Safe to re-run.
--
-- Distinct from the waitlist notifications (waitlist_holds.sql): those fire
-- when ONE slot frees up or gets claimed. This is the opposite direction —
-- every live provider is told when their WHOLE calendar (every service
-- combined, not per-service) has nothing bookable for the coming week.
-- Fixed at 7 days for now, no per-provider opt-in/opt-out or custom window —
-- deliberately simple; a configurable version can come later if wanted.
--
-- There was previously no server-side notion of "fully booked" at all — the
-- only existing check (AvailabilityService.hasNearTermAvailabilityForServices)
-- is client-side, per-service, and only ever runs when a client happens to
-- have a provider's profile open. This adds the provider-facing, whole-
-- schedule equivalent as a daily cron job.
--
-- APPROXIMATION, not exact bin-packing: a day counts as "full" when total
-- booked minutes >= total open minutes for that day. This can't tell whether
-- the specific remaining gap actually fits any one service's duration +
-- buffers (that exact check is what AvailabilityService does per-service,
-- client-side, at booking time) — it's deliberately a coarser, cheaper
-- capacity signal for a once-a-day heads-up notification, not a booking-time
-- guarantee. False negatives (says "not full" when finer-grained slots
-- wouldn't actually fit anything) are the acceptable failure mode here, not
-- false positives telling a provider they're full when they aren't.
-- ============================================================

-- ── 1. Schema: cooldown guard so a provider who stays fully booked for
--    weeks doesn't get re-notified every single day — at most once every
--    7 days (the fixed window), regardless of how often the cron runs. ─────
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS fully_booked_alert_last_sent_at TIMESTAMPTZ;

-- ── 2. Widen the notifications type CHECK constraint. Full list copied from
--    notifications_cleanup_2026_08.sql (the most recent full rebuild) plus
--    the one new value — see CLAUDE.md/RUN_ALL_MIGRATIONS.sql's warning that
--    a narrower list here silently blocks every other type's inserts. ──────
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'booking_pending', 'booking_confirmed', 'booking_declined', 'booking_cancelled',
    'booking_reminder', 'booking_in_progress', 'booking_not_started', 'no_show',
    'payment_success', 'new_provider', 'reschedule_request', 'reschedule_provider_response',
    'reschedule_confirmed', 'review_request', 'review_received', 'promotion',
    'intake_form_reminder', 'intake_form_received', 'intake_form_completed',
    'info_pack_received', 'provider_message', 'announcement',
    'balance_reminder', 'waitlist_slot_available', 'new_message',
    'address_released', 'birthday_greeting', 'post_appt_check_in',
    'rebooking_nudge', 'daily_recap',
    'schedule_fully_booked'
  ));

-- ── 3. The daily check itself. Mirrors process_provider_daily_recap()'s
--    shape (notifications_cleanup_2026_08.sql): loop candidate providers,
--    insert one notification per provider. Every live, active provider is a
--    candidate — no automation_settings opt-in for now. ────────────────────
CREATE OR REPLACE FUNCTION public.process_provider_fully_booked_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  r RECORD;
  d DATE;
  v_window_end DATE;
  v_open_minutes INT;
  v_booked_minutes INT;
  v_has_open_day BOOLEAN;
  v_fully_booked BOOLEAN;
  c_alert_days CONSTANT INT := 7;
BEGIN
  FOR r IN
    SELECT p.id AS provider_id, p.user_id AS provider_user_id
    FROM public.providers p
    WHERE p.is_active = TRUE
      AND p.has_gone_live = TRUE
      AND (
        p.fully_booked_alert_last_sent_at IS NULL
        OR p.fully_booked_alert_last_sent_at <= NOW() - make_interval(days => c_alert_days)
      )
  LOOP
    v_window_end := CURRENT_DATE + c_alert_days;
    v_has_open_day := FALSE;
    v_fully_booked := TRUE;
    d := CURRENT_DATE;

    WHILE d <= v_window_end LOOP
      IF EXISTS (
        SELECT 1 FROM public.provider_blocked_dates
         WHERE provider_id = r.provider_id AND blocked_date = d
      ) THEN
        d := d + 1;
        CONTINUE;
      END IF;

      -- Open minutes for this date: an override (if one exists) wins
      -- outright, then explicit recurring windows, then the legacy
      -- single-period table — same precedence AvailabilityService uses.
      IF EXISTS (
        SELECT 1 FROM public.provider_availability_overrides
         WHERE provider_id = r.provider_id AND availability_date = d
      ) THEN
        SELECT COALESCE(SUM(
          CASE WHEN is_closed THEN 0
               ELSE GREATEST(0, EXTRACT(EPOCH FROM (end_time - start_time)) / 60) END
        ), 0)::INT
          INTO v_open_minutes
          FROM public.provider_availability_overrides
         WHERE provider_id = r.provider_id AND availability_date = d;
      ELSIF EXISTS (
        SELECT 1 FROM public.provider_availability_windows
         WHERE provider_id = r.provider_id AND day_of_week = EXTRACT(DOW FROM d)
      ) THEN
        SELECT COALESCE(SUM(GREATEST(0, EXTRACT(EPOCH FROM (end_time - start_time)) / 60)), 0)::INT
          INTO v_open_minutes
          FROM public.provider_availability_windows
         WHERE provider_id = r.provider_id AND day_of_week = EXTRACT(DOW FROM d);
      ELSE
        SELECT COALESCE(
          CASE WHEN is_closed THEN 0
               ELSE GREATEST(0, EXTRACT(EPOCH FROM (close_time - open_time)) / 60) END, 0)::INT
          INTO v_open_minutes
          FROM public.provider_availability
         WHERE provider_id = r.provider_id AND day_of_week = EXTRACT(DOW FROM d);
      END IF;

      IF COALESCE(v_open_minutes, 0) > 0 THEN
        v_has_open_day := TRUE;

        SELECT COALESCE(SUM(GREATEST(0, EXTRACT(EPOCH FROM (b.end_time - b.booking_time)) / 60)), 0)::INT
          INTO v_booked_minutes
          FROM public.bookings b
         WHERE b.provider_id = r.provider_id
           AND b.booking_date = d
           AND b.status IN ('pending', 'confirmed', 'in_progress', 'on_hold');

        IF v_booked_minutes < v_open_minutes THEN
          v_fully_booked := FALSE;
          EXIT; -- found a day with room — no need to check the rest of the window
        END IF;
      END IF;

      d := d + 1;
    END LOOP;

    -- No open day at all (provider blocked/closed the entire week) isn't
    -- "fully booked", it's just closed — don't alert on that.
    IF v_has_open_day AND v_fully_booked THEN
      UPDATE public.providers SET fully_booked_alert_last_sent_at = NOW() WHERE id = r.provider_id;

      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, provider_id, recipient_role, metadata)
      VALUES (
        r.provider_user_id,
        'schedule_fully_booked',
        'You''re Fully Booked!',
        'No openings anywhere in your calendar for the next week. Consider opening more availability, or check your waitlist for who to invite next.',
        'medium',
        TRUE,
        r.provider_id,
        'provider',
        jsonb_build_object('kind', 'schedule_fully_booked')
      );
    END IF;
  END LOOP;
END;
$function$;

-- ── 4. Schedule: once a day at 08:00 UTC, same cadence as the other daily
--    provider digests (provider_reminder_jobs.sql). cron.schedule() upserts
--    by job name, so re-running this is safe. ──────────────────────────────
SELECT cron.schedule(
  'provider-fully-booked-alerts',
  '0 8 * * *',
  $$ SELECT public.process_provider_fully_booked_alerts(); $$
);

-- VERIFY
--   select pg_get_constraintdef(oid) from pg_constraint
--     where conrelid = 'public.notifications'::regclass and conname = 'notifications_type_check';
--     → expect 'schedule_fully_booked' present
--   select column_name from information_schema.columns
--     where table_name = 'providers' and column_name = 'fully_booked_alert_last_sent_at';
--     → expect one row
--   select jobname, schedule from cron.job where jobname = 'provider-fully-booked-alerts';
--     → expect one row, '0 8 * * *'
--   select public.process_provider_fully_booked_alerts(); -- manual test run
-- ============================================================
