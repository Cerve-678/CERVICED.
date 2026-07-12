-- ============================================================
-- CERVICED — Provider Notification & Reminder Jobs
-- Run this in the Supabase SQL editor. Self-contained — enables
-- pg_cron itself, so it does not require automation_jobs.sql to have
-- been run first (though running that too is still recommended for
-- the 24hr-reminder and auto-accept jobs it defines).
-- Safe to re-run.
-- ============================================================

-- ───────────────────────────────────────────────────────────
-- STEP 0: Enable pg_cron extension
--   pg_cron must be enabled BEFORE creating cron jobs.
--   If you see "extension already exists" that is fine — safe to re-run.
-- ───────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
GRANT USAGE ON SCHEMA cron TO postgres;

-- ───────────────────────────────────────────────────────────
-- STEP 1: Expand notifications.type CHECK constraint
--   Adds: booking_not_started, intake_form_reminder, balance_reminder (new),
--   plus provider_message, balance_collected, waitlist_slot_available
--   (already declared in src/types/database.ts but never added here).
--   NOTE: balance_collected already means "your balance was marked received"
--   (client-facing, see ProviderBookingDetailScreen.tsx handleCollectBalance) —
--   the new provider-facing "you're owed money" nudges use balance_reminder
--   instead so the two don't collide.
-- ───────────────────────────────────────────────────────────
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'booking_pending',
    'booking_confirmed',
    'booking_declined',
    'booking_cancelled',
    'booking_reminder',
    'booking_in_progress',
    'booking_not_started',
    'no_show',
    'payment_success',
    'new_provider',
    'reschedule_request',
    'reschedule_provider_response',
    'reschedule_confirmed',
    'review_request',
    'review_received',
    'promotion',
    'intake_form_reminder',
    'intake_form_received',   -- client got a form to fill in (client_automation_jobs.sql)
    'intake_form_completed',  -- client sent a filled form back (info_packs_bookings.sql)
    'info_pack_received',     -- client got prep/aftercare info (info_packs_bookings.sql)
    'provider_message',
    'announcement',           -- provider broadcast to clients (client_automation_jobs.sql)
    'balance_collected',
    'balance_reminder',
    'waitlist_slot_available',
    'new_message'             -- chat message received (chat_two_way_fix.sql)
  )) NOT VALID; -- enforce new rows only; legacy rows must not fail the migration

-- ───────────────────────────────────────────────────────────
-- STEP 2: update_conversation_last_message — support provider replies
--   New optional p_sender_type param, defaults to 'user' so the existing
--   client call site (ProviderChatScreen.tsx) keeps working unchanged.
--   When the provider sends, bump the user's unread count instead and
--   clear the provider's own unread count.
--
--   The old 2-arg version MUST be dropped first: CREATE OR REPLACE with a
--   different signature creates an OVERLOAD, and with both versions present
--   PostgREST can no longer resolve the 2-arg RPC call from the client app
--   (ambiguous candidates) — chat unread counts silently stop updating.
-- ───────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.update_conversation_last_message(UUID, TEXT);

