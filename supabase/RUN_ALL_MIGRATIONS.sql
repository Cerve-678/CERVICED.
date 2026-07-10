
-- ════════════════════════════════════════════════════
-- scheduling_settings.sql
-- ════════════════════════════════════════════════════
-- Scheduling settings — provider-level rules that control when clients can book.
-- Run in Supabase SQL editor. All IF NOT EXISTS — safe to re-run.

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS booking_window_days    INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS slot_interval_mins     INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS buffer_mins            INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_booking_notice_hrs INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN providers.booking_window_days    IS 'How many days ahead clients can book (0 = unlimited)';
COMMENT ON COLUMN providers.slot_interval_mins     IS 'Slot start-time step: 15, 30, or 60 minutes';
COMMENT ON COLUMN providers.buffer_mins            IS 'Gap blocked after each appointment ends';
COMMENT ON COLUMN providers.min_booking_notice_hrs IS 'Minimum hours of notice required to make a booking';

-- ════════════════════════════════════════════════════
-- max_bookings_per_day_migration.sql
-- ════════════════════════════════════════════════════
-- Add max_bookings_per_day column to providers table.
-- 0 means unlimited. Run in Supabase SQL editor. Safe to re-run.

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS max_bookings_per_day INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN providers.max_bookings_per_day IS 'Maximum confirmed bookings allowed per calendar day (0 = unlimited)';

-- ════════════════════════════════════════════════════
-- client_address_migration.sql
-- ════════════════════════════════════════════════════
-- Migration: Add client_address to bookings for mobile providers
-- When a provider is mobile they travel to the client, so the client's address is stored on the booking.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS client_address TEXT;

-- ════════════════════════════════════════════════════
-- cancellation_policy_migration.sql
-- ════════════════════════════════════════════════════
-- Cancellation policy — provider-level minimum notice required to cancel.
-- Run in Supabase SQL editor. Safe to re-run (IF NOT EXISTS).

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS cancellation_notice_hours INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN providers.cancellation_notice_hours IS
  'Minimum hours before appointment that a client can cancel (0 = anytime)';

-- ════════════════════════════════════════════════════
-- address_release_policy.sql
-- ════════════════════════════════════════════════════
-- Migration: address release policy
-- Adds business type, private full address, and release policy to providers.
-- Adds address_released_at tracking to bookings.

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS business_type TEXT
    CHECK (business_type IN ('salon','studio','home_based','mobile')),
  ADD COLUMN IF NOT EXISTS full_address TEXT,
  ADD COLUMN IF NOT EXISTS address_release_policy TEXT
    DEFAULT 'on_confirmation'
    CHECK (address_release_policy IN (
      'always','on_confirmation','day_before',
      'two_days_before','three_days_before','five_days_before','week_before',
      'manual'
    ));

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS address_released_at TIMESTAMPTZ;

-- Automatically release address when booking status moves to 'upcoming'
-- (handles the on_confirmation policy at the DB level as a safety net)
CREATE OR REPLACE FUNCTION public.auto_release_address()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'upcoming' AND OLD.status = 'pending' THEN
    UPDATE public.bookings
    SET address_released_at = NOW()
    WHERE id = NEW.id
      AND address_released_at IS NULL
      AND EXISTS (
        SELECT 1 FROM public.providers p
        WHERE p.id = NEW.provider_id
          AND p.address_release_policy = 'on_confirmation'
      );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_release_address ON public.bookings;
CREATE TRIGGER trg_auto_release_address
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.auto_release_address();

-- ════════════════════════════════════════════════════
-- client_profile_columns_migration.sql
-- ════════════════════════════════════════════════════
-- ============================================================
-- CERVICED: Missing client profile columns on users table
-- Run in Supabase SQL Editor
-- ============================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS service_locations    TEXT[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS maintenance_frequency TEXT,
  ADD COLUMN IF NOT EXISTS referral_source       TEXT;

-- ════════════════════════════════════════════════════
-- user_preferences_migration.sql
-- ════════════════════════════════════════════════════
-- ============================================================
-- USER PREFERENCES
-- Adds saved_portfolio and notification_preferences to users.
-- Run this in the Supabase SQL editor.
-- ============================================================

-- Array of portfolio item IDs the user has saved/hearted
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS saved_portfolio JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Notification preference toggles (mirrors NotificationsSettingsScreen)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB NOT NULL DEFAULT '{
    "bookingConfirm": true,
    "bookingReminder": true,
    "bookingUpdates": true,
    "promotions": false,
    "newProviders": true,
    "weeklySummary": false
  }'::jsonb;

