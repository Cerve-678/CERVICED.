-- ============================================================
-- CERVICED — Client-Facing Automation Jobs
-- Makes the Automations screen settings actually execute for clients.
--
-- Providers configure automations in ProviderAutomationsScreen; those
-- settings are mirrored onto providers.automation_settings (JSONB) by the
-- app so this file's cron jobs and triggers can read them (auth
-- user_metadata is NOT readable here).
--
-- Run this in the Supabase SQL editor. Self-contained — enables pg_cron
-- itself. Safe to re-run.
-- ============================================================

-- ───────────────────────────────────────────────────────────
-- STEP 0: Enable pg_cron extension
-- ───────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
GRANT USAGE ON SCHEMA cron TO postgres;

-- ───────────────────────────────────────────────────────────
-- STEP 1: providers.automation_settings mirror column
--   Written by ProviderAutomationsScreen on save. Keys used here:
--   clientReminderTiming (text[] e.g. ["24h","48h"]), rebookingNudgeWeeks
--   ('never'|'2'|'4'|...), autoReviewRequest, postApptCheckIn,
--   birthdayGreeting, waitlistEnabled (client UI),
--   autoAcceptWaitlist, depositRequiredNew.
--   NULL settings = provider never saved the screen → defaults apply
--   (24h reminder on, everything else off) to preserve old behaviour.
-- ───────────────────────────────────────────────────────────
ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS automation_settings JSONB;

-- ───────────────────────────────────────────────────────────
-- STEP 2: Expand notifications.type CHECK constraint
--   Adds the two client-facing types introduced with this feature:
--     announcement         — provider broadcast to clients (was wrongly
--                            sent as provider_message, which client mode
--                            hides in NotificationsScreen)
--     intake_form_received — client got a form to fill in
--   Keep in sync with the copies in provider_reminder_jobs.sql,
--   notifications_full_matrix.sql, chat_two_way_fix.sql and
--   RUN_ALL_MIGRATIONS.sql — whichever runs last wins.
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
    'intake_form_received',
    'intake_form_completed',
    'info_pack_received',
    'provider_message',
    'announcement',
    'balance_collected',
    'balance_reminder',
    'waitlist_slot_available',
    'new_message'
  )) NOT VALID; -- enforce new rows only; legacy rows must not fail the migration

-- ───────────────────────────────────────────────────────────
-- STEP 3: process_scheduled_promotion_notifications()
--   Runs every 15 minutes.
--   Sends promotions whose scheduled_notify_at has passed. Previously
--   these only went out if the provider happened to open the Promotions
--   screen after the scheduled time. Claims notify_sent_at up-front so
--   it cannot race the in-app fallback.
--   SUPERSEDED by supabase/promotion_interest_targeting.sql, which
--   CREATE OR REPLACEs this function to also include provider_follows
--   (previously ignored entirely) alongside bookmarks/booking history —
--   still strictly this provider's own audience. Run that file too —
--   order doesn't matter, it always wins since it's the more specific
--   migration.
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_scheduled_promotion_notifications()
RETURNS VOID AS $$
DECLARE
  promo   RECORD;
  v_badge TEXT;
BEGIN
  FOR promo IN
    SELECT pr.*, p.display_name
      FROM public.promotions pr
      JOIN public.providers p ON p.id = pr.provider_id
     WHERE pr.scheduled_notify_at IS NOT NULL
       AND pr.notify_sent_at IS NULL
       AND pr.scheduled_notify_at <= NOW()
       AND pr.is_active = TRUE
  LOOP
    -- Claim before sending — skip if the app already sent it meanwhile
    UPDATE public.promotions
       SET notify_sent_at = NOW()
     WHERE id = promo.id AND notify_sent_at IS NULL;
    IF NOT FOUND THEN CONTINUE; END IF;

    v_badge := COALESCE(
      promo.discount_text,
      CASE
        WHEN promo.discount_percent IS NOT NULL THEN promo.discount_percent || '% OFF'
        WHEN promo.discount_amount  IS NOT NULL THEN '£' || promo.discount_amount || ' OFF'
        ELSE 'Special Offer'
      END
    );

    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, provider_id, metadata)
    SELECT DISTINCT
      b.user_id,
      'promotion',
      v_badge || ' — ' || COALESCE(promo.display_name, 'Your provider'),
      promo.title,
      'medium',
      FALSE,
      promo.provider_id,
      jsonb_build_object('promo_id', promo.id)
    FROM public.bookings b
    WHERE b.provider_id = promo.provider_id
      AND b.status IN ('completed', 'confirmed');
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ───────────────────────────────────────────────────────────
-- STEP 4: process_client_appointment_reminders()
--   Runs daily at 08:00 UTC — REPLACES the old user-24hr-reminders job
--   (same cron job name, re-pointed below) so the two never double-send.
--   Honours the provider's clientReminderTiming setting: '24h' (default),
--   '48h', '72h'. Tags each notification with metadata.reminder_timing so
--   one booking can receive each enabled timing exactly once.
--   NOTE: if automation_jobs.sql is re-run later it re-points the job back
--   to process_user_24hr_reminders (24h-only); re-run this file after it.
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_client_appointment_reminders()
RETURNS VOID AS $$
DECLARE
  t RECORD;
  r RECORD;
