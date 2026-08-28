-- ============================================================
-- PROVIDER FOLLOW — SCHEDULE RELEASE DAY NOTIFY TOGGLE
-- Run this in the Supabase SQL editor. Self-contained, safe to re-run.
--
-- Adds an opt-in recurring nudge to the existing provider_follows table
-- (supabase/provider_follows_migration.sql) — the client-facing bell on
-- ProviderProfileScreen's hero pill now writes here instead of being pure
-- local UI state. Deliberately reuses provider_follows rather than
-- provider_waitlist: the waitlist is a one-shot, slot-scoped queue tied to
-- a specific service/date range; this is an indefinite, booking-independent
-- "check in on this provider periodically" subscription — a different
-- feature that happens to share the same audience.
--
-- PROVIDER sets the day (ProviderAutomationsScreen's "Notify followers on
-- schedule release day" date picker → automation_settings.scheduleReleaseDay,
-- 1-31) — this is the day of the month the provider typically redoes/
-- releases their schedule. Every client who has the bell on for that
-- provider gets notified on that day, every month, for as long as the bell
-- stays on. Not tied to any specific schedule-save event or today's live
-- open/closed status — a fixed calendar date, independent of both.
-- ============================================================

-- ───────────────────────────────────────────────────────────
-- STEP 0: Enable pg_cron extension (safe if already on from an earlier
--   migration, e.g. client_automation_jobs.sql)
-- ───────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
GRANT USAGE ON SCHEMA cron TO postgres;

-- ───────────────────────────────────────────────────────────
-- STEP 1: notify_enabled / last_notified_at columns
--   notify_enabled is independent of the follow row's existence — a client
--   can follow without notifications, or (via the bell) follow WITH
--   notifications in one action. Unfollowing removes the row entirely
--   (see unfollowProvider in databaseService.ts), which naturally cancels
--   any pending nudge too. last_notified_at is the per-month duplicate
--   guard — the day check alone isn't enough since the cron runs daily and
--   would otherwise fire every day this function happens to run on the
--   release day if it were ever invoked more than once that day.
-- ───────────────────────────────────────────────────────────
ALTER TABLE public.provider_follows
  ADD COLUMN IF NOT EXISTS notify_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMPTZ;

-- ───────────────────────────────────────────────────────────
-- STEP 2: process_follow_schedule_release_nudges()
--   Runs daily at 09:00 UTC (same slot as the other client nudge jobs in
--   client_automation_jobs.sql). Sends to every follow row with
--   notify_enabled = TRUE whose provider's automation_settings.
--   scheduleReleaseDay matches today's day-of-month, and who hasn't
--   already been notified this calendar month. A releaseDay beyond the
--   current month's last day (e.g. 31 in a 30-day month) clamps to that
--   month's actual last day, so it still fires once — same spirit as a
--   calendar app rolling "the 31st" to month-end. Sent as 'announcement' —
--   the type NotificationsScreen and notificationTapHandler.ts already
--   render/route generically, so no notifications.type CHECK constraint
--   change is needed.
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_follow_schedule_release_nudges()
RETURNS VOID AS $$
DECLARE
  r RECORD;
  v_last_day_of_month INT := EXTRACT(DAY FROM (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day'))::INT;
  v_today INT := EXTRACT(DAY FROM CURRENT_DATE)::INT;
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
      AND (p.automation_settings->>'scheduleReleaseDay') ~ '^[0-9]+$'
      AND LEAST((p.automation_settings->>'scheduleReleaseDay')::INT, v_last_day_of_month) = v_today
      AND (f.last_notified_at IS NULL OR f.last_notified_at < date_trunc('month', NOW()))
  LOOP
    -- Claim before sending so a slow loop iteration can't double-send if
    -- this function is ever invoked concurrently.
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
      COALESCE(r.display_name, 'Your provider') || ' — New Availability',
      COALESCE(r.display_name, 'Your provider') || ' just released new availability — check their latest slots.',
      'low',
      TRUE,
      r.provider_id,
      jsonb_build_object('kind', 'follow_schedule_release_nudge')
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ───────────────────────────────────────────────────────────
-- STEP 3: Schedule the cron job — daily 09:00 UTC
--   cron.schedule() upserts by job_name — safe to re-run. Re-points the OLD
--   'provider-follow-availability-nudges' job (the earlier monthly-since-
--   last-sent design, deployed then superseded before ever firing) to the
--   new day-of-month function under a new job name — unschedule the old one
--   so it doesn't keep running the stale function.
-- ───────────────────────────────────────────────────────────
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'provider-follow-availability-nudges';

SELECT cron.schedule(
  'provider-follow-schedule-release-nudges',
  '0 9 * * *',
  $$ SELECT public.process_follow_schedule_release_nudges(); $$
);

-- ───────────────────────────────────────────────────────────
-- VERIFY: after running, confirm the job is registered:
--
--   SELECT jobname, schedule, command, active
--     FROM cron.job
--    WHERE jobname = 'provider-follow-schedule-release-nudges';
-- ───────────────────────────────────────────────────────────

-- ============================================================
-- DONE — provider_follows.notify_enabled toggle + day-of-month release cron
-- ============================================================