-- Definition kept byte-identical to chat_two_way_fix.sql — the same function
-- also lives in provider_chat_schema.sql and RUN_ALL_MIGRATIONS.sql; keep all
-- four in sync so behaviour never depends on which script ran last.
CREATE OR REPLACE FUNCTION public.update_conversation_last_message(
  conv_id       UUID,
  msg_text      TEXT,
  p_sender_type TEXT DEFAULT 'user'
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.provider_conversations
  SET last_message    = msg_text,
      last_message_at = NOW(),
      updated_at      = NOW(),
      -- A message is unread for the RECIPIENT, never the sender
      unread_count_provider = unread_count_provider
        + CASE WHEN p_sender_type = 'user'     THEN 1 ELSE 0 END,
      unread_count_user     = unread_count_user
        + CASE WHEN p_sender_type = 'provider' THEN 1 ELSE 0 END
  WHERE id = conv_id;
END;
$$;

-- ───────────────────────────────────────────────────────────
-- STEP 3: process_provider_unaccepted_booking_reminders()
--   Runs every 30 minutes.
--   Nudges providers about bookings still 'pending' more than 2 hours
--   after creation. Providers with auto_accept_bookings = TRUE never
--   have pending bookings, so this naturally excludes them.
--   Duplicate guard: skip if a booking_pending reminder for this booking
--   was already sent in the last 4 hours.
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_provider_unaccepted_booking_reminders()
RETURNS VOID AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      b.id                   AS booking_id,
      b.customer_name,
      b.service_name_snapshot,
      b.booking_date,
      b.booking_time,
      b.provider_id,
      p.user_id              AS provider_user_id
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
    WHERE b.status = 'pending'
      AND b.created_at < NOW() - INTERVAL '2 hours'
      AND p.reminder_notifications_enabled = TRUE
      AND NOT EXISTS (
        SELECT 1
          FROM public.notifications n
         WHERE n.booking_id  = b.id
           AND n.user_id     = p.user_id
           AND n.type        = 'booking_pending'
           AND n.created_at  > NOW() - INTERVAL '4 hours'
      )
  LOOP
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
    VALUES (
      r.provider_user_id,
      'booking_pending',
      'Booking Still Awaiting Your Response',
      COALESCE(r.customer_name, 'A client') || '''s request for ' ||
        r.service_name_snapshot || ' on ' || TO_CHAR(r.booking_date, 'DD Mon YYYY') ||
        ' is still waiting for you to confirm or decline.',
      'high',
      TRUE,
      r.booking_id,
      r.provider_id
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ───────────────────────────────────────────────────────────
-- STEP 4: process_provider_not_started_reminders()
--   Runs every 30 minutes.
--   Nudges providers about confirmed bookings whose start time passed
--   more than 15 minutes ago but haven't been moved to 'in_progress'.
--   Duplicate guard: skip if already reminded for this booking.
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_provider_not_started_reminders()
RETURNS VOID AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      b.id                   AS booking_id,
      b.customer_name,
      b.service_name_snapshot,
      b.booking_time,
      b.provider_id,
      p.user_id              AS provider_user_id
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
    WHERE b.status = 'confirmed'
      AND (b.booking_date::TIMESTAMP + b.booking_time) < NOW() - INTERVAL '15 minutes'
      AND p.reminder_notifications_enabled = TRUE
      AND NOT EXISTS (
        SELECT 1
          FROM public.notifications n
         WHERE n.booking_id = b.id
           AND n.user_id    = p.user_id
           AND n.type       = 'booking_not_started'
      )
  LOOP
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
    VALUES (
      r.provider_user_id,
      'booking_not_started',
      'Appointment Not Started',
      COALESCE(r.customer_name, 'A client') || '''s ' || r.service_name_snapshot ||
        ' was due to start at ' || TO_CHAR(r.booking_time, 'HH12:MI AM') ||
        '. Mark it as started or update its status.',
      'high',
      TRUE,
      r.booking_id,
      r.provider_id
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ───────────────────────────────────────────────────────────
-- STEP 5: process_provider_intake_form_reminders()
--   Runs daily at 08:00 UTC.
--   Nudges providers about confirmed bookings within the next 48 hours
--   that have no intake form sent, but only for providers who have used
--   intake forms before (avoids pestering providers who don't use them).
--   Duplicate guard: skip if already reminded for this booking in the
--   last 24 hours.
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_provider_intake_form_reminders()
RETURNS VOID AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      b.id                   AS booking_id,
      b.customer_name,
      b.service_name_snapshot,
      b.booking_date,
      b.provider_id,
      p.user_id              AS provider_user_id
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
    WHERE b.status = 'confirmed'
      AND (b.booking_date::TIMESTAMP + b.booking_time) BETWEEN NOW() AND NOW() + INTERVAL '48 hours'
      AND p.reminder_notifications_enabled = TRUE
      AND EXISTS (
        SELECT 1 FROM public.booking_intake_forms f2 WHERE f2.provider_id = p.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.booking_intake_forms f WHERE f.booking_id = b.id
      )
      AND NOT EXISTS (
        SELECT 1
          FROM public.notifications n
         WHERE n.booking_id  = b.id
           AND n.user_id     = p.user_id
           AND n.type        = 'intake_form_reminder'
           AND n.created_at  > NOW() - INTERVAL '24 hours'
      )
  LOOP
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
    VALUES (
      r.provider_user_id,
      'intake_form_reminder',
      'Intake Form Not Sent',
      COALESCE(r.customer_name, 'A client') || '''s ' || r.service_name_snapshot ||
        ' on ' || TO_CHAR(r.booking_date, 'DD Mon YYYY') ||
        ' is coming up and they haven''t received an intake form yet.',
      'medium',
      TRUE,
      r.booking_id,
      r.provider_id
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ───────────────────────────────────────────────────────────
-- STEP 6: process_provider_unread_message_reminders()
--   Runs every 30 minutes.
--   Nudges providers about client conversations with unread messages
--   that have sat for more than 2 hours without a reply.
--   Duplicate guard: skip if already reminded for this conversation in
--   the last 4 hours (matched via metadata->>'conversation_id', since
--   notifications has no dedicated conversation_id column).
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_provider_unread_message_reminders()
RETURNS VOID AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      c.id                   AS conversation_id,
      c.provider_id,
      p.user_id              AS provider_user_id,
      u.name                 AS client_name
    FROM public.provider_conversations c
    JOIN public.providers p ON p.id = c.provider_id
    JOIN public.users u     ON u.id = c.user_id
    WHERE c.unread_count_provider > 0
      AND c.updated_at < NOW() - INTERVAL '2 hours'
      AND p.reminder_notifications_enabled = TRUE
      AND NOT EXISTS (
        SELECT 1
          FROM public.notifications n
         WHERE n.provider_id = c.provider_id
           AND n.user_id     = p.user_id
           AND n.type        = 'provider_message'
           AND (n.metadata->>'conversation_id') = c.id::text
           AND n.created_at  > NOW() - INTERVAL '4 hours'
      )
  LOOP
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, provider_id, metadata)
    VALUES (
      r.provider_user_id,
      'provider_message',
      'Unread Message',
      COALESCE(r.client_name, 'A client') || ' is still waiting on a reply from you.',
      'medium',
      TRUE,
      r.provider_id,
      jsonb_build_object('conversation_id', r.conversation_id)
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ───────────────────────────────────────────────────────────
-- STEP 7: process_provider_outstanding_balance_reminders()
--   Runs every 6 hours.
--   Nudges providers about completed bookings with an unpaid balance,
--   at least 2 hours after the appointment's end time (so there's time
--   for in-person/manual payment to land first).
--   Duplicate guard: skip if already reminded for this booking in the
--   last 24 hours.
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_provider_outstanding_balance_reminders()
RETURNS VOID AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      b.id                   AS booking_id,
      b.customer_name,
      b.service_name_snapshot,
      b.remaining_balance,
      b.provider_id,
      p.user_id              AS provider_user_id
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
    WHERE b.status = 'completed'
      AND b.remaining_balance > 0
      AND b.payment_status NOT IN ('fully_paid', 'refunded')
      AND (
        (b.end_time IS NOT NULL AND (b.booking_date::TIMESTAMP + b.end_time) < NOW() - INTERVAL '2 hours')
        OR
        (b.end_time IS NULL     AND (b.booking_date::TIMESTAMP + b.booking_time + INTERVAL '1 hour') < NOW() - INTERVAL '2 hours')
      )
      AND p.reminder_notifications_enabled = TRUE
      AND NOT EXISTS (
        SELECT 1
          FROM public.notifications n
         WHERE n.booking_id  = b.id
           AND n.user_id     = p.user_id
           AND n.type        = 'balance_reminder'
           AND n.created_at  > NOW() - INTERVAL '24 hours'
      )
  LOOP
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
    VALUES (
      r.provider_user_id,
      'balance_reminder',
      'Outstanding Balance',
      COALESCE(r.customer_name, 'A client') || ' still owes £' ||
        TRIM(TO_CHAR(r.remaining_balance, 'FM999999990.00')) || ' for ' ||
        r.service_name_snapshot || '.',
      'medium',
      TRUE,
      r.booking_id,
      r.provider_id
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ───────────────────────────────────────────────────────────
-- STEP 8: process_provider_unpaid_deposit_reminders()
--   Runs every 30 minutes.
--   Nudges providers about confirmed bookings starting within 24 hours
--   that still show payment_status = 'pending'.
--   Duplicate guard: skip if already reminded for this booking in the
--   last 12 hours.
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_provider_unpaid_deposit_reminders()
RETURNS VOID AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      b.id                   AS booking_id,
      b.customer_name,
      b.service_name_snapshot,
      b.booking_date,
      b.booking_time,
      b.provider_id,
      p.user_id              AS provider_user_id
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
    WHERE b.status = 'confirmed'
      AND b.payment_status = 'pending'
      AND (b.booking_date::TIMESTAMP + b.booking_time) BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
      AND p.reminder_notifications_enabled = TRUE
      AND NOT EXISTS (
        SELECT 1
          FROM public.notifications n
         WHERE n.booking_id  = b.id
           AND n.user_id     = p.user_id
           AND n.type        = 'balance_reminder'
           AND n.created_at  > NOW() - INTERVAL '12 hours'
      )
  LOOP
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
    VALUES (
      r.provider_user_id,
      'balance_reminder',
      'Payment Not Collected',
      COALESCE(r.customer_name, 'A client') || '''s ' || r.service_name_snapshot ||
        ' on ' || TO_CHAR(r.booking_date, 'DD Mon YYYY') ||
        ' at ' || TO_CHAR(r.booking_time, 'HH12:MI AM') ||
        ' is coming up with no payment collected yet.',
      'high',
      TRUE,
      r.booking_id,
      r.provider_id
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ───────────────────────────────────────────────────────────
-- STEP 9: process_provider_stale_reschedule_reminders()
--   Runs every 30 minutes.
--   Nudges providers about client-initiated reschedule requests still
--   'pending' (provider hasn't offered alternative slots) more than
--   4 hours after being requested.
--   Duplicate guard: skip if already reminded for this request in the
--   last 8 hours.
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_provider_stale_reschedule_reminders()
RETURNS VOID AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      rr.id                  AS reschedule_id,
      rr.booking_id,
      b.customer_name,
      b.service_name_snapshot,
      b.provider_id,
      p.user_id              AS provider_user_id
    FROM public.booking_reschedule_requests rr
    JOIN public.bookings b  ON b.id = rr.booking_id
    JOIN public.providers p ON p.id = b.provider_id
    WHERE rr.requested_by = 'user'
      AND rr.status = 'pending'
      AND rr.created_at < NOW() - INTERVAL '4 hours'
      AND p.reminder_notifications_enabled = TRUE
      AND NOT EXISTS (
        SELECT 1
          FROM public.notifications n
         WHERE n.booking_id  = rr.booking_id
           AND n.user_id     = p.user_id
           AND n.type        = 'reschedule_request'
           AND n.created_at  > NOW() - INTERVAL '8 hours'
      )
  LOOP
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
    VALUES (
      r.provider_user_id,
      'reschedule_request',
      'Reschedule Request Awaiting Response',
      COALESCE(r.customer_name, 'A client') || ' asked to reschedule ' ||
        r.service_name_snapshot || ' and is waiting on available dates from you.',
      'high',
      TRUE,
      r.booking_id,
      r.provider_id
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ───────────────────────────────────────────────────────────
-- STEP 10: Schedule the seven new cron jobs
--   cron.schedule() upserts by job_name — re-running this with the same
--   name updates the existing job in place, so this script is safe to
--   re-run without creating duplicates. (Deliberately not using
--   DELETE FROM cron.job first — Supabase blocks direct DML on that
--   table; cron.schedule/cron.unschedule are the sanctioned interface.)
-- ───────────────────────────────────────────────────────────

-- Unaccepted booking reminders — every 30 minutes
SELECT cron.schedule(
  'provider-unaccepted-booking-reminders',
  '*/30 * * * *',
  $$ SELECT public.process_provider_unaccepted_booking_reminders(); $$
);

-- Not-started booking reminders — every 30 minutes
SELECT cron.schedule(
  'provider-not-started-reminders',
  '*/30 * * * *',
  $$ SELECT public.process_provider_not_started_reminders(); $$
);

-- Intake form reminders — every day at 08:00 UTC
SELECT cron.schedule(
  'provider-intake-form-reminders',
  '0 8 * * *',
  $$ SELECT public.process_provider_intake_form_reminders(); $$
);

-- Unread message reminders — every 30 minutes
SELECT cron.schedule(
  'provider-unread-message-reminders',
  '*/30 * * * *',
  $$ SELECT public.process_provider_unread_message_reminders(); $$
);

-- Outstanding balance reminders — every 6 hours
SELECT cron.schedule(
  'provider-outstanding-balance-reminders',
  '0 */6 * * *',
  $$ SELECT public.process_provider_outstanding_balance_reminders(); $$
);

-- Unpaid deposit reminders — every 30 minutes
SELECT cron.schedule(
  'provider-unpaid-deposit-reminders',
  '*/30 * * * *',
  $$ SELECT public.process_provider_unpaid_deposit_reminders(); $$
);

-- Stale reschedule request reminders — every 30 minutes
SELECT cron.schedule(
  'provider-stale-reschedule-reminders',
  '*/30 * * * *',
  $$ SELECT public.process_provider_stale_reschedule_reminders(); $$
);

-- ───────────────────────────────────────────────────────────
-- VERIFY: Run this query after executing the script to confirm
--         all seven new jobs are registered correctly.
--
--   SELECT jobname, schedule, command, active
--     FROM cron.job
--    ORDER BY jobname;
-- ───────────────────────────────────────────────────────────

-- ============================================================
-- DONE — Provider reminder jobs created
-- ============================================================