-- ── RPC helpers for saved_portfolio JSONB array ───────────────────────────────

-- Append an item ID (no-op if already present)
CREATE OR REPLACE FUNCTION public.append_saved_portfolio_item(
  p_user_id UUID,
  p_item_id TEXT
) RETURNS VOID AS $$
BEGIN
  UPDATE public.users
     SET saved_portfolio = CASE
           WHEN saved_portfolio @> to_jsonb(p_item_id) THEN saved_portfolio
           ELSE saved_portfolio || to_jsonb(p_item_id)
         END
   WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remove an item ID
CREATE OR REPLACE FUNCTION public.remove_saved_portfolio_item(
  p_user_id UUID,
  p_item_id TEXT
) RETURNS VOID AS $$
BEGIN
  UPDATE public.users
     SET saved_portfolio = (
           SELECT jsonb_agg(elem)
             FROM jsonb_array_elements(saved_portfolio) AS elem
            WHERE elem <> to_jsonb(p_item_id)
         )
   WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ════════════════════════════════════════════════════
-- add_instagram_website_to_providers.sql
-- ════════════════════════════════════════════════════
-- Migration: add instagram and website columns to providers table
ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS instagram TEXT,
  ADD COLUMN IF NOT EXISTS website  TEXT;

-- ════════════════════════════════════════════════════
-- provider_follows_migration.sql
-- ════════════════════════════════════════════════════
-- ============================================================
-- PROVIDER FOLLOWS
-- Run this in the Supabase SQL editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.provider_follows (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id)     ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_follows_provider_id ON public.provider_follows(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_follows_user_id     ON public.provider_follows(user_id);

ALTER TABLE public.provider_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own follows" ON public.provider_follows;
CREATE POLICY "Users manage their own follows"
  ON public.provider_follows
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Providers can read their follower rows" ON public.provider_follows;
CREATE POLICY "Providers can read their follower rows"
  ON public.provider_follows
  FOR SELECT
  TO authenticated
  USING (
    provider_id IN (
      SELECT id FROM public.providers WHERE user_id = auth.uid()
    )
  );

-- ════════════════════════════════════════════════════
-- prevent_double_booking.sql
-- ════════════════════════════════════════════════════
-- Prevent double-bookings at the database level.
-- Step 1: clean up any existing duplicate active bookings before creating the index.
-- For each duplicate slot, keep the booking with the best status (confirmed > upcoming >
-- in_progress > pending) and cancel the rest. Uses created_at as tiebreaker.

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY provider_id, booking_date, booking_time
      ORDER BY
        CASE status
          WHEN 'confirmed'   THEN 1
          WHEN 'upcoming'    THEN 2
          WHEN 'in_progress' THEN 3
          WHEN 'pending'     THEN 4
          ELSE 5
        END,
        created_at ASC
    ) AS rn
  FROM public.bookings
  WHERE status NOT IN ('cancelled', 'no_show')
)
UPDATE public.bookings
SET status = 'cancelled'
WHERE id IN (
  SELECT id FROM ranked WHERE rn > 1
);

-- Step 2: now that duplicates are resolved, create the unique index.
CREATE UNIQUE INDEX IF NOT EXISTS bookings_no_double_book_idx
  ON bookings (provider_id, booking_date, booking_time)
  WHERE status NOT IN ('cancelled', 'no_show');

-- ════════════════════════════════════════════════════
-- intake_forms_migration.sql
-- ════════════════════════════════════════════════════
-- ============================================================
-- CERVICED: Client Intake Forms Migration
-- Run in Supabase SQL Editor
-- ============================================================

