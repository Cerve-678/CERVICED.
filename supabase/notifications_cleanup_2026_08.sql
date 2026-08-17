-- ============================================================
-- CERVICED — Notification system cleanup (2026-08-01)
-- Run this in the Supabase SQL editor. Safe to re-run.
-- All statements verified against the LIVE DB via pg_get_functiondef /
-- pg_trigger / cron.job before writing this — see the per-section notes.
--
-- Covers five separate, user-requested fixes:
--   1. Remove the "Outstanding Balance" reminder entirely — the app has no
--      business nagging providers about an off-app remaining-balance payment
--      it never collects or verifies (see LEGAL-COMPLIANCE-NOTES.md /
--      CLAUDE.md's deposit/balance liability boundary — the "mark balance
--      collected" feature was already removed for the same reason).
--   2. Drop the now-fully-dead 'balance_collected' notification type from
--      the CHECK constraint (0 live rows use it, confirmed; nothing else in
--      the app or DB writes it — it was debris from the same removal).
--   3. Make birthday_greeting / post_appt_check_in / rebooking_nudge /
--      daily_recap real `type` values instead of being filed under the
--      generic 'announcement'/'booking_reminder' buckets with the real
--      identity hidden in metadata->>'kind'. The CHECK constraint already
--      allowed these 4 values (fix_notifications_type_check.sql added them
--      defensively) — nothing was writing them until now.
--   4. Drop process_user_24hr_reminders() — dead code. The 'user-24hr-
--      reminders' cron job (confirmed live) already calls
--      process_client_appointment_reminders() (the tiered 24h/48h/72h
--      version), not this one. This function has zero callers.
--   5. Drop handle_booking_cancelled() — dead code. Confirmed zero triggers
--      attached (pg_trigger). Superseded by handle_booking_status_change().
--      Left alone it's harmless; if anyone ever re-attaches it by mistake,
--      it defines its own slightly different cancellation/review wording
--      and would double-fire alongside handle_booking_status_change().
--
-- NOT changed: the "Intake Form Not Sent" provider reminder
-- (process_provider_intake_form_reminders) and the client-facing "To Do"
-- notification (handle_booking_todo_notification) — the latter was checked
-- against its live source and already fires correctly when only a form OR
-- only an info pack is present (not just when both are), so no fix needed.
-- NOT changed: process_provider_unpaid_deposit_reminders ("Payment Not
-- Collected") — a distinct concept (an in-app deposit not yet collected
-- before the appointment) from the removed outstanding-balance reminder.
-- ============================================================

BEGIN;

-- 1. Remove the outstanding-balance reminder entirely ──────────────────────
SELECT cron.unschedule('provider-outstanding-balance-reminders');
DROP FUNCTION IF EXISTS public.process_provider_outstanding_balance_reminders();

-- 2 & 3. Rebuild the type CHECK: drop 'balance_collected', keep everything
-- else (the 4 "dead" values were already allowed; they're used for real
-- starting with the function updates below) ────────────────────────────────
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
    'rebooking_nudge', 'daily_recap'
    -- 'balance_collected' removed: 0 live rows, no producer anywhere.
  ));

