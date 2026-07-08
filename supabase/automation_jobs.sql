-- ============================================================
-- CERVICED — Automation System
-- Run this in the Supabase SQL editor.
-- Project: ztrfpfvvejzaysrelmfm
-- ============================================================

-- ───────────────────────────────────────────────────────────
-- STEP 1: Enable pg_cron extension
--   pg_cron must be enabled BEFORE creating cron jobs.
--   If you see "extension already exists" that is fine — safe to re-run.
-- ───────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
GRANT USAGE ON SCHEMA cron TO postgres;

-- ───────────────────────────────────────────────────────────
-- STEP 2: Add automation columns to providers
--   auto_accept_bookings            — skip manual confirm, go straight to confirmed
--   reminder_notifications_enabled  — receive 24hr reminder before each appointment
-- ───────────────────────────────────────────────────────────
ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS auto_accept_bookings           BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reminder_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- ───────────────────────────────────────────────────────────
-- STEP 3: Add automation columns to users
--   reminder_enabled        — receive 24hr reminder before confirmed bookings
--   pending_warning_enabled — alert when a booking is still pending within 24hrs of appointment
-- ───────────────────────────────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS reminder_enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS pending_warning_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- ───────────────────────────────────────────────────────────
-- STEP 4: Index to speed up cron jobs that scan bookings by date + status
-- ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bookings_date_status
  ON public.bookings(booking_date, status);

-- ───────────────────────────────────────────────────────────
-- STEP 5: Replace handle_new_booking() with auto-accept logic
--
--   Behaviour:
--     • Always notifies the USER that their request was received (booking_pending).
--     • If the provider has auto_accept_bookings = TRUE:
--         → Updates booking status to 'confirmed' immediately.
--         → The existing on_booking_status_changed trigger fires automatically,
--           which sends the booking_confirmed notification to the user.
--         → Provider does NOT receive a manual-review notification.
--     • If auto_accept_bookings = FALSE:
--         → Notifies the PROVIDER to manually confirm or decline (existing behaviour).
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_booking()
RETURNS TRIGGER AS $$
DECLARE
  v_provider_user_id UUID;
  v_auto_accept      BOOLEAN;