-- ── 1. Ensure beauty-profile columns exist on users table ──
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS hair_type            TEXT,
  ADD COLUMN IF NOT EXISTS skin_type            TEXT,
  ADD COLUMN IF NOT EXISTS allergies            TEXT[]   DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS skin_concerns        TEXT[]   DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS style_vibe           TEXT,
  ADD COLUMN IF NOT EXISTS medical_notes        TEXT,
  ADD COLUMN IF NOT EXISTS photography_consent  BOOLEAN  DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS treatment_history    TEXT[]   DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS service_interests    TEXT[]   DEFAULT '{}';

-- ── 2. booking_intake_forms table ──────────────────────────
CREATE TABLE IF NOT EXISTS public.booking_intake_forms (
  id              UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      UUID      NOT NULL REFERENCES public.bookings(id)   ON DELETE CASCADE,
  provider_id     UUID      NOT NULL REFERENCES public.providers(id)  ON DELETE CASCADE,
  client_user_id  UUID      NOT NULL REFERENCES public.users(id)      ON DELETE CASCADE,
  title           TEXT      NOT NULL DEFAULT 'Pre-Appointment Form',
  questions       JSONB     NOT NULL DEFAULT '[]',
  answers         JSONB,
  status          TEXT      NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'completed')),
  sent_at         TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intake_forms_booking_id
  ON public.booking_intake_forms(booking_id);
CREATE INDEX IF NOT EXISTS idx_intake_forms_client_user_id
  ON public.booking_intake_forms(client_user_id);
CREATE INDEX IF NOT EXISTS idx_intake_forms_provider_id
  ON public.booking_intake_forms(provider_id);
CREATE INDEX IF NOT EXISTS idx_intake_forms_status
  ON public.booking_intake_forms(status);