BEGIN
  FOR t IN SELECT * FROM (VALUES ('24h', 1), ('48h', 2), ('72h', 3)) AS v(timing, days_ahead)
  LOOP
    FOR r IN
      SELECT
        b.id                    AS booking_id,
        b.user_id,
        b.booking_time,
        b.service_name_snapshot,
        b.provider_name_snapshot,
        b.provider_id
      FROM public.bookings b
      JOIN public.users u     ON u.id = b.user_id
      JOIN public.providers p ON p.id = b.provider_id
      WHERE b.booking_date = CURRENT_DATE + t.days_ahead
        AND b.status = 'confirmed'
        AND u.reminder_enabled = TRUE
        AND COALESCE(p.automation_settings->'clientReminderTiming', '["24h"]'::jsonb) ? t.timing
        AND NOT EXISTS (
          SELECT 1
            FROM public.notifications n
           WHERE n.booking_id = b.id
             AND n.user_id    = b.user_id
             AND n.type       = 'booking_reminder'
             AND (
               n.metadata->>'reminder_timing' = t.timing
               -- legacy untagged 24h reminders from the old job
               OR (t.timing = '24h' AND n.metadata->>'reminder_timing' IS NULL)
             )
        )
    LOOP
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, metadata)
      VALUES (
        r.user_id,
        'booking_reminder',
        CASE t.timing WHEN '24h' THEN 'Appointment Tomorrow' ELSE 'Upcoming Appointment' END,
        'Your ' || r.service_name_snapshot ||
          ' with ' || r.provider_name_snapshot ||
          ' is ' || CASE t.timing WHEN '24h' THEN 'tomorrow' WHEN '48h' THEN 'in 2 days' ELSE 'in 3 days' END ||
          ' at ' || TO_CHAR(r.booking_time, 'HH12:MI AM') ||
          CASE t.timing WHEN '24h' THEN '. Please arrive 10 minutes early.' ELSE '.' END,
        'medium',
        TRUE,
        r.booking_id,
        r.provider_id,
        jsonb_build_object('reminder_timing', t.timing)
      );
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ───────────────────────────────────────────────────────────
-- STEP 5: process_rebooking_nudges()
--   Runs daily at 09:00 UTC.
--   For providers with rebookingNudgeWeeks set (not 'never'): clients whose
--   most recent completed booking was exactly N weeks ago and who have no
--   upcoming booking with that provider get a "book again" nudge.
--   Duplicate guard: one nudge per client/provider per 21 days
--   (metadata.kind = 'rebooking_nudge').
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_rebooking_nudges()
RETURNS VOID AS $$
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
         AND n.type        = 'booking_reminder'
         AND n.metadata->>'kind' = 'rebooking_nudge'
         AND n.created_at  > NOW() - INTERVAL '21 days'
    ) THEN CONTINUE; END IF;

    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, provider_id, metadata)
    VALUES (
      r.user_id,
      'booking_reminder',
      COALESCE(r.display_name, 'Your provider') || ' misses you!',
      'It''s been a while since your last appointment — book your next one now.',
      'medium',
      TRUE,
      r.provider_id,
      jsonb_build_object('kind', 'rebooking_nudge')
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ───────────────────────────────────────────────────────────
-- STEP 6: process_post_appt_check_ins()
--   Runs daily at 10:00 UTC.
--   Day-after check-in for completed bookings when the provider enabled
--   postApptCheckIn. Sent as 'announcement' (client-visible type).
--   Duplicate guard: one per booking (metadata.kind = 'post_appt_check_in').
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_post_appt_check_ins()
RETURNS VOID AS $$
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
      'announcement',
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ───────────────────────────────────────────────────────────
-- STEP 7: process_birthday_greetings()
--   Runs daily at 09:00 UTC.
--   Clients with a birthday today get a greeting from each provider they
--   have completed a booking with, when that provider enabled
--   birthdayGreeting. Duplicate guard: one per client/provider per 300 days.
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_birthday_greetings()
RETURNS VOID AS $$
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
      'announcement',
      COALESCE(r.display_name, 'Your provider') || ' — Happy Birthday! 🎂',
      'Wishing you a wonderful birthday! Treat yourself — your next appointment is just a tap away.',
      'low',
      TRUE,
      r.provider_id,
      jsonb_build_object('kind', 'birthday_greeting')
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ───────────────────────────────────────────────────────────
-- STEP 8: Auto-send intake form on new bookings
--   Mirrors the info-pack auto-attach trigger: a library form marked
--   auto_send whose service_names match the booked service (or is
--   blank = all services) is sent automatically, no separate provider-
--   level toggle required — the per-form Auto-send switch is the only
--   gate, same as how info packs have no gate beyond service match.
--   Mirrors databaseService.sendLibraryFormToBooking.
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_auto_send_intake_form()
RETURNS TRIGGER AS $$
DECLARE
  v_provider RECORD;
  v_form     RECORD;
BEGIN
  SELECT id, display_name
    INTO v_provider
    FROM public.providers
   WHERE id = NEW.provider_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT *
    INTO v_form
    FROM public.provider_form_library f
   WHERE f.provider_id = NEW.provider_id
     AND f.auto_send = TRUE
     AND (cardinality(f.service_names) = 0 OR NEW.service_name_snapshot = ANY(f.service_names))
   ORDER BY f.created_at DESC
   LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF EXISTS (SELECT 1 FROM public.booking_intake_forms bf WHERE bf.booking_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.booking_intake_forms
    (booking_id, provider_id, client_user_id, title, questions, requires_signature, library_form_id)
  VALUES
    (NEW.id, NEW.provider_id, NEW.user_id, v_form.title, v_form.questions, v_form.requires_signature, v_form.id);

  UPDATE public.provider_form_library
     SET sent_count = COALESCE(sent_count, 0) + 1
   WHERE id = v_form.id;

  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, metadata)
  VALUES (
    NEW.user_id,
    'intake_form_received',
    'Form to Complete',
    COALESCE(v_provider.display_name, 'Your provider') || ' sent you "' || v_form.title ||
      '" to fill in before your appointment.',
    'high',
    TRUE,
    NEW.id,
    NEW.provider_id,
    jsonb_build_object('kind', 'auto_send_intake_form')
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_booking_auto_send_intake ON public.bookings;
CREATE TRIGGER on_booking_auto_send_intake
  AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.handle_auto_send_intake_form();

-- ───────────────────────────────────────────────────────────
-- STEP 9: Schedule the cron jobs
--   cron.schedule() upserts by job_name — safe to re-run.
--   NOTE: 'user-24hr-reminders' deliberately reuses the job name from
--   automation_jobs.sql so the old 24h-only function stops running and
--   the timing-aware one takes over without double sends.
-- ───────────────────────────────────────────────────────────

-- Scheduled promotion notifications — every 15 minutes
SELECT cron.schedule(
  'scheduled-promotion-notifications',
  '*/15 * * * *',
  $$ SELECT public.process_scheduled_promotion_notifications(); $$
);

-- Client appointment reminders (24h/48h/72h per provider setting) — daily 08:00 UTC
SELECT cron.schedule(
  'user-24hr-reminders',
  '0 8 * * *',
  $$ SELECT public.process_client_appointment_reminders(); $$
);

-- Rebooking nudges — daily 09:00 UTC
SELECT cron.schedule(
  'client-rebooking-nudges',
  '0 9 * * *',
  $$ SELECT public.process_rebooking_nudges(); $$
);

-- Post-appointment check-ins — daily 10:00 UTC
SELECT cron.schedule(
  'client-post-appt-check-ins',
  '0 10 * * *',
  $$ SELECT public.process_post_appt_check_ins(); $$
);

-- Birthday greetings — daily 09:00 UTC
SELECT cron.schedule(
  'client-birthday-greetings',
  '0 9 * * *',
  $$ SELECT public.process_birthday_greetings(); $$
);

-- ───────────────────────────────────────────────────────────
-- VERIFY: after running, confirm the jobs are registered:
--
--   SELECT jobname, schedule, command, active
--     FROM cron.job
--    ORDER BY jobname;
-- ───────────────────────────────────────────────────────────

-- ============================================================
-- DONE — Client-facing automation jobs created
-- ============================================================
