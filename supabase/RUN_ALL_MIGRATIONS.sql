-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ CERVICED — RUN ALL MIGRATIONS (rebuilt in dependency order)      ║
-- ║                                                                  ║
-- ║ PREREQUISITE: phase1_schema.sql must already have been run once  ║
-- ║ (baseline tables: users, providers, services, bookings,          ║
-- ║ notifications, reviews…). It is NOT included here because its    ║
-- ║ CREATE POLICY statements are not re-runnable.                    ║
-- ║                                                                  ║
-- ║ ⚠️  BEFORE RUNNING: replace <YOUR_SERVICE_ROLE_KEY> in the        ║
-- ║ push_token_setup section near the bottom (Dashboard → Settings   ║
-- ║ → API → service_role). Without it, push notifications fail.      ║
-- ║                                                                  ║
-- ║ Safe to re-run end-to-end. Ordering matters:                     ║
-- ║ notifications_full_matrix defines on_booking_status_changed,     ║
-- ║ which automation_jobs' auto-accept depends on.                   ║
-- ╚══════════════════════════════════════════════════════════════════╝


-- ════════════════════════════════════════════════════
-- notifications_full_matrix.sql
-- ════════════════════════════════════════════════════
-- ============================================================
-- FULL NOTIFICATION MATRIX
-- Run this in the Supabase SQL editor.
-- ============================================================

-- ───────────────────────────────────────────────────────────
-- 1. Expand the notifications.type CHECK constraint
-- ───────────────────────────────────────────────────────────
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

-- NOTE: this list must stay a SUPERSET of every type the app inserts —
-- keep it in sync with provider_reminder_jobs.sql STEP 1 and
-- src/types/database.ts NotificationType. A narrower list here silently
-- breaks inserts (waitlist invites, provider messages, balance nudges…)
-- if this file is re-run after the others.
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'booking_pending',        -- new booking awaiting provider confirmation
    'booking_confirmed',      -- provider confirmed the booking
    'booking_declined',       -- provider declined the booking
    'booking_cancelled',      -- booking cancelled (after confirmation)
    'booking_reminder',       -- upcoming appointment reminder
    'booking_in_progress',    -- provider started the session
    'booking_not_started',    -- confirmed booking past start time, not started
    'no_show',                -- provider marked client as no-show
    'payment_success',        -- payment processed
    'new_provider',           -- new provider joined
    'reschedule_request',            -- user requested a reschedule
    'reschedule_provider_response',  -- provider responded with available dates
    'reschedule_confirmed',          -- user confirmed a new date/time
    'review_request',         -- prompt user to leave a review
    'review_received',        -- provider received a new review
    'promotion',              -- promotional offer
    'intake_form_reminder',   -- provider nudge: send intake form
    'intake_form_received',   -- client got a form to fill in
    'intake_form_completed',  -- client sent a filled form back
    'info_pack_received',     -- client got prep/aftercare info
    'provider_message',       -- provider-side message nudges
    'announcement',           -- provider broadcast to clients (client-visible)
    'balance_collected',      -- remaining balance marked received
    'balance_reminder',       -- provider nudge: outstanding balance
    'waitlist_slot_available',-- waitlist invite after a cancellation
    'new_message'             -- chat message received (chat_two_way_fix.sql)
  )) NOT VALID; -- enforce new rows only; legacy rows must not fail the migration

-- automation_settings mirror column (also created in client_automation_jobs.sql;
-- repeated here because handle_booking_status_change below reads it at runtime)
ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS automation_settings JSONB;

-- ───────────────────────────────────────────────────────────
-- 2. handle_new_booking is defined in automation_jobs.sql
--    (includes auto-accept logic). Do not redefine it here.
-- ───────────────────────────────────────────────────────────