-- ── 3. Row-Level Security ───────────────────────────────────
ALTER TABLE public.booking_intake_forms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "provider_insert_intake_forms" ON public.booking_intake_forms;
CREATE POLICY "provider_insert_intake_forms" ON public.booking_intake_forms
  FOR INSERT WITH CHECK (
    provider_id IN (
      SELECT id FROM public.providers WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "provider_select_intake_forms" ON public.booking_intake_forms;
CREATE POLICY "provider_select_intake_forms" ON public.booking_intake_forms
  FOR SELECT USING (
    provider_id IN (
      SELECT id FROM public.providers WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "provider_update_intake_forms" ON public.booking_intake_forms;
CREATE POLICY "provider_update_intake_forms" ON public.booking_intake_forms
  FOR UPDATE USING (
    provider_id IN (
      SELECT id FROM public.providers WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "client_select_intake_forms" ON public.booking_intake_forms;
CREATE POLICY "client_select_intake_forms" ON public.booking_intake_forms
  FOR SELECT USING (client_user_id = auth.uid());

DROP POLICY IF EXISTS "client_submit_intake_forms" ON public.booking_intake_forms;
CREATE POLICY "client_submit_intake_forms" ON public.booking_intake_forms
  FOR UPDATE USING  (client_user_id = auth.uid())
  WITH CHECK (client_user_id = auth.uid());

-- ════════════════════════════════════════════════════
-- form_library_migration.sql
-- ════════════════════════════════════════════════════
-- Run this in Supabase SQL Editor after intake_forms_migration.sql

-- ── Provider Form Library ────────────────────────────────────────────────────
-- Forms the provider builds and saves; not tied to a specific booking yet.

CREATE TABLE IF NOT EXISTS provider_form_library (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id        UUID REFERENCES providers(id) ON DELETE CASCADE NOT NULL,
  title              TEXT NOT NULL,
  questions          JSONB NOT NULL DEFAULT '[]',
  service_names      TEXT[] NOT NULL DEFAULT '{}',   -- provider service names this form is for
  auto_send          BOOLEAN NOT NULL DEFAULT FALSE,  -- auto-send when matching service is booked
  requires_signature BOOLEAN NOT NULL DEFAULT FALSE,
  sent_count         INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE provider_form_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "provider_form_library_all" ON provider_form_library;
CREATE POLICY "provider_form_library_all"
ON provider_form_library FOR ALL
USING (
  provider_id IN (SELECT id FROM providers WHERE user_id = auth.uid())
);

-- ── Extend booking_intake_forms ──────────────────────────────────────────────
-- Link sent instances back to their library template, and capture signature.

ALTER TABLE booking_intake_forms
  ADD COLUMN IF NOT EXISTS library_form_id  UUID REFERENCES provider_form_library(id),
  ADD COLUMN IF NOT EXISTS requires_signature BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS client_signature  TEXT DEFAULT NULL;

-- ════════════════════════════════════════════════════
-- waitlist_schema.sql
-- ════════════════════════════════════════════════════
-- ============================================================
-- Provider Service Waitlist
-- Run this in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.provider_waitlist (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id            UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  user_id                UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_id             UUID REFERENCES public.services(id) ON DELETE SET NULL,
  service_name_snapshot  TEXT NOT NULL,
  provider_name_snapshot TEXT NOT NULL,
  user_name_snapshot     TEXT,
  preferred_dates        DATE[],
  notes                  TEXT,
  status                 TEXT NOT NULL DEFAULT 'waiting'
                         CHECK (status IN ('waiting','notified','booked','expired','cancelled')),
  position               INTEGER NOT NULL,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  notified_at            TIMESTAMPTZ,
  expires_at             TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
  UNIQUE(provider_id, user_id, service_id)
);

-- Auto-assign position (1-based per provider+service among 'waiting' entries)
CREATE OR REPLACE FUNCTION public.assign_waitlist_position()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  SELECT COALESCE(MAX(position), 0) + 1 INTO NEW.position
  FROM public.provider_waitlist
  WHERE provider_id = NEW.provider_id
    AND service_id IS NOT DISTINCT FROM NEW.service_id
    AND status = 'waiting';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_waitlist_position ON public.provider_waitlist;
CREATE TRIGGER trg_waitlist_position
  BEFORE INSERT ON public.provider_waitlist
  FOR EACH ROW EXECUTE FUNCTION public.assign_waitlist_position();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_waitlist_provider ON public.provider_waitlist(provider_id, service_id, status, position);
CREATE INDEX IF NOT EXISTS idx_waitlist_user     ON public.provider_waitlist(user_id, status);

-- RLS
ALTER TABLE public.provider_waitlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Waitlist participants can see and manage their entries" ON public.provider_waitlist;
CREATE POLICY "Waitlist participants can see and manage their entries"
  ON public.provider_waitlist
  FOR ALL USING (
    auth.uid() = user_id
    OR auth.uid() IN (SELECT user_id FROM public.providers WHERE id = provider_id)
  );

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.provider_waitlist;

-- ════════════════════════════════════════════════════
-- automation_jobs.sql
-- ════════════════════════════════════════════════════
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
--   cron.schedule() upserts by job_name — re-running this with the same
--   name updates the existing job in place, so this script is safe to
--   re-run without creating duplicates. (Deliberately not using
--   DELETE FROM cron.job first — Supabase blocks direct DML on that
--   table; cron.schedule/cron.unschedule are the sanctioned interface.)
-- ───────────────────────────────────────────────────────────

-- Provider 24hr reminders — every day at 08:00 UTC
SELECT cron.schedule(
  'provider-24hr-reminders',
  '0 8 * * *',
  $$ SELECT public.process_provider_24hr_reminders(); $$
);

-- User 24hr reminders — every day at 08:00 UTC
SELECT cron.schedule(
  'user-24hr-reminders',
  '0 8 * * *',
  $$ SELECT public.process_user_24hr_reminders(); $$
);

-- Pending booking warnings — every day at 10:00 UTC
SELECT cron.schedule(
  'pending-booking-warnings',
  '0 10 * * *',
  $$ SELECT public.process_pending_booking_warnings(); $$
);

-- Auto-complete past bookings — every 30 minutes
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

-- ════════════════════════════════════════════════════
-- enable_realtime.sql
-- ════════════════════════════════════════════════════
-- ============================================================
-- Enable Realtime on key tables (safe to re-run)
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'bookings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'booking_reschedule_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_reschedule_requests;
  END IF;
END $$;