-- 3. Give the 4 automation notifications their own real type ───────────────
CREATE OR REPLACE FUNCTION public.process_birthday_greetings()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT
      u.id AS user_id,
      p.id AS provider_id,
      p.display_name
    FROM public.users u
    JOIN public.bookings b  ON b.user_id = u.id AND b.status = 'completed'
    JOIN public.providers p ON p.id = b.provider_id
    WHERE u.dob IS NOT NULL
      AND TO_CHAR(u.dob::DATE, 'MM-DD') = TO_CHAR(CURRENT_DATE, 'MM-DD')
      AND COALESCE((p.automation_settings->>'birthdayGreeting')::BOOLEAN, FALSE) = TRUE
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.notifications n
       WHERE n.user_id     = r.user_id
         AND n.provider_id = r.provider_id
         AND n.metadata->>'kind' = 'birthday_greeting'
         AND n.created_at  > NOW() - INTERVAL '300 days'
    ) THEN CONTINUE; END IF;

    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, provider_id, metadata)
    VALUES (
      r.user_id,
      'birthday_greeting',
      COALESCE(r.display_name, 'Your provider') || ' — Happy Birthday! 🎂',
      'Wishing you a wonderful birthday! Treat yourself — your next appointment is just a tap away.',
      'low',
      TRUE,
      r.provider_id,
      jsonb_build_object('kind', 'birthday_greeting')
    );
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_post_appt_check_ins()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      b.id AS booking_id,
      b.user_id,
      b.provider_id,
      b.service_name_snapshot,
      p.display_name
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
    WHERE b.status = 'completed'
      AND b.booking_date = CURRENT_DATE - 1
      AND COALESCE((p.automation_settings->>'postApptCheckIn')::BOOLEAN, FALSE) = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
         WHERE n.booking_id = b.id
           AND n.user_id    = b.user_id
           AND n.metadata->>'kind' = 'post_appt_check_in'
      )
  LOOP
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, metadata)
    VALUES (
      r.user_id,
      'post_appt_check_in',
      COALESCE(r.display_name, 'Your provider') || ' — Checking In',
      'How are you getting on after your ' || r.service_name_snapshot ||
        '? If you have any questions or need aftercare advice, just send a message.',
      'low',
      TRUE,
      r.booking_id,
      r.provider_id,
      jsonb_build_object('kind', 'post_appt_check_in')
    );
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_rebooking_nudges()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      b.user_id,
      b.provider_id,
      p.display_name
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
    WHERE p.automation_settings->>'rebookingNudgeWeeks' ~ '^[0-9]+$'
      AND b.status = 'completed'
    GROUP BY b.user_id, b.provider_id, p.display_name, p.automation_settings
    HAVING MAX(b.booking_date) = CURRENT_DATE
      - ((p.automation_settings->>'rebookingNudgeWeeks')::INT * 7)
      AND NOT EXISTS (
        SELECT 1 FROM public.bookings up
         WHERE up.user_id = b.user_id
           AND up.provider_id = b.provider_id
           AND up.status IN ('pending', 'confirmed')
           AND up.booking_date >= CURRENT_DATE
      )
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.notifications n
       WHERE n.user_id     = r.user_id
         AND n.provider_id = r.provider_id
         AND n.type        = 'rebooking_nudge'
         AND n.created_at  > NOW() - INTERVAL '21 days'
    ) THEN CONTINUE; END IF;

    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, provider_id, metadata)
    VALUES (
      r.user_id,
      'rebooking_nudge',
      COALESCE(r.display_name, 'Your provider') || ' misses you!',
      'It''s been a while since your last appointment — book your next one now.',
      'medium',
      TRUE,
      r.provider_id,
      jsonb_build_object('kind', 'rebooking_nudge')
    );
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_provider_daily_recap()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      p.id      AS provider_id,
      p.user_id AS provider_user_id,
      COUNT(*)  AS booking_count,
      MIN(b.booking_time) AS first_time
    FROM public.providers p
    JOIN public.bookings b ON b.provider_id = p.id
    WHERE b.booking_date = CURRENT_DATE
      AND b.status IN ('pending', 'confirmed')
      AND COALESCE((p.automation_settings->>'newBookingRecap')::BOOLEAN, TRUE) = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
         WHERE n.user_id = p.user_id
           AND n.metadata->>'kind' = 'daily_recap'
           AND n.created_at::DATE = CURRENT_DATE
      )
    GROUP BY p.id, p.user_id
  LOOP
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, provider_id, recipient_role, metadata)
    VALUES (
      r.provider_user_id,
      'daily_recap',
      'Today''s Schedule',
      'You have ' || r.booking_count || ' appointment' ||
        CASE WHEN r.booking_count = 1 THEN '' ELSE 's' END ||
        ' today, starting at ' || TO_CHAR(r.first_time, 'HH12:MI AM') || '.',
      'medium',
      TRUE,
      r.provider_id,
      'provider',
      jsonb_build_object('kind', 'daily_recap')
    );
  END LOOP;
END;
$function$;

-- 4. Drop dead process_user_24hr_reminders() ────────────────────────────────
DROP FUNCTION IF EXISTS public.process_user_24hr_reminders();

-- 5. Drop dead handle_booking_cancelled() ───────────────────────────────────
DROP FUNCTION IF EXISTS public.handle_booking_cancelled();

COMMIT;

-- VERIFY
--   select jobname from cron.job where jobname = 'provider-outstanding-balance-reminders';
--     → expect: 0 rows
--   select proname from pg_proc where pronamespace = 'public'::regnamespace
--     and proname in ('process_provider_outstanding_balance_reminders',
--                      'process_user_24hr_reminders', 'handle_booking_cancelled');
--     → expect: 0 rows
--   select pg_get_constraintdef(oid) from pg_constraint
--     where conrelid = 'public.notifications'::regclass and conname = 'notifications_type_check';
--     → expect: no 'balance_collected' in the list
-- ============================================================