BEGIN
  -- Look up the provider's user_id and auto-accept setting in one query
  SELECT p.user_id, p.auto_accept_bookings
    INTO v_provider_user_id, v_auto_accept
    FROM public.providers p
   WHERE p.id = NEW.provider_id;

  -- Always tell the user their request was received
  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
  VALUES (
    NEW.user_id,
    'booking_pending',
    'Booking Request Sent',
    'Your request with ' || NEW.provider_name_snapshot ||
      ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') ||
      ' at ' || TO_CHAR(NEW.booking_time, 'HH12:MI AM') ||
      ' is awaiting confirmation.',
    'high',
    TRUE,
    NEW.id,
    NEW.provider_id
  );

  IF v_auto_accept THEN
    -- Auto-accept: confirm the booking immediately.
    -- This UPDATE fires on_booking_status_changed (pending → confirmed),
    -- which sends booking_confirmed to the user automatically.
    UPDATE public.bookings
       SET status       = 'confirmed',
           confirmed_at = NOW()
     WHERE id = NEW.id;

  ELSE
    -- Manual flow: notify provider to review the request
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
    VALUES (
      v_provider_user_id,
      'booking_pending',
      'New Booking Request',
      COALESCE(NEW.customer_name, 'A client') || ' requested ' ||
        NEW.service_name_snapshot ||
        ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') ||
        '. Please confirm or decline.',
      'high',
      TRUE,
      NEW.id,
      NEW.provider_id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_booking_created ON public.bookings;
CREATE TRIGGER on_booking_created
  AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_booking();

-- ───────────────────────────────────────────────────────────
-- STEP 6: process_provider_24hr_reminders()
--   Runs daily at 08:00 UTC.
--   Sends a booking_reminder notification to providers for all confirmed
--   appointments scheduled for tomorrow, if reminder_notifications_enabled = TRUE.
--   Duplicate guard: skips bookings that already have a reminder sent today.
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_provider_24hr_reminders()
RETURNS VOID AS $$
DECLARE
  v_tomorrow DATE := CURRENT_DATE + INTERVAL '1 day';
  r          RECORD;
BEGIN
  FOR r IN
    SELECT
      b.id                   AS booking_id,
      b.booking_time,
      b.booking_date,
      b.service_name_snapshot,
      b.customer_name,
      b.provider_id,
      p.user_id              AS provider_user_id
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
    WHERE b.booking_date = v_tomorrow
      AND b.status = 'confirmed'
      AND p.reminder_notifications_enabled = TRUE
      AND NOT EXISTS (
        SELECT 1
          FROM public.notifications n
         WHERE n.booking_id = b.id
           AND n.user_id    = p.user_id
           AND n.type       = 'booking_reminder'
      )
  LOOP
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
    VALUES (
      r.provider_user_id,
      'booking_reminder',
      'Appointment Tomorrow',
      COALESCE(r.customer_name, 'A client') || ' has ' ||
        r.service_name_snapshot ||
        ' booked tomorrow at ' ||
        TO_CHAR(r.booking_time, 'HH12:MI AM') || '.',
      'medium',
      FALSE,
      r.booking_id,
      r.provider_id
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ───────────────────────────────────────────────────────────
-- STEP 7: process_user_24hr_reminders()
--   Runs daily at 08:00 UTC (same window as provider reminders).
--   Sends a booking_reminder notification to users for all confirmed
--   appointments scheduled for tomorrow, if reminder_enabled = TRUE.
--   Duplicate guard: skips bookings that already have a reminder for that user.
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_user_24hr_reminders()
RETURNS VOID AS $$
DECLARE
  v_tomorrow DATE := CURRENT_DATE + INTERVAL '1 day';
  r          RECORD;
BEGIN
  FOR r IN
    SELECT
      b.id                    AS booking_id,
      b.user_id,
      b.booking_time,
      b.booking_date,
      b.service_name_snapshot,
      b.provider_name_snapshot,
      b.provider_id
    FROM public.bookings b
    JOIN public.users u ON u.id = b.user_id
    WHERE b.booking_date = v_tomorrow
      AND b.status = 'confirmed'
      AND u.reminder_enabled = TRUE
      AND NOT EXISTS (
        SELECT 1
          FROM public.notifications n
         WHERE n.booking_id = b.id
           AND n.user_id    = b.user_id
           AND n.type       = 'booking_reminder'
      )
  LOOP
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
    VALUES (
      r.user_id,
      'booking_reminder',
      'Appointment Tomorrow',
      'Your ' || r.service_name_snapshot ||
        ' with ' || r.provider_name_snapshot ||
        ' is tomorrow at ' || TO_CHAR(r.booking_time, 'HH12:MI AM') ||
        '. Please arrive 10 minutes early.',
      'medium',
      TRUE,
      r.booking_id,
      r.provider_id
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ───────────────────────────────────────────────────────────
-- STEP 8: process_pending_booking_warnings()
--   Runs daily at 10:00 UTC.
--   Warns users whose booking is still pending within 24 hours of the appointment,
--   if pending_warning_enabled = TRUE.
--   Duplicate guard: skips if a booking_pending warning was already sent in the last 25 hours.
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_pending_booking_warnings()
RETURNS VOID AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      b.id                    AS booking_id,
      b.user_id,
      b.booking_date,
      b.booking_time,
      b.service_name_snapshot,
      b.provider_name_snapshot,
      b.provider_id
    FROM public.bookings b
    JOIN public.users u ON u.id = b.user_id
    WHERE b.status = 'pending'
      AND (b.booking_date::TIMESTAMP + b.booking_time) BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
      AND u.pending_warning_enabled = TRUE
      AND NOT EXISTS (
        SELECT 1
          FROM public.notifications n
         WHERE n.booking_id   = b.id
           AND n.user_id      = b.user_id
           AND n.type         = 'booking_pending'
           AND n.created_at  > NOW() - INTERVAL '25 hours'
      )
  LOOP
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
    VALUES (
      r.user_id,
      'booking_pending',
      'Booking Still Awaiting Confirmation',
      'Your ' || r.service_name_snapshot ||
        ' with ' || r.provider_name_snapshot ||
        ' on ' || TO_CHAR(r.booking_date, 'DD Mon YYYY') ||
        ' at ' || TO_CHAR(r.booking_time, 'HH12:MI AM') ||
        ' has not been confirmed yet. You may want to contact the provider.',
      'high',
      TRUE,
      r.booking_id,
      r.provider_id
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ───────────────────────────────────────────────────────────
-- STEP 9: process_auto_complete_bookings()
--   Runs every 30 minutes.
--   Marks confirmed or in_progress bookings as completed once their end time
--   (or booking_time + 1 hour fallback) has passed.
--   The existing on_booking_status_changed trigger fires automatically,
--   which sends the review_request notification to the user.
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_auto_complete_bookings()
RETURNS VOID AS $$
BEGIN
  UPDATE public.bookings
     SET status = 'completed'
   WHERE status IN ('confirmed', 'in_progress')
     AND (
       -- Use end_time when available
       (end_time IS NOT NULL     AND (booking_date::TIMESTAMP + end_time)                       < NOW())
       OR
       -- Fall back to booking_time + 1 hour when end_time is not set
       (end_time IS NULL         AND (booking_date::TIMESTAMP + booking_time + INTERVAL '1 hour') < NOW())
     );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ───────────────────────────────────────────────────────────
-- STEP 10: Schedule the four cron jobs
--   Each block deletes any existing job with the same name first,
--   so this script is safe to re-run without creating duplicates.
-- ───────────────────────────────────────────────────────────

-- Provider 24hr reminders — every day at 08:00 UTC
DELETE FROM cron.job WHERE jobname = 'provider-24hr-reminders';
SELECT cron.schedule(
  'provider-24hr-reminders',
  '0 8 * * *',
  $$ SELECT public.process_provider_24hr_reminders(); $$
);

-- User 24hr reminders — every day at 08:00 UTC
DELETE FROM cron.job WHERE jobname = 'user-24hr-reminders';
SELECT cron.schedule(
  'user-24hr-reminders',
  '0 8 * * *',
  $$ SELECT public.process_user_24hr_reminders(); $$
);

-- Pending booking warnings — every day at 10:00 UTC
DELETE FROM cron.job WHERE jobname = 'pending-booking-warnings';
SELECT cron.schedule(
  'pending-booking-warnings',
  '0 10 * * *',
  $$ SELECT public.process_pending_booking_warnings(); $$
);

-- Auto-complete past bookings — every 30 minutes
DELETE FROM cron.job WHERE jobname = 'auto-complete-bookings';
SELECT cron.schedule(
  'auto-complete-bookings',
  '*/30 * * * *',
  $$ SELECT public.process_auto_complete_bookings(); $$
);

-- ───────────────────────────────────────────────────────────
-- VERIFY: Run this query after executing the script to confirm
--         all four jobs are registered correctly.
--
--   SELECT jobname, schedule, command, active
--     FROM cron.job
--    ORDER BY jobname;
-- ───────────────────────────────────────────────────────────

-- ============================================================
-- DONE — Automation system schema, triggers, and cron jobs created
-- ============================================================