-- ───────────────────────────────────────────────────────────
-- 3. handle_booking_status_change — fires on UPDATE OF status
--    Covers: confirmed, declined, in_progress, no_show, cancelled, completed
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_booking_status_change()
RETURNS TRIGGER AS $$
BEGIN

  -- Provider confirmed: pending → confirmed
  IF NEW.status = 'confirmed' AND OLD.status = 'pending' THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
    VALUES (
      NEW.user_id,
      'booking_confirmed',
      'Booking Confirmed! 🎉',
      NEW.provider_name_snapshot || ' confirmed your booking for ' ||
        NEW.service_name_snapshot ||
        ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') ||
        ' at ' || TO_CHAR(NEW.booking_time, 'HH12:MI AM') || '.',
      'high',
      TRUE,
      NEW.id,
      NEW.provider_id
    );
    RETURN NEW;
  END IF;

  -- Provider declined: pending → cancelled
  IF NEW.status = 'cancelled' AND OLD.status = 'pending' THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
    VALUES (
      NEW.user_id,
      'booking_declined',
      'Booking Declined',
      'Unfortunately, ' || NEW.provider_name_snapshot ||
        ' is unable to accept your booking for ' ||
        NEW.service_name_snapshot ||
        ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || '.',
      'high',
      FALSE,
      NEW.id,
      NEW.provider_id
    );
    RETURN NEW;
  END IF;

  -- Provider started session: * → in_progress
  IF NEW.status = 'in_progress' AND OLD.status != 'in_progress' THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
    VALUES (
      NEW.user_id,
      'booking_in_progress',
      'Your Appointment Has Started',
      NEW.provider_name_snapshot || ' has started your ' ||
        NEW.service_name_snapshot || ' appointment.',
      'high',
      FALSE,
      NEW.id,
      NEW.provider_id
    );
    RETURN NEW;
  END IF;

  -- Provider marked no-show: * → no_show
  IF NEW.status = 'no_show' AND OLD.status != 'no_show' THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
    VALUES (
      NEW.user_id,
      'no_show',
      'Missed Appointment',
      'Your appointment with ' || NEW.provider_name_snapshot ||
        ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') ||
        ' was marked as a no-show.',
      'high',
      FALSE,
      NEW.id,
      NEW.provider_id
    );
    RETURN NEW;
  END IF;

  -- Cancelled after confirmation (user or provider cancels a confirmed booking)
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' AND OLD.status != 'pending' THEN
    -- Notify user
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id)
    VALUES (
      NEW.user_id,
      'booking_cancelled',
      'Booking Cancelled',
      'Your booking with ' || NEW.provider_name_snapshot ||
        ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || ' has been cancelled.',
      'high',
      FALSE,
      NEW.id
    );

    -- Notify provider
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
    SELECT
      p.user_id,
      'booking_cancelled',
      'Booking Cancelled',
      COALESCE(NEW.customer_name, 'A client') || ' cancelled their ' ||
        NEW.service_name_snapshot ||
        ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || '.',
      'medium',
      FALSE,
      NEW.id,
      NEW.provider_id
    FROM public.providers p
    WHERE p.id = NEW.provider_id;

    RETURN NEW;
  END IF;

  -- Booking completed → prompt user to leave a review
  -- Honours the provider's Automations toggle (autoReviewRequest, default ON)
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    IF COALESCE((
      SELECT (p.automation_settings->>'autoReviewRequest')::BOOLEAN
        FROM public.providers p
       WHERE p.id = NEW.provider_id
    ), TRUE) THEN
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
      VALUES (
        NEW.user_id,
        'review_request',
        'How was your appointment?',
        'Leave a review for ' || NEW.provider_name_snapshot ||
          '. Your feedback helps others find great providers.',
        'medium',
        TRUE,
        NEW.id,
        NEW.provider_id
      );
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_booking_status_changed ON public.bookings;
CREATE TRIGGER on_booking_status_changed
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.handle_booking_status_change();

-- ───────────────────────────────────────────────────────────
-- 4. handle_review_received — fires on INSERT INTO reviews
--    Notifies the provider when a user submits a review
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_review_received()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
  SELECT
    p.user_id,
    'review_received',
    'New Review Received ⭐',
    'You received a ' || ROUND(NEW.rating::numeric, 1) || '-star review' ||
      CASE
        WHEN NEW.comment IS NOT NULL AND LENGTH(TRIM(NEW.comment)) > 0
          THEN ': "' || LEFT(NEW.comment, 80) ||
               CASE WHEN LENGTH(NEW.comment) > 80 THEN '…"' ELSE '"' END
        ELSE '.'
      END,
    'medium',
    TRUE,
    NEW.booking_id,
    NEW.provider_id
  FROM public.providers p
  WHERE p.id = NEW.provider_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_review_received ON public.reviews;
CREATE TRIGGER on_review_received
  AFTER INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.handle_review_received();

-- ───────────────────────────────────────────────────────────
-- 5. Set bookings default status to pending
-- ───────────────────────────────────────────────────────────
ALTER TABLE public.bookings
  ALTER COLUMN status SET DEFAULT 'pending';

-- ════════════════════════════════════════════════════
-- service_category_snapshot_migration.sql
-- ════════════════════════════════════════════════════
-- Snapshot the provider's service category (HAIR, NAILS, AESTHETICS, etc.) on each
-- booking, so booking lists can display the real category instead of guessing it
-- from the service name.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS service_category_snapshot TEXT;

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

-- Automatically release address when a booking becomes 'confirmed'
-- (handles the on_confirmation policy at the DB level as a safety net).
-- NOTE: the DB stores 'confirmed' — the app's 'upcoming' is a display-only
-- alias that maps to 'confirmed' on write, so we must match 'confirmed' here.
CREATE OR REPLACE FUNCTION public.auto_release_address()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM 'confirmed' THEN
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
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'provider_waitlist'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.provider_waitlist;
  END IF;
END $$;

-- ════════════════════════════════════════════════════
-- provider_chat_schema.sql
-- ════════════════════════════════════════════════════
-- ============================================================
-- Provider ↔ Client Chat
-- Run this in Supabase SQL Editor
-- ============================================================

-- One conversation per (provider, user) pair
CREATE TABLE IF NOT EXISTS public.provider_conversations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id          UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  user_id              UUID NOT NULL REFERENCES public.users(id)     ON DELETE CASCADE,
  last_message         TEXT,
  last_message_at      TIMESTAMPTZ,
  unread_count_user    INT NOT NULL DEFAULT 0,
  unread_count_provider INT NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(provider_id, user_id)
);

-- Individual messages
CREATE TABLE IF NOT EXISTS public.provider_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID NOT NULL REFERENCES public.provider_conversations(id) ON DELETE CASCADE,
  sender_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_type      TEXT NOT NULL CHECK (sender_type IN ('user', 'provider')),
  content          TEXT NOT NULL,
  read_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pconv_provider  ON public.provider_conversations(provider_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_pconv_user      ON public.provider_conversations(user_id,     updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_pmsg_conv       ON public.provider_messages(conversation_id,  created_at ASC);

-- RLS
ALTER TABLE public.provider_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_messages      ENABLE ROW LEVEL SECURITY;

-- Conversations: visible to the user or the provider
DROP POLICY IF EXISTS "Users see own conversations" ON public.provider_conversations;
CREATE POLICY "Users see own conversations" ON public.provider_conversations
  FOR ALL USING (
    auth.uid() = user_id
    OR auth.uid() IN (SELECT user_id FROM public.providers WHERE id = provider_id)
  );

-- Messages: visible if user owns the conversation or is the provider
DROP POLICY IF EXISTS "Participants see conversation messages" ON public.provider_messages;
CREATE POLICY "Participants see conversation messages" ON public.provider_messages
  FOR ALL USING (
    conversation_id IN (
      SELECT id FROM public.provider_conversations
      WHERE user_id = auth.uid()
         OR provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
    )
  );

-- Auto-update updated_at on conversations
CREATE OR REPLACE FUNCTION public.touch_conversation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.provider_conversations
  SET updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_conversation ON public.provider_messages;
CREATE TRIGGER trg_touch_conversation
  AFTER INSERT ON public.provider_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_conversation();

-- Helper: update last_message + bump the OTHER side's unread count.
-- p_sender_type defaults to 'user' so 2-arg calls (client app) keep working.
-- Keep ONE function only: an old 2-arg version alongside this one makes the
-- client's 2-arg RPC call ambiguous in PostgREST, so drop it first.
DROP FUNCTION IF EXISTS public.update_conversation_last_message(UUID, TEXT);

-- Definition kept byte-identical to chat_two_way_fix.sql — keep every copy of
-- this function in sync so behaviour never depends on which script ran last.
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

-- Enable realtime on messages (guarded — ALTER PUBLICATION errors on re-run)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'provider_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.provider_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'provider_conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.provider_conversations;
  END IF;
END $$;

-- ════════════════════════════════════════════════════
-- chat_two_way_fix.sql
-- ════════════════════════════════════════════════════
-- ============================================================
-- CERVICED — Two-Way Chat Fix
-- Run in Supabase SQL editor AFTER provider_chat_schema.sql and
-- notifications_full_matrix.sql. Safe to re-run.
--
-- Fixes:
--   1. update_conversation_last_message only took 2 args, but the
--      provider app calls it with p_sender_type — so every provider
--      reply failed the RPC silently: the conversation preview never
--      updated and the client's unread count never incremented.
--      It also ALWAYS bumped unread_count_provider, even for the
--      provider's own messages.
--   2. No notification fired on new messages — the recipient only saw
--      a message if they already had the chat open. The new trigger
--      inserts a 'new_message' notification, which rides the existing
--      push webhook (notifications INSERT → send-push-notification).
--   3. Realtime publication adds are made idempotent (the original
--      schema's plain ALTER PUBLICATION fails on re-run).
-- ============================================================

-- ───────────────────────────────────────────────────────────
-- 1. Replace the RPC with a sender-aware, 3-argument version
--    (drop the old 2-arg overload first, or PostgREST calls
--    become ambiguous between the two signatures)
-- ───────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.update_conversation_last_message(UUID, TEXT);

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
-- 2. Allow the 'new_message' notification type
--    (full list copied from notifications_full_matrix.sql + new_message)
-- ───────────────────────────────────────────────────────────
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Full SUPERSET copied from notifications_full_matrix.sql + 'new_message'.
-- Keep in sync — a narrower list here breaks inserts of the missing types.
-- NOT VALID: enforce on new rows only, so legacy rows can't fail the
-- migration with error 23514.
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
    'intake_form_received',   -- client got a form to fill in
    'intake_form_completed',  -- client sent a filled form back
    'info_pack_received',     -- client got prep/aftercare info
    'provider_message',
    'announcement',           -- provider broadcast to clients (client-visible)
    'balance_collected',
    'balance_reminder',
    'waitlist_slot_available',
    'new_message'             -- chat message received
  )) NOT VALID;

-- ───────────────────────────────────────────────────────────
-- 3. Notify the recipient when a chat message arrives.
--    Debounced: if the recipient already has an unread new_message
--    notification for this conversation partner from the last 10
--    minutes, skip — one ping per burst, not one per message.
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_new_chat_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id          UUID;
  v_provider_id      UUID;
  v_provider_user_id UUID;
  v_provider_name    TEXT;
  v_recipient        UUID;
  v_sender_name      TEXT;
BEGIN
  SELECT c.user_id, c.provider_id, p.user_id, p.display_name
    INTO v_user_id, v_provider_id, v_provider_user_id, v_provider_name
    FROM public.provider_conversations c
    JOIN public.providers p ON p.id = c.provider_id
   WHERE c.id = NEW.conversation_id;

  IF v_user_id IS NULL THEN
    RETURN NEW; -- conversation vanished; nothing to notify
  END IF;

  IF NEW.sender_type = 'user' THEN
    v_recipient := v_provider_user_id;
    SELECT COALESCE(u.name, 'A client') INTO v_sender_name
      FROM public.users u WHERE u.id = v_user_id;
  ELSE
    v_recipient := v_user_id;
    v_sender_name := v_provider_name;
  END IF;

  IF v_recipient IS NULL THEN
    RETURN NEW;
  END IF;

  -- Debounce burst messages
  IF EXISTS (
    SELECT 1 FROM public.notifications n
     WHERE n.user_id     = v_recipient
       AND n.type        = 'new_message'
       AND n.provider_id = v_provider_id
       AND n.is_read     = FALSE
       AND n.created_at  > NOW() - INTERVAL '10 minutes'
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
  VALUES (
    v_recipient,
    'new_message',
    'New message from ' || COALESCE(v_sender_name, 'your conversation'),
    LEFT(NEW.content, 120) || CASE WHEN LENGTH(NEW.content) > 120 THEN '…' ELSE '' END,
    'medium',
    TRUE,
    NULL,
    v_provider_id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_chat_message ON public.provider_messages;
CREATE TRIGGER trg_notify_new_chat_message
  AFTER INSERT ON public.provider_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_chat_message();

-- ───────────────────────────────────────────────────────────
-- 4. Idempotent realtime publication (safety net for fresh setups)
-- ───────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'provider_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.provider_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'provider_conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.provider_conversations;
  END IF;
END $$;

-- ============================================================
-- DONE — provider replies now update previews + unread counts,
-- and both sides get push/in-app notifications for new messages
-- ============================================================

-- ════════════════════════════════════════════════════
-- becca_chat_tables.sql
-- ════════════════════════════════════════════════════
-- ============================================================
-- Becca AI Chat Persistence
-- Run this in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.becca_chat_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT 'New Chat',
  preview     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.becca_chat_messages (
  id          UUID PRIMARY KEY,
  session_id  UUID NOT NULL REFERENCES public.becca_chat_sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  image_uri   TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_becca_sessions_user ON public.becca_chat_sessions(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_becca_messages_session ON public.becca_chat_messages(session_id, created_at ASC);

-- RLS
ALTER TABLE public.becca_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.becca_chat_messages ENABLE ROW LEVEL SECURITY;

-- Sessions: users can only see/edit their own
DROP POLICY IF EXISTS "Users manage own sessions" ON public.becca_chat_sessions;
CREATE POLICY "Users manage own sessions" ON public.becca_chat_sessions
  FOR ALL USING (auth.uid() = user_id);

-- Messages: users can only see/edit messages in their own sessions
DROP POLICY IF EXISTS "Users manage own messages" ON public.becca_chat_messages;
CREATE POLICY "Users manage own messages" ON public.becca_chat_messages
  FOR ALL USING (
    session_id IN (
      SELECT id FROM public.becca_chat_sessions WHERE user_id = auth.uid()
    )
  );

-- ════════════════════════════════════════════════════
-- becca_chat_migration_001.sql
-- ════════════════════════════════════════════════════
-- Migration 001: Fix becca_chat_messages.id column type
-- The app uses string-based IDs (not UUID format).
-- Change the column from UUID to TEXT so any string ID is accepted.
-- Run this in Supabase SQL Editor → New query.

ALTER TABLE public.becca_chat_messages ALTER COLUMN id TYPE TEXT;

-- ════════════════════════════════════════════════════
-- storage_policies.sql
-- ════════════════════════════════════════════════════
-- ─────────────────────────────────────────────────────────────────────────────
-- Storage buckets + RLS policies
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Create buckets (skip if already created via the dashboard UI)
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('provider-logos',       'provider-logos',       true),
  ('service-images',       'service-images',       true),
  ('portfolio',            'portfolio',            true),
  ('avatars',              'avatars',              true),
  ('provider-backgrounds', 'provider-backgrounds', true)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- provider-logos
-- ─────────────────────────────────────────────────────────────────────────────

-- Public read
DROP POLICY IF EXISTS "provider-logos: public read" ON storage.objects;
CREATE POLICY "provider-logos: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'provider-logos');

-- Authenticated upload to own folder  (<userId>/*)
DROP POLICY IF EXISTS "provider-logos: authenticated upload" ON storage.objects;
CREATE POLICY "provider-logos: authenticated upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'provider-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated update own files
DROP POLICY IF EXISTS "provider-logos: authenticated update" ON storage.objects;
CREATE POLICY "provider-logos: authenticated update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'provider-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated delete own files
DROP POLICY IF EXISTS "provider-logos: authenticated delete" ON storage.objects;
CREATE POLICY "provider-logos: authenticated delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'provider-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- service-images
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "service-images: public read" ON storage.objects;
CREATE POLICY "service-images: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'service-images');

DROP POLICY IF EXISTS "service-images: authenticated upload" ON storage.objects;
CREATE POLICY "service-images: authenticated upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'service-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "service-images: authenticated update" ON storage.objects;
CREATE POLICY "service-images: authenticated update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'service-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "service-images: authenticated delete" ON storage.objects;
CREATE POLICY "service-images: authenticated delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'service-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- portfolio
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "portfolio: public read" ON storage.objects;
CREATE POLICY "portfolio: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'portfolio');

DROP POLICY IF EXISTS "portfolio: authenticated upload" ON storage.objects;
CREATE POLICY "portfolio: authenticated upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'portfolio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "portfolio: authenticated update" ON storage.objects;
CREATE POLICY "portfolio: authenticated update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'portfolio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "portfolio: authenticated delete" ON storage.objects;
CREATE POLICY "portfolio: authenticated delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'portfolio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- avatars
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "avatars: public read" ON storage.objects;
CREATE POLICY "avatars: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars: authenticated upload" ON storage.objects;
CREATE POLICY "avatars: authenticated upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars: authenticated update" ON storage.objects;
CREATE POLICY "avatars: authenticated update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars: authenticated delete" ON storage.objects;
CREATE POLICY "avatars: authenticated delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- provider-backgrounds
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "provider-backgrounds: public read" ON storage.objects;
CREATE POLICY "provider-backgrounds: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'provider-backgrounds');

DROP POLICY IF EXISTS "provider-backgrounds: authenticated upload" ON storage.objects;
CREATE POLICY "provider-backgrounds: authenticated upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'provider-backgrounds'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "provider-backgrounds: authenticated update" ON storage.objects;
CREATE POLICY "provider-backgrounds: authenticated update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'provider-backgrounds'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "provider-backgrounds: authenticated delete" ON storage.objects;
CREATE POLICY "provider-backgrounds: authenticated delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'provider-backgrounds'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

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

    -- …but still tell the PROVIDER a booking landed (informational — nothing
    -- to confirm/decline). Without this, instant-booking providers get no
    -- notification of new bookings at all.
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
    VALUES (
      v_provider_user_id,
      'booking_confirmed',
      'New Booking',
      COALESCE(NEW.customer_name, 'A client') || ' booked ' ||
        NEW.service_name_snapshot ||
        ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') ||
        ' at ' || TO_CHAR(NEW.booking_time, 'HH12:MI AM') || '.',
      'high',
      FALSE,
      NEW.id,
      NEW.provider_id
    );

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
-- provider_reminder_jobs.sql
-- ════════════════════════════════════════════════════
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
    'intake_form_received',   -- client got a form to fill in
    'intake_form_completed',  -- client sent a filled form back
    'info_pack_received',     -- client got prep/aftercare info
    'provider_message',
    'announcement',           -- provider broadcast to clients (client-visible)
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

-- Definition kept byte-identical to chat_two_way_fix.sql — keep every copy of
-- this function in sync so behaviour never depends on which script ran last.
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

-- ════════════════════════════════════════════════════
-- push_token_setup.sql
-- ════════════════════════════════════════════════════
-- ============================================================
-- PUSH NOTIFICATIONS SETUP
-- Run in Supabase SQL editor BEFORE configuring the webhook.
-- ============================================================

-- 1. Add push_token column to users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS push_token TEXT;

-- Index for fast lookup (Edge Function reads token by user_id)
CREATE INDEX IF NOT EXISTS idx_users_push_token
  ON public.users(push_token)
  WHERE push_token IS NOT NULL;

-- ============================================================
-- 2. Create the webhook trigger via SQL (no Dashboard UI needed)
-- ============================================================

-- pg_net is pre-installed on all Supabase projects
CREATE EXTENSION IF NOT EXISTS pg_net;

-- The service_role key lives in Supabase Vault. ALTER DATABASE ... SET is
-- NOT permitted on hosted Supabase (error 42501: permission denied to set
-- parameter), so the key is stored as a Vault secret and read at runtime.
-- ⚠️  Replace <YOUR_SERVICE_ROLE_KEY> with the key from:
--     Supabase Dashboard → Settings → API → service_role (secret)
--     Re-run safe: if the placeholder is left in, any previously stored
--     real key is kept untouched.
DO $$
BEGIN
  IF '<YOUR_SERVICE_ROLE_KEY>' NOT LIKE '<%' THEN
    DELETE FROM vault.secrets WHERE name = 'service_role_key';
    PERFORM vault.create_secret('<YOUR_SERVICE_ROLE_KEY>', 'service_role_key');
  END IF;
END $$;

-- Function that fires the Edge Function on every notification INSERT
CREATE OR REPLACE FUNCTION public.send_push_on_notification_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key TEXT;
BEGIN
  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
   WHERE name = 'service_role_key'
   LIMIT 1;

  -- Key not configured (or placeholder left in) — skip the push quietly;
  -- the in-app notification insert must never fail because of this.
  IF v_key IS NULL OR v_key = '' OR v_key LIKE '<%' THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := 'https://ztrfpfvvejzaysrelmfm.supabase.co/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := jsonb_build_object(
      'type',   TG_OP,
      'table',  TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', row_to_json(NEW)
    ),
    -- Edge function executions have been observed taking up to ~12s (cold
    -- starts / Expo API latency) — 5s was silently dropping ~1 in 4 pushes
    -- with no error surfaced anywhere. 15s gives real headroom.
    timeout_milliseconds := 15000
  );
  RETURN NEW;
END;
$$;

-- Attach the trigger to notifications
DROP TRIGGER IF EXISTS send_push_on_notification ON public.notifications;
CREATE TRIGGER send_push_on_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.send_push_on_notification_insert();

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

-- ════════════════════════════════════════════════════
-- provider_profile_theme.sql
-- ════════════════════════════════════════════════════
-- Provider profile theme — preset key picked in Branding & Style
-- (see src/constants/providerThemes.ts). 'app' (default) follows each
-- client's light/dark app theme; other keys are fixed palettes.
-- Stored as free TEXT (validated app-side) so new presets never need
-- another migration. Safe to re-run.

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS profile_theme TEXT DEFAULT 'app';

-- ════════════════════════════════════════════════════
-- client_automation_jobs.sql
-- ════════════════════════════════════════════════════
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
--   Targeting delegates to get_promotion_audience() (defined in
--   supabase/promotion_interest_targeting.sql — run that file too, or
--   this CREATE FUNCTION fails at call time with "function does not
--   exist"): this provider's own bookmarks/follows/booking history only —
--   promotions never cross into other providers' clients.
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
    SELECT
      aud.user_id,
      'promotion',
      v_badge || ' — ' || COALESCE(promo.display_name, 'Your provider'),
      promo.title,
      'medium',
      FALSE,
      promo.provider_id,
      jsonb_build_object('promo_id', promo.id)
    FROM public.get_promotion_audience(promo.id) aud;
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



-- ════════════════════════════════════════════════════
-- info_packs_bookings.sql
-- ════════════════════════════════════════════════════
-- ============================================================
-- CERVICED — Info Packs → Bookings + Provider Daily Recap
-- Attaches provider info packs (aftercare guides, prep tips) to client
-- bookings so they appear in the booking's TO-DO section, with an in-app
-- + push notification. Also adds the provider daily recap job
-- (Automations screen "newBookingRecap" toggle).
--
-- Run this in the Supabase SQL editor AFTER client_automation_jobs.sql
-- (it reads providers.automation_settings). Safe to re-run.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
GRANT USAGE ON SCHEMA cron TO postgres;

-- ───────────────────────────────────────────────────────────
-- STEP 1: info_packs table
--   Created ad-hoc in the live DB by ProviderInfoPackScreen — defined
--   here so fresh environments get it. NOTE: the app has historically
--   written provider_id = auth.uid() (the provider's USER id, not
--   providers.id); the trigger below accepts either convention.
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.info_packs (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID NOT NULL,
  title       TEXT NOT NULL,
  service     TEXT DEFAULT 'GENERAL',
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Packs attach to SPECIFIC services (by name), mirroring
-- provider_form_library.service_names. Empty array = all services.
ALTER TABLE public.info_packs
  ADD COLUMN IF NOT EXISTS service_names TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.info_packs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "info_packs_provider_all" ON public.info_packs;
CREATE POLICY "info_packs_provider_all"
ON public.info_packs FOR ALL
USING (
  provider_id = auth.uid()
  OR provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
);

-- ───────────────────────────────────────────────────────────
-- STEP 2: booking_info_packs — a pack sent with a specific booking
--   Content is snapshotted so later edits/deletes of the library pack
--   never change what the client was sent. viewed_at drives the client
--   "needs attention" indicator.
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.booking_info_packs (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id     UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  info_pack_id   UUID,
  provider_id    UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  client_user_id UUID NOT NULL,
  title          TEXT NOT NULL,
  service        TEXT DEFAULT 'GENERAL',
  content        TEXT NOT NULL,
  viewed_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (booking_id, info_pack_id)
);

ALTER TABLE public.booking_info_packs ENABLE ROW LEVEL SECURITY;

-- Client: read their own packs and mark them viewed
DROP POLICY IF EXISTS "booking_info_packs_client_select" ON public.booking_info_packs;
CREATE POLICY "booking_info_packs_client_select"
ON public.booking_info_packs FOR SELECT
USING (client_user_id = auth.uid());

DROP POLICY IF EXISTS "booking_info_packs_client_update" ON public.booking_info_packs;
CREATE POLICY "booking_info_packs_client_update"
ON public.booking_info_packs FOR UPDATE
USING (client_user_id = auth.uid())
WITH CHECK (client_user_id = auth.uid());

-- Provider: full control over packs on their own bookings
DROP POLICY IF EXISTS "booking_info_packs_provider_all" ON public.booking_info_packs;
CREATE POLICY "booking_info_packs_provider_all"
ON public.booking_info_packs FOR ALL
USING (provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid()));

-- ───────────────────────────────────────────────────────────
-- STEP 3: Expand notifications.type CHECK constraint
--   Adds info_pack_received (client got prep/aftercare info).
--   Keep in sync with every other copy of this constraint.
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
-- STEP 4: Attach matching packs when a booking is created
--   Matches packs whose service_names lists this exact booked service,
--   or is empty (= attach to all services). One notification per
--   booking regardless of how many packs attach.
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_attach_info_packs()
RETURNS TRIGGER AS $$
DECLARE
  v_provider RECORD;
  v_count    INT := 0;
BEGIN
  SELECT id, user_id, display_name
    INTO v_provider
    FROM public.providers
   WHERE id = NEW.provider_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  INSERT INTO public.booking_info_packs
    (booking_id, info_pack_id, provider_id, client_user_id, title, service, content)
  SELECT NEW.id, ip.id, v_provider.id, NEW.user_id, ip.title, NEW.service_name_snapshot, ip.content
    FROM public.info_packs ip
   WHERE ip.provider_id IN (v_provider.id, v_provider.user_id)
     AND (
       NEW.service_name_snapshot = ANY(ip.service_names)
       OR cardinality(ip.service_names) = 0
     )
  ON CONFLICT (booking_id, info_pack_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
    VALUES (
      NEW.user_id,
      'info_pack_received',
      'Info From Your Provider',
      COALESCE(v_provider.display_name, 'Your provider') ||
        ' sent you prep & aftercare info for your ' || NEW.service_name_snapshot ||
        ' — open the booking to read it.',
      'medium',
      TRUE,
      NEW.id,
      v_provider.id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_booking_attach_info_packs ON public.bookings;
CREATE TRIGGER on_booking_attach_info_packs
  AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.handle_attach_info_packs();

-- ───────────────────────────────────────────────────────────
-- STEP 5: Attach a NEW pack to existing upcoming bookings
--   Covers the reverse direction: provider writes a pack after
--   bookings already exist. One notification per affected booking.
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_info_pack()
RETURNS TRIGGER AS $$
DECLARE
  v_provider RECORD;
  b          RECORD;
BEGIN
  -- Resolve the provider row from either id convention
  SELECT id, user_id, display_name
    INTO v_provider
    FROM public.providers
   WHERE id = NEW.provider_id OR user_id = NEW.provider_id
   LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;

  FOR b IN
    SELECT bk.id, bk.user_id, bk.service_name_snapshot
      FROM public.bookings bk
     WHERE bk.provider_id = v_provider.id
       AND bk.status IN ('pending', 'confirmed')
       AND bk.booking_date >= CURRENT_DATE
       AND (
         bk.service_name_snapshot = ANY(NEW.service_names)
         OR cardinality(NEW.service_names) = 0
       )
  LOOP
    INSERT INTO public.booking_info_packs
      (booking_id, info_pack_id, provider_id, client_user_id, title, service, content)
    VALUES (b.id, NEW.id, v_provider.id, b.user_id, NEW.title, b.service_name_snapshot, NEW.content)
    ON CONFLICT (booking_id, info_pack_id) DO NOTHING;

    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
    VALUES (
      b.user_id,
      'info_pack_received',
      'Info From Your Provider',
      COALESCE(v_provider.display_name, 'Your provider') ||
        ' sent you "' || NEW.title || '" for your ' || b.service_name_snapshot ||
        ' — open the booking to read it.',
      'medium',
      TRUE,
      b.id,
      v_provider.id
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_info_pack_created ON public.info_packs;
CREATE TRIGGER on_info_pack_created
  AFTER INSERT ON public.info_packs
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_info_pack();

-- ───────────────────────────────────────────────────────────
-- STEP 5b: Notify the provider when a client completes an intake form
--   Fires on booking_intake_forms status pending → completed. The
--   notification is actionable and carries the booking so the provider
--   can jump straight to the responses.
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_intake_form_completed()
RETURNS TRIGGER AS $$
DECLARE
  v_provider_user UUID;
  v_booking       RECORD;
BEGIN
  IF NEW.status <> 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  SELECT user_id INTO v_provider_user
    FROM public.providers WHERE id = NEW.provider_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT customer_name, service_name_snapshot, booking_date
    INTO v_booking
    FROM public.bookings WHERE id = NEW.booking_id;

  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, metadata)
  VALUES (
    v_provider_user,
    'intake_form_completed',
    'Form Completed',
    COALESCE(v_booking.customer_name, 'A client') || ' filled in "' || NEW.title ||
      '" for their ' || COALESCE(v_booking.service_name_snapshot, 'appointment') ||
      COALESCE(' on ' || TO_CHAR(v_booking.booking_date, 'DD Mon'), '') || '.',
    'medium',
    TRUE,
    NEW.booking_id,
    NEW.provider_id,
    jsonb_build_object('form_id', NEW.id)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_intake_form_completed ON public.booking_intake_forms;
CREATE TRIGGER on_intake_form_completed
  AFTER UPDATE ON public.booking_intake_forms
  FOR EACH ROW EXECUTE FUNCTION public.handle_intake_form_completed();

-- ───────────────────────────────────────────────────────────
-- STEP 6: process_provider_daily_recap()
--   Runs daily at 07:00 UTC. Automations "newBookingRecap" toggle
--   (default ON when unset). Sends providers a morning summary of
--   today's confirmed/pending bookings. Duplicate guard: one per day.
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_provider_daily_recap()
RETURNS VOID AS $$
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
      (user_id, type, title, message, priority, is_actionable, provider_id, metadata)
    VALUES (
      r.provider_user_id,
      'booking_reminder',
      'Today''s Schedule',
      'You have ' || r.booking_count || ' appointment' ||
        CASE WHEN r.booking_count = 1 THEN '' ELSE 's' END ||
        ' today, starting at ' || TO_CHAR(r.first_time, 'HH12:MI AM') || '.',
      'medium',
      TRUE,
      r.provider_id,
      jsonb_build_object('kind', 'daily_recap')
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT cron.schedule(
  'provider-daily-recap',
  '0 7 * * *',
  $$ SELECT public.process_provider_daily_recap(); $$
);

-- ============================================================
-- DONE — Info packs attach to bookings; daily recap scheduled
-- ============================================================
