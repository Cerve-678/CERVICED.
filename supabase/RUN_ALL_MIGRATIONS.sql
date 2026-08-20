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
-- fix_address_release_on_confirm.sql
-- ════════════════════════════════════════════════════
-- Fix: address auto-release on confirmation never fired
-- The auto_release_address() trigger above guarded on NEW.status = 'upcoming',
-- but the bookings table only ever stores 'confirmed' (the app's 'upcoming'
-- is a display-only alias that maps to 'confirmed' on write). This redefines
-- the trigger to fire on the real 'confirmed' transition, and backfills
-- bookings that were already confirmed while the trigger was broken.

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

UPDATE public.bookings b
SET address_released_at = COALESCE(b.confirmed_at, b.updated_at, NOW())
FROM public.providers p
WHERE b.provider_id = p.id
  AND p.address_release_policy = 'on_confirmation'
  AND b.address_released_at IS NULL
  AND b.status IN ('confirmed', 'in_progress', 'completed');

-- ════════════════════════════════════════════════════
-- restrict_provider_full_address.sql
-- ════════════════════════════════════════════════════
-- providers has a public "is_active" SELECT policy and several
-- .select('*') call sites, so RLS cannot hide a single column there. Move
-- full_address into its own owner-only table instead.

BEGIN;

CREATE TABLE IF NOT EXISTS public.provider_private_details (
  provider_id  UUID PRIMARY KEY REFERENCES public.providers(id) ON DELETE CASCADE,
  full_address TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.provider_private_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "provider_private_details_owner_all"
  ON public.provider_private_details;
CREATE POLICY "provider_private_details_owner_all"
  ON public.provider_private_details
  FOR ALL
  USING (
    provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
  )
  WITH CHECK (
    provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'providers'
       AND column_name  = 'full_address'
  ) THEN
    INSERT INTO public.provider_private_details (provider_id, full_address)
    SELECT id, full_address
      FROM public.providers
     WHERE full_address IS NOT NULL
    ON CONFLICT (provider_id) DO UPDATE
      SET full_address = EXCLUDED.full_address,
          updated_at   = NOW();

    IF (SELECT COUNT(*) FROM public.providers WHERE full_address IS NOT NULL)
       <> (SELECT COUNT(*) FROM public.provider_private_details WHERE full_address IS NOT NULL)
    THEN
      RAISE EXCEPTION 'Address copy incomplete — aborting before dropping the column';
    END IF;

    ALTER TABLE public.providers DROP COLUMN full_address;
  END IF;
END $$;

COMMIT;

-- ════════════════════════════════════════════════════
-- require_provider_address.sql (columns only — see note below)
-- ════════════════════════════════════════════════════
-- Real coordinates, stored next to the real address (same owner-only RLS,
-- same sensitivity as full_address). Used by stamp_booking_address_snapshot()
-- below to stamp a released booking's map pin with the real location.
--
-- NOTE: this file's go-live-gating changes (extending check_and_set_provider_live
-- to also require a geocoded address, plus the on_provider_address_change
-- trigger) are deliberately NOT included here. That function and its sibling
-- triggers (provider_schedule_gating.sql, require_services_for_go_live.sql)
-- were never added to this bundle in the first place — adding only my piece
-- would leave a fresh environment with a check_and_set_provider_live that
-- requires an address, but no schedule/service triggers ever calling it, and
-- has_gone_live never gated on schedule+services either. That's a
-- pre-existing gap in this bundle bigger than this change — flagging it
-- rather than papering over it with a partially-correct fix.
ALTER TABLE public.provider_private_details
  ADD COLUMN IF NOT EXISTS latitude  NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7);

-- ════════════════════════════════════════════════════
-- address_release_enforcement.sql
-- ════════════════════════════════════════════════════
-- Address release — enforced at the data layer. is_address_released()
-- expresses the policy once; client_bookings is what the CLIENT reads, with
-- the address/coordinates masked to NULL until released. Providers reading
-- their own bookings go straight to the base table, unaffected.

CREATE OR REPLACE FUNCTION public.is_address_released(
  p_status       TEXT,
  p_policy       TEXT,
  p_released_at  TIMESTAMPTZ,
  p_booking_date DATE,
  p_booking_time TIME
) RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN p_released_at IS NOT NULL THEN TRUE
    WHEN p_policy = 'always' THEN TRUE
    WHEN p_policy = 'on_confirmation'
      THEN p_status IN ('confirmed', 'in_progress', 'completed')
    WHEN p_policy IN ('day_before','two_days_before','three_days_before','five_days_before','week_before')
      THEN now() >= ((p_booking_date + p_booking_time) AT TIME ZONE 'UTC') - (
        CASE p_policy
          WHEN 'day_before'        THEN INTERVAL '24 hours'
          WHEN 'two_days_before'   THEN INTERVAL '48 hours'
          WHEN 'three_days_before' THEN INTERVAL '72 hours'
          WHEN 'five_days_before'  THEN INTERVAL '120 hours'
          WHEN 'week_before'       THEN INTERVAL '168 hours'
        END
      )
    ELSE FALSE
  END;
$$;

CREATE OR REPLACE VIEW public.client_bookings
WITH (security_invoker = true) AS
SELECT
  b.id, b.user_id, b.provider_id, b.service_id, b.status,
  b.booking_date, b.booking_time, b.end_time, b.notes, b.booking_instructions,
  b.payment_type, b.base_price, b.add_ons_total, b.service_charge, b.deposit_amount,
  b.amount_paid, b.remaining_balance, b.payment_status, b.payment_method, b.payment_intent_id,
  b.is_group_booking, b.group_booking_id, b.group_booking_count,
  b.provider_name_snapshot, b.service_name_snapshot, b.service_category_snapshot, b.provider_logo_snapshot,
  CASE WHEN public.is_address_released(b.status, p.address_release_policy, b.address_released_at, b.booking_date, b.booking_time)
       THEN b.provider_address_snapshot ELSE NULL END AS provider_address_snapshot,
  b.provider_phone_snapshot,
  CASE WHEN public.is_address_released(b.status, p.address_release_policy, b.address_released_at, b.booking_date, b.booking_time)
       THEN b.provider_coordinates ELSE NULL END AS provider_coordinates,
  b.customer_name, b.customer_email, b.customer_phone,
  b.confirmed_at, b.address_released_at, b.client_address,
  b.occasion_type, b.style_request, b.reference_image_url,
  b.created_at, b.updated_at,
  (SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.id), '[]'::jsonb)
     FROM public.booking_add_ons a WHERE a.booking_id = b.id) AS add_ons,
  jsonb_build_object('logo_url', p.logo_url) AS provider
FROM public.bookings b
LEFT JOIN public.providers p ON p.id = b.provider_id;

GRANT SELECT ON public.client_bookings TO authenticated;

-- ════════════════════════════════════════════════════
-- address_release_notification.sql
-- ════════════════════════════════════════════════════
-- Sends the client ONE "Address Now Available" notification when their
-- booking address becomes available, covering all three release paths.

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
    'new_message',
    'address_released'
  )) NOT VALID;

CREATE OR REPLACE FUNCTION public.auto_release_address()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_released BOOLEAN := FALSE;
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

    GET DIAGNOSTICS v_released = ROW_COUNT;

    IF v_released THEN
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
      VALUES (
        NEW.user_id,
        'address_released',
        'Address Now Available',
        'The location for your ' || NEW.service_name_snapshot ||
          ' with ' || NEW.provider_name_snapshot ||
          ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') ||
          ' has been shared — tap to view.',
        'medium', TRUE, NEW.id, NEW.provider_id, 'client'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_address_release_notifications()
RETURNS VOID AS $$
DECLARE
  r        RECORD;
  v_hours  INT;
BEGIN
  FOR r IN
    SELECT
      b.id                    AS booking_id,
      b.user_id,
      b.booking_date,
      b.booking_time,
      b.provider_id,
      b.service_name_snapshot,
      b.provider_name_snapshot,
      p.address_release_policy
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
    WHERE b.status IN ('confirmed', 'in_progress')
      AND b.address_released_at IS NULL
      AND p.address_release_policy IN (
        'day_before', 'two_days_before', 'three_days_before',
        'five_days_before', 'week_before'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
         WHERE n.booking_id = b.id
           AND n.user_id    = b.user_id
           AND n.type       = 'address_released'
      )
  LOOP
    v_hours := CASE r.address_release_policy
      WHEN 'day_before'        THEN 24
      WHEN 'two_days_before'   THEN 48
      WHEN 'three_days_before' THEN 72
      WHEN 'five_days_before'  THEN 120
      WHEN 'week_before'       THEN 168
      ELSE NULL
    END;

    CONTINUE WHEN v_hours IS NULL;

    CONTINUE WHEN now() < (
      (r.booking_date::TIMESTAMP + r.booking_time) AT TIME ZONE 'UTC'
      - (v_hours || ' hours')::INTERVAL
    );

    UPDATE public.bookings
       SET address_released_at = NOW()
     WHERE id = r.booking_id AND address_released_at IS NULL;

    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      r.user_id,
      'address_released',
      'Address Now Available',
      'The location for your ' || r.service_name_snapshot ||
        ' with ' || r.provider_name_snapshot ||
        ' on ' || TO_CHAR(r.booking_date, 'DD Mon YYYY') ||
        ' has been shared — tap to view.',
      'medium', TRUE, r.booking_id, r.provider_id, 'client'
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- CREATE EXTENSION here (not present in the standalone file — production
-- already had pg_cron enabled via a later migration by the time this was
-- first applied there). A truly fresh environment running this bundle
-- top-to-bottom needs it now, before automation_jobs.sql's own copy of this
-- line runs later in this file.
CREATE EXTENSION IF NOT EXISTS pg_cron;
GRANT USAGE ON SCHEMA cron TO postgres;

SELECT cron.schedule(
  'address-release-notifications',
  '0 * * * *',
  $$ SELECT public.process_address_release_notifications(); $$
);

-- ════════════════════════════════════════════════════
-- fix_booking_address_snapshot_uses_real_address.sql
-- ════════════════════════════════════════════════════
-- BookingContext.tsx stamps provider_address_snapshot from the public,
-- approximate location_text, never the private, release-gated
-- full_address (RLS correctly prevents a client from reading a different
-- provider's real address directly). Stamp the real address onto the
-- booking from inside the database, where RLS doesn't apply, at INSERT time.

CREATE OR REPLACE FUNCTION public.stamp_booking_address_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_address TEXT;
BEGIN
  SELECT d.full_address INTO v_full_address
  FROM public.provider_private_details d
  WHERE d.provider_id = NEW.provider_id;

  IF v_full_address IS NOT NULL AND btrim(v_full_address) <> '' THEN
    NEW.provider_address_snapshot := v_full_address;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_booking_address_snapshot ON public.bookings;
CREATE TRIGGER trg_stamp_booking_address_snapshot
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.stamp_booking_address_snapshot();

UPDATE public.bookings b
SET provider_address_snapshot = d.full_address
FROM public.provider_private_details d
WHERE d.provider_id = b.provider_id
  AND d.full_address IS NOT NULL
  AND btrim(d.full_address) <> ''
  AND b.provider_address_snapshot IS DISTINCT FROM d.full_address
  AND b.status NOT IN ('completed', 'cancelled');

-- ════════════════════════════════════════════════════
-- fix_bookings_provider_update_bypass.sql
-- ════════════════════════════════════════════════════
-- Provider-side bookings UPDATE had no WITH CHECK. Move confirm/start/
-- complete/no-show and address-release behind narrow RPCs that can only
-- touch their one respective column, then drop the general provider update
-- policy — the provider role has no remaining legitimate need for it.

CREATE OR REPLACE FUNCTION public.provider_update_booking_status(p_booking_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.bookings b
  SET status = p_status
  WHERE b.id = p_booking_id
    AND b.provider_id IN (SELECT p.id FROM public.providers p WHERE p.user_id = auth.uid());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found or not owned by caller';
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.provider_update_booking_status(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.provider_release_booking_address(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.bookings b
  SET address_released_at = NOW()
  WHERE b.id = p_booking_id
    AND b.provider_id IN (SELECT p.id FROM public.providers p WHERE p.user_id = auth.uid());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found or not owned by caller';
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.provider_release_booking_address(uuid) TO authenticated;

DROP POLICY IF EXISTS "bookings_provider_update" ON public.bookings;

-- ════════════════════════════════════════════════════
-- consolidate_address_release_notification.sql
-- ════════════════════════════════════════════════════
-- Collapses the three copies of the "Address Now Available" notification
-- (this trigger, the cron below, and formerly an app-side insert for manual
-- release) into one shared, idempotent function.

CREATE OR REPLACE FUNCTION public.notify_address_released(p_booking_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b RECORD;
BEGIN
  SELECT id, user_id, provider_id, service_name_snapshot, provider_name_snapshot, booking_date
    INTO b
  FROM public.bookings
  WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
  VALUES (
    b.user_id,
    'address_released',
    'Address Now Available',
    'The location for your ' || b.service_name_snapshot ||
      ' with ' || b.provider_name_snapshot ||
      ' on ' || TO_CHAR(b.booking_date, 'DD Mon YYYY') ||
      ' has been shared — tap to view.',
    'medium', TRUE, b.id, b.provider_id, 'client'
  )
  ON CONFLICT (booking_id, user_id) WHERE (type = 'address_released') DO NOTHING;
END;
$$;

-- Internal-only helper, no ownership check. PostgREST exposes every
-- public-schema function as an RPC, and this project grants EXECUTE on new
-- functions to anon/authenticated via schema-level default privileges (a
-- named-role grant separate from the PUBLIC pseudo-role) — both REVOKEs are
-- needed, or an anonymous OR signed-in caller could force-send this
-- notification for an arbitrary booking id.
REVOKE ALL ON FUNCTION public.notify_address_released(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_address_released(uuid) FROM anon, authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_address_released
  ON public.notifications (booking_id, user_id)
  WHERE (type = 'address_released');

CREATE OR REPLACE FUNCTION public.auto_release_address()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_released BOOLEAN := FALSE;
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

    GET DIAGNOSTICS v_released = ROW_COUNT;

    IF v_released THEN
      PERFORM public.notify_address_released(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_release_address ON public.bookings;
CREATE TRIGGER trg_auto_release_address
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.auto_release_address();

CREATE OR REPLACE FUNCTION public.process_address_release_notifications()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r        RECORD;
  v_hours  INT;
BEGIN
  FOR r IN
    SELECT
      b.id                    AS booking_id,
      b.booking_date,
      b.booking_time,
      p.address_release_policy
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
    WHERE b.status IN ('confirmed', 'in_progress')
      AND b.address_released_at IS NULL
      AND p.address_release_policy IN (
        'day_before', 'two_days_before', 'three_days_before',
        'five_days_before', 'week_before'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
         WHERE n.booking_id = b.id
           AND n.type       = 'address_released'
      )
  LOOP
    v_hours := CASE r.address_release_policy
      WHEN 'day_before'        THEN 24
      WHEN 'two_days_before'   THEN 48
      WHEN 'three_days_before' THEN 72
      WHEN 'five_days_before'  THEN 120
      WHEN 'week_before'       THEN 168
      ELSE NULL
    END;

    CONTINUE WHEN v_hours IS NULL;

    CONTINUE WHEN now() < (
      (r.booking_date::TIMESTAMP + r.booking_time) AT TIME ZONE 'UTC'
      - (v_hours || ' hours')::INTERVAL
    );

    UPDATE public.bookings
       SET address_released_at = NOW()
     WHERE id = r.booking_id AND address_released_at IS NULL;

    PERFORM public.notify_address_released(r.booking_id);
  END LOOP;
END;
$$;

-- ════════════════════════════════════════════════════
-- consolidate_address_release_notification_manual.sql
-- ════════════════════════════════════════════════════
-- Wires manual release into the same shared helper, and closes a small gap
-- where repeat calls re-stamped address_released_at every time.

CREATE OR REPLACE FUNCTION public.provider_release_booking_address(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated BOOLEAN := FALSE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.bookings b
     WHERE b.id = p_booking_id
       AND b.provider_id IN (SELECT p.id FROM public.providers p WHERE p.user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Booking not found or not owned by caller';
  END IF;

  UPDATE public.bookings b
     SET address_released_at = NOW()
   WHERE b.id = p_booking_id
     AND b.address_released_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated THEN
    PERFORM public.notify_address_released(p_booking_id);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.provider_release_booking_address(uuid) TO authenticated;

-- ════════════════════════════════════════════════════
-- stamp_booking_address_snapshot_fallback_location_text.sql
-- ════════════════════════════════════════════════════
-- Have the stamping trigger fall back to the provider's public location_text
-- itself, instead of relying on the app to precompute and send that same
-- fallback value. provider_coordinates is untouched (separate, undone work —
-- see fix_booking_address_snapshot_uses_real_address.sql above).

CREATE OR REPLACE FUNCTION public.stamp_booking_address_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_address   TEXT;
  v_location_text  TEXT;
BEGIN
  SELECT d.full_address INTO v_full_address
  FROM public.provider_private_details d
  WHERE d.provider_id = NEW.provider_id;

  SELECT p.location_text INTO v_location_text
  FROM public.providers p
  WHERE p.id = NEW.provider_id;

  NEW.provider_address_snapshot := COALESCE(
    NULLIF(btrim(v_full_address), ''),
    NULLIF(btrim(v_location_text), ''),
    NEW.provider_address_snapshot
  );

  RETURN NEW;
END;
$$;

-- ════════════════════════════════════════════════════
-- require_provider_address.sql (coordinate stamping)
-- ════════════════════════════════════════════════════
-- Also prefer the real geocoded coordinates for provider_coordinates, not
-- just provider_address_snapshot — same fallback order, now applied to
-- coordinates too, so a released booking's map pin reflects the real address
-- once the provider has one on file (see the go-live-gating note above for
-- what's deliberately NOT included in this bundle).

CREATE OR REPLACE FUNCTION public.stamp_booking_address_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_address   TEXT;
  v_latitude       NUMERIC(10,7);
  v_longitude      NUMERIC(10,7);
  v_location_text  TEXT;
BEGIN
  SELECT d.full_address, d.latitude, d.longitude
    INTO v_full_address, v_latitude, v_longitude
  FROM public.provider_private_details d
  WHERE d.provider_id = NEW.provider_id;

  SELECT p.location_text INTO v_location_text
  FROM public.providers p
  WHERE p.id = NEW.provider_id;

  NEW.provider_address_snapshot := COALESCE(
    NULLIF(btrim(v_full_address), ''),
    NULLIF(btrim(v_location_text), ''),
    NEW.provider_address_snapshot
  );

  IF v_latitude IS NOT NULL AND v_longitude IS NOT NULL THEN
    NEW.provider_coordinates := jsonb_build_object('lat', v_latitude, 'lng', v_longitude);
  END IF;

  RETURN NEW;
END;
$$;

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

-- ════════════════════════════════════════════════════
-- fix_notifications_type_check.sql
-- ════════════════════════════════════════════════════
-- Deliberately last in this file. info_pack_received's section above (STEP 3
-- of that migration) redefines notifications_type_check WITHOUT
-- 'address_released' — this file's own documented "last definition wins"
-- convention means a full top-to-bottom run would otherwise end with a
-- constraint that rejects the very type the address-release notification
-- helper inserts. This is the actual fix already applied in production
-- (found via a dev_reset_provider.sql failure — see the file's own header
-- for the full story), reproduced verbatim so a fresh environment matches.

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'booking_pending', 'booking_confirmed', 'booking_declined', 'booking_cancelled',
    'booking_reminder', 'booking_in_progress', 'booking_not_started', 'no_show',
    'payment_success', 'new_provider', 'reschedule_request', 'reschedule_provider_response',
    'reschedule_confirmed', 'review_request', 'review_received', 'promotion',
    'intake_form_reminder', 'intake_form_received', 'intake_form_completed',
    'info_pack_received', 'provider_message', 'announcement', 'balance_collected',
    'balance_reminder', 'waitlist_slot_available', 'new_message',
    'address_released', 'birthday_greeting', 'post_appt_check_in',
    'rebooking_nudge', 'daily_recap'
  ));

-- ============================================================
-- DONE — Info packs attach to bookings; daily recap scheduled;
-- notifications_type_check confirmed to include every type in final use
-- ============================================================


-- ════════════════════════════════════════════════════
-- prevent_overlapping_bookings.sql
-- ════════════════════════════════════════════════════
-- ============================================================
-- CERVICED — Close the buffer/duration overlap booking race
-- Run this in the Supabase SQL editor. Safe to re-run (Steps 0-3, 5).
--
-- Root cause: bookings_no_double_book_idx (prevent_double_booking.sql) is a
-- UNIQUE index on (provider_id, booking_date, booking_time) — it stops two
-- bookings landing on the EXACT same start time, but createBooking()'s
-- buffer/duration overlap check (src/services/databaseService.ts) is a
-- plain SELECT-then-INSERT with no lock. Two concurrent requests for
-- DIFFERENT start times that still overlap once duration + buffer is
-- applied (e.g. a 90-minute booking at 2:00pm and a fresh request for
-- 2:30pm) can both pass the app-side check and both insert successfully —
-- a genuine double-booking the unique index doesn't catch.
--
-- Fix: snapshot each booking's buffer-padded [effective_start, effective_end)
-- span onto the row itself (via trigger, since buffer lives on services/
-- providers, not on bookings), then enforce non-overlap with a GiST EXCLUDE
-- constraint — atomic at the database level, immune to app-side race
-- conditions regardless of which code path writes the row (fresh booking,
-- client reschedule confirm, provider-initiated reschedule all go through
-- an INSERT or UPDATE on this table, so all three are covered by one fix
-- instead of needing the overlap check duplicated in each).
-- ============================================================

-- Step 0: needed for the EXCLUDE constraint's equality operator class on a
-- UUID column (provider_id) alongside the timestamp range's overlap
-- operator — GiST can't mix "=" and "&&" across different column types
-- without it.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Step 1: columns to hold the computed, buffer-padded span.
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS effective_start TIMESTAMP;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS effective_end   TIMESTAMP;

-- Step 2: trigger to (re)compute the span whenever scheduling-relevant
-- columns change, looking up each service's own buffer override (falling
-- back to the provider's buffer_mins) — the same rule createBooking() and
-- AvailabilityService already apply in the app (NULL on the service means
-- "no override": buffer_before -> 0, buffer_after -> provider's buffer_mins).
CREATE OR REPLACE FUNCTION public.compute_booking_effective_range()
RETURNS TRIGGER AS $$
DECLARE
  v_provider_buffer INT;
  v_buffer_before INT := 0;
  v_buffer_after INT;
  v_end_time TIME;
BEGIN
  SELECT COALESCE(buffer_mins, 0) INTO v_provider_buffer
  FROM public.providers WHERE id = NEW.provider_id;
  v_provider_buffer := COALESCE(v_provider_buffer, 0);
  v_buffer_after := v_provider_buffer;

  IF NEW.service_id IS NOT NULL THEN
    SELECT buffer_before_mins, buffer_after_mins
    INTO v_buffer_before, v_buffer_after
    FROM public.services WHERE id = NEW.service_id;
    v_buffer_before := COALESCE(v_buffer_before, 0);
    v_buffer_after := COALESCE(v_buffer_after, v_provider_buffer);
  END IF;

  v_end_time := COALESCE(NEW.end_time, NEW.booking_time + INTERVAL '60 minutes');

  NEW.effective_start := (NEW.booking_date + NEW.booking_time) - (v_buffer_before || ' minutes')::interval;
  NEW.effective_end   := (NEW.booking_date + v_end_time) + (v_buffer_after || ' minutes')::interval;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
-- SECURITY DEFINER: providers_public_read/services_public_read only expose
-- is_active rows. Without this, a provider/service that goes inactive at
-- exactly the wrong moment makes the SELECT ... INTO above match nothing,
-- and the COALESCE(..., 0) fallbacks would silently treat that as "no
-- buffer" — quietly narrowing the exact protection this migration adds,
-- instead of failing loudly. Running as the function owner means the
-- lookup always sees the real row regardless of the calling role's RLS.

DROP TRIGGER IF EXISTS trg_compute_booking_effective_range ON public.bookings;
CREATE TRIGGER trg_compute_booking_effective_range
  BEFORE INSERT OR UPDATE OF booking_date, booking_time, end_time, service_id, provider_id
  ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.compute_booking_effective_range();

-- Step 3: backfill existing rows — the trigger above only fires on future
-- INSERT/UPDATE. This no-op assignment (booking_date unchanged) still
-- fires "UPDATE OF booking_date", populating effective_start/effective_end
-- for every row already in the table. Confirmed safe: every notification
-- trigger on this table is scoped to `AFTER UPDATE OF status`, so this
-- does not touch status and will not fire any client/provider notification.
UPDATE public.bookings SET booking_date = booking_date;

-- Step 4: diagnostic — list any ACTIVE bookings that already overlap once
-- buffer is applied (possible if the race this migration closes has
-- already been hit in production). If this returns any rows, resolve them
-- manually (contact the client/provider, cancel or reschedule one side)
-- before running Step 5 — do NOT auto-cancel one side the way
-- prevent_double_booking.sql does for exact-duplicate slots. These are
-- genuinely different, real appointments; picking which one "loses" is a
-- business call, not something to script.
SELECT a.id AS booking_a, b.id AS booking_b, a.provider_id,
       a.booking_date AS date_a, a.booking_time AS time_a, a.end_time AS end_a,
       b.booking_date AS date_b, b.booking_time AS time_b, b.end_time AS end_b
FROM public.bookings a
JOIN public.bookings b
  ON a.provider_id = b.provider_id
 AND a.id < b.id
 AND a.status NOT IN ('cancelled', 'no_show')
 AND b.status NOT IN ('cancelled', 'no_show')
 AND tsrange(a.effective_start, a.effective_end) && tsrange(b.effective_start, b.effective_end);

-- Step 5: the actual guard. Run this only once Step 4 returns zero rows —
-- otherwise it will fail with "conflicting key value violates exclusion
-- constraint", which is the correct, safe outcome (see Step 4's note).
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_no_overlap;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    provider_id WITH =,
    tsrange(effective_start, effective_end) WITH &&
  ) WHERE (status NOT IN ('cancelled', 'no_show'));

-- Violations surface to the app as Postgres error code 23P01
-- (exclusion_violation) — handled in BookingContext.tsx's createBookingsFromCart
-- itemError catch alongside the existing 23505 (exact-slot) case, and
-- should be handled the same way anywhere else a booking's date/time/
-- service/provider can be written (reschedule confirm, provider reschedule).

-- ============================================================
-- DONE — buffer/duration overlap race closed at the database level
-- ============================================================

-- ════════════════════════════════════════════════════
-- ⚠️  REQUIRED FOLLOW-UP — NOT INCLUDED ABOVE, RUN SEPARATELY:
--
--   supabase/fix_users_table_pii_leak.sql
--   supabase/security_audit_2026-08-02_rls_and_hardening.sql
--   supabase/fix_portfolio_items_category.sql
--   supabase/fix_reschedule_request_rls_forgery_gap.sql
--   supabase/fix_cart_checkout_slot_hold.sql
--   supabase/fix_hold_cart_booking_slots_missing_snapshots.sql
--   supabase/fix_claim_cart_booking_slots_ambiguous_column.sql
--   supabase/provider_busy_spans_rpc.sql
--   supabase/provider_follow_notify_cron.sql
--   supabase/fix_group_booking_notification_dedup.sql
--   supabase/fix_reschedule_flow_completion.sql
--   supabase/fix_anon_executable_security_definer_functions.sql
--   supabase/fix_auto_accept_provider_notification.sql
--   supabase/fix_missing_notifications.sql
--   supabase/fix_go_live_services_bypass.sql
--   supabase/fix_provider_status_transition_guard.sql
--   supabase/fix_reschedule_request_conflict.sql
--   supabase/fix_dev_reset_and_reschedule_reminder_anon_grants.sql
--   supabase/fix_group_booking_atomic_actions.sql
--   supabase/fix_group_booking_reschedule.sql
--   supabase/fix_group_reschedule_notification_dedup.sql
--   supabase/fix_provider_terms_acceptance.sql
--   supabase/add_providers_availability_rpc.sql
--   supabase/fix_client_policy_acceptance.sql
--   supabase/fix_claim_cart_booking_slots_policy_snapshot.sql
--   supabase/fix_claim_cart_booking_slots_private_details_ambiguous.sql
--   supabase/fix_handle_booking_status_change_on_hold_notification.sql
--   supabase/fix_claim_cart_booking_slots_missing_notifications.sql
--   supabase/fix_group_booking_per_service_actions.sql
--   supabase/fix_client_reliability_tracking.sql
--   supabase/fix_provider_no_show_status.sql
--
-- All thirty-one are idempotent/safe to re-run.
--
-- The 26th: fixes a live-blocking regression in claim_cart_booking_slots() —
-- every cart-checkout booking attempt failed with 42702 "column reference
-- \"provider_id\" is ambiguous" (the new provider_private_details lookup
-- added by fix_claim_cart_booking_slots_uses_real_address.sql used a bare
-- provider_id, colliding with the function's own RETURNS TABLE OUT-parameter
-- of the same name — the exact ambiguity class the 2026-08-04 fix already
-- closed elsewhere in this function, reintroduced against a different
-- table). App fell back to a direct insert that then lost the race against
-- enforce_booking_bookability(), surfacing the misleading "That time is no
-- longer available" P0001. Root-caused live via reproduced 42702 on
-- 2026-08-10 and applied live same day.
--
-- NOTE: fix_claim_cart_booking_slots_uses_real_address.sql (2026-08-09) is
-- itself missing from this required-follow-up list despite being applied
-- live — another instance of the migration-tracking gap (see
-- supabase-migration-tracking-gap in auto-memory). Its effect is already
-- folded into the live function this 26th entry patches, so re-running it
-- isn't required, but it should still be added here (or committed) so
-- git/this file stop being blind to what's actually running.
--
-- The 27th: fixes handle_booking_status_change() firing a real
-- "Booking Cancelled" notification when an unclaimed cart-checkout or
-- waitlist hold (status 'on_hold') expires via the expire_cart_holds() /
-- expire_waitlist_holds() crons and transitions to 'cancelled' — the
-- trigger's cancellation-notification branch excluded 'pending' but not
-- 'on_hold', so a routine hold expiry read as a genuine cancellation of a
-- booking that was never actually confirmed. Added "AND OLD.status !=
-- 'on_hold'" to that branch's condition. Applied live 2026-08-10, same
-- session as the 26th entry above (both surfaced investigating the same
-- user report: a booking attempt failed with a misleading "time no longer
-- available" error AND produced a spurious cancellation notification —
-- two independent bugs in the same cart-checkout hold lifecycle).
--
-- The 28th: fixes claim_cart_booking_slots() never notifying anyone
-- (client OR provider, in-app or push) of a new booking. This function
-- claims a held slot via a bare UPDATE, which handle_new_booking()
-- (INSERT-only trigger) never sees and handle_booking_status_change() has
-- no branch for (its transitions all assumed bookings start life as
-- 'pending', the pre-cart-hold-system shape — OLD.status = 'on_hold' ->
-- NEW.status IN ('pending','confirmed') matched nothing). Confirmed live:
-- 8/8 confirmed/pending bookings in the database had zero notifications —
-- a 100% blackout affecting every provider on the now-standard
-- cart-checkout path, not a one-off. Same bug shape already fixed once
-- for the WAITLIST hold path (claim_waitlist_hold() in
-- waitlist_holds.sql:406-485) but never carried over to this
-- structurally-identical cart-checkout path. Fix mirrors that function's
-- pattern and handle_new_booking()'s exact message wording — explicit
-- client + provider notification INSERTs added per claimed item,
-- immediately after each successful claim in the loop. Applied live
-- 2026-08-10, same session as the 26th/27th entries (all three surfaced
-- investigating the same underlying incident).
--
-- The 23rd: adds providers.terms_accepted_at, stamped once on first publish
-- (InfoRegScreen.tsx, !isEditMode path, gated on its own checkbox) — closes
-- the gap where providers had no Terms & Conditions acceptance mechanism at
-- all (see LEGAL-COMPLIANCE-NOTES.md).
--
-- The 24th and 25th: the client-side counterpart, scoped to a PROVIDER's own
-- cancellation/booking policy (not the separate, still-deferred Cerviced-wide
-- Terms & Conditions). Adds bookings.policy_accepted_at/policy_snapshot,
-- written by BookingSheet/MultiBookingSheet checkout (NOT CartScreen, which
-- stays untouched) via both createBookingsFromCart write paths — the direct
-- INSERT (databaseService.createBooking, picks the new DbBooking fields up
-- automatically) and the claim_cart_booking_slots() RPC UPDATE path, which
-- (same reason as fix_claim_cart_booking_slots_uses_real_address.sql before
-- it) needed its own explicit column added since it doesn't go through the
-- insert. NOT YET APPLIED LIVE as of writing — the Supabase MCP connection
-- was down this session; apply both before trusting this entry as done.
-- Applied live 2026-08-09. NOTE: fix_cart_checkout_slot_hold.sql
-- itself is not actually present in this repo as a standalone file — it was
-- applied live 2026-08-04 without being committed (see the migration-drift
-- pattern this repo already has; check supabase-migration-tracking-gap in
-- auto-memory). The fifth entry below documents what it did; the sixth
-- entry's file IS present and is a follow-up patch on top of it.
--
-- The first two: has_gone_live/is_active gating on providers and
-- everything under them exists only as an app-side query convention, not
-- a database-enforced boundary — see the security note near the top of
-- phase1_schema.sql.
--
-- The third: backfills portfolio_items.category for rows inserted before
-- addPortfolioItem (databaseService.ts) started stamping it from the
-- provider's service_category — without it, pre-existing portfolio photos
-- stay invisible to every Explore category-filter tab (NULL never matches
-- a Postgres .eq()), even though the upload path itself is now fixed.
-- Confirmed run live 2026-08-08 (0 NULL rows remained; ran as a no-op).
--
-- The fourth: booking_reschedule_requests' reschedule_user_all /
-- reschedule_provider_all policies (defined earlier in this file, inside
-- phase1_schema.sql's inlined section) have no WITH CHECK — a client can
-- forge status='provider_responded' via direct .update(), which
-- confirm_reschedule_own_booking() then trusts without independent
-- verification. Deployed live 2026-08-03; this file's inlined
-- phase1_schema.sql copy above is NOT updated to match — run the fix file
-- to actually close the gap, don't rely on the copy above.
--
-- The fifth: adds hold_batch_id to bookings plus hold_cart_booking_slots/
-- claim_cart_booking_slots/release_cart_booking_slots/expire_cart_holds and
-- a cron job (expire-cart-holds, every 5 min) — reserves cart items as
-- on_hold bookings for a 10-minute window while a client is on the payment
-- screen, closing the gap where createBooking()'s insert-time-only conflict
-- check left a slot completely unreserved for the whole review + payment-
-- sheet interaction. App-side: CartScreen.tsx calls holdCartCheckoutSlots
-- (BookingContext) when the user taps "Confirm & Pay"; createBookingsFromCart
-- claims the batch on payment success instead of inserting fresh rows, with
-- a normal-insert fallback for any item whose hold expired. Deployed live
-- 2026-08-04.
--
-- The sixth: hold_cart_booking_slots()'s INSERT (added by the fifth entry
-- above) never set provider_name_snapshot/service_name_snapshot, both
-- NOT NULL with no default — every cart-checkout hold attempt failed
-- with 23502 regardless of date/time, discovered testing multi-provider
-- checkout. Fix gives the hold row placeholder values ('Reserving…') for
-- both; claim_cart_booking_slots() already overwrites them with the real
-- names on payment success, so the placeholder is never user-visible.
-- Deployed live 2026-08-04.
--
-- The seventh: claim_cart_booking_slots()'s WHERE clause referenced bare
-- "provider_id", ambiguous against its own RETURNS TABLE output column of
-- the same name — every claim failed with 42702, silently falling back to
-- a direct insert (non-fatal by design, but slower and loses the atomic
-- claim guarantee). Fix fully qualifies every WHERE-clause column with
-- public.bookings. Found + deployed live 2026-08-04, same test session as
-- the sixth entry above.
--
-- The eighth: get_provider_busy_spans() — clients could never see which of a
-- provider's slots were already taken. `bookings` has no public-read policy
-- (only bookings_user_read / bookings_provider_read), so every client-side
-- conflict check in AvailabilityService read ZERO rows for a provider the
-- client wasn't already booked with, and the slot picker offered taken slots
-- as free; the client only found out when checkout was rejected. Never a
-- double-booking hole — bookings_no_overlap and enforce_booking_bookability()
-- both run server-side with full visibility — but a bad, confusing UX. The
-- new SECURITY DEFINER function returns ONLY buffer-padded busy spans
-- (date + start + end, no booking id / user_id / service / price) for live
-- providers, so the picker can be accurate without granting SELECT on a
-- table holding client PII. Confirmed deployed live (migration
-- 20260806171711_provider_busy_spans_rpc, verified matching via Supabase MCP
-- 2026-08-08) — this note was stale; it had already shipped.
--
-- The ninth: adds notify_enabled/last_notified_at to provider_follows plus
-- process_follow_schedule_release_nudges() and a cron job
-- (provider-follow-schedule-release-nudges, daily 09:00 UTC) — the bell on
-- ProviderProfileScreen's hero pill now writes here (setProviderFollowNotify
-- in databaseService.ts) instead of being purely local UI state. NOT a fixed
-- monthly-since-last-sent cadence (an earlier design, briefly deployed as
-- process_follow_availability_nudges()/provider-follow-availability-nudges,
-- then superseded before it ever fired) — the PROVIDER sets a day of the
-- month via ProviderAutomationsScreen's date picker
-- (automation_settings.scheduleReleaseDay, 1-31, the day they typically
-- redo/release their schedule), and every follow row with notify_enabled =
-- TRUE gets one 'announcement' nudge on that day each month (clamped to a
-- shorter month's last day). Confirmed deployed live 2026-08-08 (columns,
-- function body, and cron job verified via Supabase MCP; old job
-- unscheduled).
--
-- The tenth: notify_address_released() and handle_booking_status_change()'s
-- booking_confirmed branch both fired strictly per bookings row, so a
-- group booking (multiple providers sharing one checkout, one address,
-- one confirmation moment — group_booking_id already stamped by
-- BookingContext.tsx after checkout) sent one "Address Now Available" and
-- one "Booking Confirmed" notification PER sibling row instead of one for
-- the whole group. Fix makes both group_booking_id-aware: only the
-- earliest-appointment sibling in a group sends, phrased for the group;
-- ungrouped bookings are unchanged. payment_success was already correctly
-- deduped app-side (BookingContext.tsx) and needed no fix. Applied live
-- 2026-08-08 via Supabase MCP; confirmed both functions are group-aware.
--
-- The eleventh: fix_reschedule_flow_completion.sql — closes 3 reschedule
-- gaps (orphaned requests on cancellation, no decline path for either
-- party, ad-hoc app-side reschedule notifications instead of trigger-owned)
-- plus a live-blocking bug (request_reschedule_own_booking's TEXT[]/DATE[]
-- type mismatch, 42804 on every call). Deployed live 2026-08-08. NOTE: its
-- Part 3 redeploys handle_booking_status_change() and — because that file
-- was drafted before the tenth entry above — its first deploy silently
-- REVERTED the tenth entry's group-aware booking_confirmed branch (two
-- CREATE OR REPLACE of the same function; last one applied wins). Caught
-- and fixed live the same session with a follow-up apply_migration merging
-- both changes; the file on disk is now updated to match. If ever
-- redeploying either of these two files standalone on a fresh environment,
-- verify BOTH markers survive afterward: group_booking_id (tenth entry) AND
-- close_orphaned_reschedule_request (eleventh entry) should both appear in
-- pg_get_functiondef('public.handle_booking_status_change').
--
-- The twelfth through seventeenth were already deployed live before this
-- note was written, but had never been added to this required-follow-up
-- list — found via a cerviced-migration-drift audit run 2026-08-08
-- (motivated by the eleventh entry's type-mismatch bug hitting production
-- while unlisted here). Each confirmed matching live via pg_get_functiondef
-- /pg_policies/proacl at audit time; none needed re-applying, only listing:
--   12. fix_anon_executable_security_definer_functions.sql — REVOKEs anon
--       EXECUTE from 5 SECURITY DEFINER functions (cancel_account_deletion,
--       dev_reset_provider, delete_client_profile, delete_provider_profile,
--       replace_provider_services). Confirmed none were exploitable (each
--       independently guards on auth.uid()) — hardening, not a live-bug fix.
--   13. fix_auto_accept_provider_notification.sql — handle_new_booking()'s
--       on_hold early-return and recipient_role-aware notification inserts.
--   14. fix_missing_notifications.sql — 6 functions (notify_on_new_chat_
--       message, handle_intake_form_completed, handle_attach_info_packs,
--       handle_new_info_pack, handle_provider_gone_live,
--       attach_info_pack_to_booking) confirmed present live, matching.
--   15. fix_go_live_services_bypass.sql — handle_availability_window_change()
--       delegates to check_and_set_provider_live() (requires availability +
--       services + address all present before flipping has_gone_live).
--   16. fix_provider_status_transition_guard.sql — provider_update_booking_
--       status()'s state-machine + timing guard (see its own header).
--   17. fix_reschedule_request_conflict.sql — booking_reschedule_requests_
--       booking_id_key UNIQUE(booking_id), the constraint every reschedule
--       RPC's ON CONFLICT (booking_id) DO UPDATE depends on.
--
-- The eighteenth: fix_dev_reset_and_reschedule_reminder_anon_grants.sql —
-- same audit surfaced 2 more anon-executable SECURITY DEFINER functions
-- beyond the twelfth entry's scope: dev_reset_provider_bookings_only()
-- (fails safe — guards on auth.uid() IS NULL, same as entry 12's functions)
-- and process_provider_stale_reschedule_reminders() (NO internal auth
-- guard at all — intended cron-only, was genuinely anon-reachable with no
-- ownership check backing it, though bounded/non-destructive). REVOKEd
-- live 2026-08-08 same session as this note.
--
-- The nineteenth: fix_group_booking_atomic_actions.sql — two new RPCs,
-- provider_update_group_booking_status(group_booking_id, status) and
-- provider_cancel_group_booking(group_booking_id), so confirming/declining/
-- cancelling one service in a group booking applies to ALL of that
-- provider's own sibling rows in the group atomically (lock-validate-write,
-- all-or-nothing — no torn state where some siblings confirm and others
-- don't). Scoped to (group_booking_id, provider_id) so a cross-provider
-- group's other providers' rows are never touched. Also extends
-- handle_booking_status_change()'s cancellation branches (provider-decline
-- and cancel-after-confirm) with the same group-representative-row
-- notification dedup the tenth entry already gave booking_confirmed — a
-- group cancel now sends exactly one notification per group per side, not
-- one per sibling row. Deployed live 2026-08-08; confirmed via
-- pg_get_functiondef both new RPCs exist and handle_booking_status_change
-- carries all four markers (group_booking_id confirm branch,
-- close_orphaned_reschedule_request, group-aware decline, group-aware
-- cancel). App-side wiring (ProviderBookingDetailScreen.tsx action buttons,
-- BookingHistory list) NOT done by this file — SQL only. (App-side wiring
-- for confirm/decline/cancel WAS completed same session, see the twentieth
-- entry's app-side note.)
--
-- The twentieth: fix_group_booking_reschedule.sql — group-aware reschedule.
-- Provider proposes new days for a WHOLE group at once (every sibling
-- service shifts together, back-to-back order preserved) via
-- provider_initiate_group_reschedule(); client confirms/declines the whole
-- group via confirm_group_reschedule()/decline_group_reschedule_offer().
-- booking_reschedule_requests stays UNIQUE(booking_id) (no schema
-- redesign) — a group proposal writes ONE row per sibling, same shape as
-- today, all sharing a new group_reschedule_batch_id column so the client
-- can fetch/confirm/decline them as one unit (same "N rows, one shared id"
-- pattern group_booking_id already uses on bookings itself). The RPCs do
-- NOT compute availability/chain-fitting server-side — that reuses the
-- existing client-side AvailabilityService.findAllBackToBackSlots, same
-- division of labor the single-booking provider_initiate_reschedule
-- already has. Deployed live 2026-08-09; confirmed via
-- pg_get_function_identity_arguments (all 3 RPCs) and
-- information_schema.columns (group_reschedule_batch_id).
--
-- App-side (same session, tsc clean): ProviderBookingDetailScreen.tsx got a
-- new group-reschedule-initiate modal reusing ModernBeautyCalendar with a
-- chain-aware slotResolver (mirrors CartScreen.tsx's existing client-side
-- group-reschedule UX); BookingContext.tsx gained confirmGroupReschedule/
-- declineGroupReschedule; RescheduleScreen.tsx detects
-- rescheduleRequest.groupRescheduleBatchId and shows/confirms the whole
-- group. Also fixed two real bugs found while building this:
-- mapDbBookingToConfirmed() never mapped serviceId (silently broke
-- chain-fitting for any ConfirmedBooking, and a "rebook" flow in
-- BookingsScreen.tsx) or isGroupBooking/groupBookingCount from the DB row —
-- both fixed in src/services/bookingService.ts.
--
-- (The reschedule-notification-per-sibling gap flagged here originally is
-- now CLOSED by the twenty-first entry below.)
--
-- The twenty-first: fix_group_reschedule_notification_dedup.sql — closes
-- the gap the twentieth entry flagged. handle_reschedule_request_change()
-- fired per-ROW on booking_reschedule_requests, so a group reschedule
-- proposal/confirm/decline sent N notifications (one per sibling). Fix
-- applies the same representative-row dedup the booking-status trigger
-- already uses, but keyed on group_reschedule_batch_id (NOT
-- group_booking_id — a fresh batch id per proposal round means a stale
-- prior round's siblings are never mistaken for the current representative
-- set), tie-broken by the request row's own original_date/original_time
-- (stable across a reschedule, unlike booking_date/time which the
-- reschedule is changing). Group notifications now read "N service(s)"
-- instead of one service name. Ungrouped reschedule requests
-- (group_reschedule_batch_id IS NULL) are completely unchanged. The
-- client-requests-a-reschedule path (status='pending') is not grouped —
-- group reschedule is provider-initiated only — so that branch is
-- untouched. Deployed live 2026-08-09 via apply_migration (returned
-- success); live pg_get_functiondef re-verify was PENDING at write time
-- (Supabase MCP disconnected right after the deploy) — re-confirm
-- group_reschedule_batch_id appears in the live function body before
-- trusting.
-- ════════════════════════════════════════════════════

-- The twenty-second (twenty-third file overall — the twenty-second slot
-- above is fix_provider_terms_acceptance.sql): add_providers_availability_rpc.sql
-- — adds get_providers_availability(text[]), a batched RPC returning a
-- coarse 'available'/'limited'/'none' status per provider slug for
-- SearchScreen's result grid, replacing a hardcoded-true fake availability
-- badge. One query for the whole result set (up to 200 providers), not a
-- per-card call — avoids the N+1 the per-provider
-- AvailabilityService.getAvailabilitySummary() would be at that scale.
-- has_gone_live/is_active gated in its base CTE; EXECUTE granted to
-- authenticated only (no anon/PUBLIC). Deployed live 2026-08-10 via
-- apply_migration (migration name get_providers_availability_batch,
-- returned success) and spot-checked against real provider rows on project
-- ztrfpfvvejzaysrelmfm — confirmed via execute_sql.
--
-- The twenty-ninth: fix_group_booking_per_service_actions.sql — closes the
-- gap where a provider could ONLY status-update or cancel a whole group
-- booking at once (the nineteenth entry's atomic RPCs), with no way to
-- mark just ONE service in a group no_show/completed, or cancel just one
-- already-confirmed service, without forcing the same outcome onto its
-- siblings. Verified live via pg_get_functiondef first: provider_update_
-- booking_status(uuid, text) and cancel_own_booking(uuid)/provider_cancel_
-- own_booking(uuid) already had NO group_booking_id guard at all, live or
-- in any tracked file — the gap was entirely app-side, not a missing DB
-- check. This migration is a verification-and-hardening pass, not a
-- behaviour change: re-affirms (byte-identical) the three single-row RPCs,
-- adds COMMENT ON FUNCTION markers on all five RPCs (the three single-row
-- ones plus the two atomic group ones from the nineteenth entry) recording
-- which is intentionally scoped to one row vs. a whole group, and
-- re-applies the REVOKE/GRANT anon lockdown defensively. App-side:
-- ProviderBookingDetailScreen.tsx's updateBookingStatus/cancelBooking
-- (group-routed) were split from new updateBookingStatusSingle/
-- cancelBookingSingle (always single-row) — only handleConfirm/
-- handleDecline (the pending-stage transitions that must stay atomic) still
-- route through the group RPCs; Start Appointment/Mark Complete/No Show and
-- post-confirm Cancel now always call the single-row RPC, even within a
-- group. ProviderBookingHistoryScreen.tsx/ProviderInboxScreen.tsx and the
-- client-hat cancel path (BookingContext.tsx/BookingDetailScreen.tsx) were
-- checked and needed no change — none of them routed a per-service action
-- through a group RPC. Deployed live 2026-08-17 via apply_migration
-- (migration name fix_group_booking_per_service_actions, returned success);
-- confirmed via execute_sql that all five COMMENT ON FUNCTION markers are
-- attached and the anon/authenticated grants are correct.
-- ════════════════════════════════════════════════════
--
-- The thirtieth: fix_client_reliability_tracking.sql — closes the gap where
-- nothing tracked how many times a specific client had no-showed or
-- cancelled late against a specific provider, making a repeat offender
-- invisible. New dedicated table client_provider_reliability, keyed on
-- (provider_id, client_user_id), with no_show_count/late_cancel_count
-- columns incremented server-side by provider_update_booking_status() (on
-- transition to no_show) and cancel_own_booking() (only when the
-- cancellation is a genuine late cancellation inside the provider's notice
-- window — not every cancellation). RLS: provider can read only their own
-- rows. App-side: a reliability read was added to databaseService.ts (no
-- raw .from() elsewhere, per this repo's access boundary), surfaced as a
-- minimal badge on ProviderClienteleScreen.tsx (batched, not per-card) and
-- ProviderBookingDetailScreen.tsx. Deployed live 2026-08-17 via
-- apply_migration (migration name fix_client_reliability_tracking,
-- returned success); table and both incrementing call sites confirmed live
-- via the Supabase CLI (`supabase db query --linked`) after the MCP tool
-- connection dropped mid-session — see fix_client_reliability_tracking.sql
-- for the full late-cancellation-definition rationale (must match
-- cancel_own_booking()'s own notice-window gate exactly, or a cancellation
-- could be logged as "late" that the RPC itself would have blocked, or vice
-- versa).
--
-- The thirty-first: fix_provider_no_show_status.sql — closes the gap where
-- `no_show` only ever represented the CLIENT not showing up. Extended
-- bookings_status_check (TEXT + CHECK, not a Postgres enum — confirmed live
-- via pg_get_constraintdef before editing) to add 'provider_no_show'. New
-- RPC client_mark_provider_no_show(p_booking_id) lets the CLIENT mark this,
-- mirroring provider_update_booking_status()'s no_show guardrails
-- (same-day, appointment start time passed, terminal-state check, no active
-- reschedule request — see docs/vault/No-Show.md for the source guardrail
-- list this mirrors). DB trigger notifies the PROVIDER on this transition,
-- consistent with this repo's "DB triggers own notifications" rule — no
-- app-side duplicate insert. App-side: BookingStatus.PROVIDER_NO_SHOW added
-- to src/types/booking.ts, mapDbBookingStatus() extended, a "Provider
-- didn't show up" client action wired into BookingDetailScreen.tsx/
-- BookingContext.tsx gated on the same guardrail math as the RPC. Deployed
-- live 2026-08-17 via apply_migration (migration name
-- fix_provider_no_show_status, returned success); the RPC, the extended
-- status_check constraint, and provider_update_booking_status (unaffected,
-- re-verified byte-identical) all confirmed live via the Supabase CLI after
-- the MCP tool connection dropped mid-session.
-- ════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════
-- claimable_provider_profiles.sql
-- ════════════════════════════════════════════════════
-- ============================================================
-- CERVICED — Claimable (scraped) Provider Profiles
-- Run this entire script in the Supabase SQL Editor.
--
-- Lets a provider row exist with no owner yet (source = 'scraped',
-- is_claimed = FALSE), created by a batch import pipeline, and adds a
-- SECURITY DEFINER RPC that lets the real business owner attach their
-- new auth account to that row via a one-time claim token.
--
-- IMPORTANT — scope of this migration:
--   Only the schema + claim_provider_profile() RPC ship here. The
--   scraping pipeline (Edge Functions) and outreach email are separate,
--   later pieces — this file alone does not scrape or email anyone.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ───────────────────────────────────────────────────────────
-- STEP 1: providers — allow unowned rows, track provenance + claim state
-- ───────────────────────────────────────────────────────────

-- Unclaimed scraped listings have no auth account yet.
ALTER TABLE public.providers ALTER COLUMN user_id DROP NOT NULL;
-- providers_user_id_key (UNIQUE) already tolerates any number of NULLs —
-- no change needed there.

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS is_claimed            BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS source                TEXT NOT NULL DEFAULT 'self_signup',
  ADD COLUMN IF NOT EXISTS source_site           TEXT,
  ADD COLUMN IF NOT EXISTS source_url            TEXT,
  ADD COLUMN IF NOT EXISTS scraped_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claimed_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claim_token           TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS claim_token_expires_at TIMESTAMPTZ,
  -- Failed claim_provider_profile() attempts against THIS row's current
  -- claim_token, since it was last (re)issued. Locked out at 5 — see the
  -- RPC below. Reset to 0 whenever a fresh code is generated/sent.
  ADD COLUMN IF NOT EXISTS claim_attempts        INT NOT NULL DEFAULT 0,
  -- Last time a verification code was sent for this listing — used to
  -- rate-limit request-claim-verification so it can't be used to spam a
  -- scraped business's real inbox.
  ADD COLUMN IF NOT EXISTS claim_token_last_sent_at TIMESTAMPTZ,
  -- Which columns came from scraping and haven't been confirmed by the
  -- owner yet — the claim UI uses this to flag fields as "please verify"
  -- instead of presenting scraped data as already-trustworthy.
  ADD COLUMN IF NOT EXISTS scraped_fields        TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.providers DROP CONSTRAINT IF EXISTS providers_source_check;
ALTER TABLE public.providers
  ADD CONSTRAINT providers_source_check CHECK (source IN ('self_signup', 'scraped'));

-- A claimed row must have an owner, and an unclaimed row must not —
-- keeps the two concepts from drifting apart under a bad update.
ALTER TABLE public.providers DROP CONSTRAINT IF EXISTS providers_claim_state_check;
ALTER TABLE public.providers
  ADD CONSTRAINT providers_claim_state_check CHECK (
    (is_claimed = TRUE  AND user_id IS NOT NULL) OR
    (is_claimed = FALSE AND user_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_providers_is_claimed  ON public.providers(is_claimed);
CREATE INDEX IF NOT EXISTS idx_providers_claim_token ON public.providers(claim_token);

-- Existing RLS on `providers` only grants public SELECT via
-- providers_public_read (has_gone_live = true AND is_active = true) — every
-- unclaimed/scraped row is has_gone_live = false by construction, so without
-- this policy no client session can ever read one, regardless of what
-- app-side queries ask for (searchUnclaimedProviders, getUnclaimedProviderDetail,
-- getDiscoverUnclaimedProviders in databaseService.ts all silently return
-- zero rows). Narrowly scoped to is_claimed = false only — additive
-- alongside providers_public_read (multiple PERMISSIVE policies OR
-- together), so it can never widen access to a claimed provider's row.
DROP POLICY IF EXISTS providers_unclaimed_read ON public.providers;
CREATE POLICY providers_unclaimed_read
  ON public.providers
  FOR SELECT
  TO public
  USING (is_claimed = false);

-- ───────────────────────────────────────────────────────────
-- STEP 2: provider_scrape_jobs / provider_scrape_sources
--   Batch-run tracking for the (separate, not-yet-built) scraping
--   pipeline — mirrors the job-table style already used in
--   automation_jobs.sql / client_automation_jobs.sql.
-- ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.provider_scrape_jobs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_site    TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed')),
  total_sources  INT NOT NULL DEFAULT 0,
  processed      INT NOT NULL DEFAULT 0,
  created_count  INT NOT NULL DEFAULT 0,
  skipped_dupes  INT NOT NULL DEFAULT 0,
  failed_count   INT NOT NULL DEFAULT 0,
  started_at     TIMESTAMPTZ,
  finished_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.provider_scrape_sources (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       UUID NOT NULL REFERENCES public.provider_scrape_jobs(id) ON DELETE CASCADE,
  source_url   TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed')),
  error        TEXT,
  provider_id  UUID REFERENCES public.providers(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scrape_sources_job_status
  ON public.provider_scrape_sources(job_id, status);

-- Both tables are written only by Edge Functions using the service-role
-- key, which bypasses RLS entirely — enable RLS with no policies so no
-- anon/authenticated client can read or write job internals directly.
ALTER TABLE public.provider_scrape_jobs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_scrape_sources ENABLE ROW LEVEL SECURITY;

-- ───────────────────────────────────────────────────────────
-- STEP 3: provider_outreach_suppressions
--   Schema only, for the (also separate, not-yet-built and NOT
--   currently enabled) outreach step — every future send must check
--   this table first, and the unsubscribe link writes to it.
-- ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.provider_outreach_suppressions (
  email          TEXT PRIMARY KEY,
  suppressed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.provider_outreach_suppressions ENABLE ROW LEVEL SECURITY;

-- ───────────────────────────────────────────────────────────
-- STEP 4: claim_provider_profile(p_provider_id, p_claim_token)
--   Lets the currently authenticated user attach their account to an
--   unclaimed provider row. SECURITY DEFINER because it must update a
--   providers row the caller does not yet own (providers_owner_all only
--   allows user_id = auth.uid(), which is by definition not yet true).
--
--   Takes the listing's id explicitly (the caller already knows it from
--   the earlier search/preview step) rather than looking the row up by
--   token alone — a wrong-code guess can't be matched to a row via
--   `WHERE claim_token = ...` (it doesn't match anything), so there'd be
--   nowhere to record a failed attempt. Keying off p_provider_id lets us
--   count failed attempts *against that specific listing* and lock it out
--   after 5, which is the realistic brute-force shape here: an attacker
--   who found a listing via search, guessing its 6-digit code.
--
--   claim_attempts resets to 0 whenever request-claim-verification issues
--   a fresh code, so a real owner who mistypes isn't punished across
--   separate attempts at getting the email.
-- ───────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.claim_provider_profile(TEXT);

CREATE OR REPLACE FUNCTION public.claim_provider_profile(p_provider_id UUID, p_claim_token TEXT)
RETURNS UUID AS $$
DECLARE
  v_caller_id   UUID := auth.uid();
  v_claim_token TEXT;
  v_expires_at  TIMESTAMPTZ;
  v_attempts    INT;
  v_is_claimed  BOOLEAN;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Must be signed in to claim a profile.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.providers WHERE user_id = v_caller_id) THEN
    RAISE EXCEPTION 'This account already has a provider profile.';
  END IF;

  -- Lock this specific listing for the duration of the check — serializes
  -- concurrent claim attempts against it (both the attempt-counter bumps
  -- and the eventual successful claim).
  SELECT claim_token, claim_token_expires_at, claim_attempts, is_claimed
    INTO v_claim_token, v_expires_at, v_attempts, v_is_claimed
  FROM public.providers
  WHERE id = p_provider_id
  FOR UPDATE;

  IF NOT FOUND OR v_is_claimed THEN
    RAISE EXCEPTION 'This claim link is invalid or has expired.';
  END IF;

  -- Already burned through 5 wrong guesses on this listing's current code —
  -- null out the token so it can't be tried again, and give the same
  -- generic error a genuinely-expired code would give (no signal to an
  -- attacker about *why* it failed).
  IF v_attempts >= 5 THEN
    UPDATE public.providers
       SET claim_token = NULL, claim_token_expires_at = NULL
     WHERE id = p_provider_id;
    RAISE EXCEPTION 'This claim link is invalid or has expired.';
  END IF;

  IF v_claim_token IS NULL
     OR v_claim_token != p_claim_token
     OR v_expires_at IS NULL
     OR v_expires_at <= NOW() THEN
    UPDATE public.providers
       SET claim_attempts = claim_attempts + 1
     WHERE id = p_provider_id;
    RAISE EXCEPTION 'This claim link is invalid or has expired.';
  END IF;

  UPDATE public.providers
     SET user_id                = v_caller_id,
         is_claimed              = TRUE,
         claimed_at               = NOW(),
         claim_token              = NULL,
         claim_token_expires_at   = NULL,
         claim_attempts           = 0
   WHERE id = p_provider_id;

  UPDATE public.users SET role = 'provider' WHERE id = v_caller_id;

  RETURN p_provider_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ───────────────────────────────────────────────────────────
-- VERIFY — run after executing this script:
--
--   -- schema landed
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'providers' AND column_name IN
--          ('is_claimed','source','claim_token','scraped_fields','claim_attempts','claim_token_last_sent_at');
--
--   -- seed one fake unclaimed row, then claim it as a signed-in test user
--   INSERT INTO public.providers
--     (slug, display_name, service_category, is_claimed, source,
--      claim_token, claim_token_expires_at, scraped_fields)
--   VALUES
--     ('test-claim-me', 'Test Claim Me', 'NAILS', FALSE, 'scraped',
--      'test-token-123', NOW() + INTERVAL '7 days', ARRAY['display_name']);
--
--   SELECT public.claim_provider_profile(
--     (SELECT id FROM public.providers WHERE slug = 'test-claim-me'),
--     'test-token-123'
--   );
--
--   -- brute-force lockout: 5 wrong codes against the same listing should
--   -- exhaust claim_attempts and null out its token/expiry
--   SELECT public.claim_provider_profile(
--     (SELECT id FROM public.providers WHERE slug = 'test-claim-me'),
--     'wrong-guess'
--   ); -- repeat 5x, then confirm claim_token IS NULL on that row
-- ───────────────────────────────────────────────────────────

-- ============================================================
-- DONE — claimable provider profile schema + claim RPC created.
-- Scraping pipeline and outreach email are separate follow-up pieces.
-- ============================================================

-- ============================================================
-- provider_signup_business_fields.sql — new provider-signup Step 4/5
-- questions (team size, accessibility, languages, specialties, price range,
-- contact preferences, preferred payment type). See that file for the full
-- rationale on staging price_range/preferred_contact_methods on `users`
-- even though their permanent home is `providers` (price_tier /
-- preferred_contact_methods) — a brand-new signup has no providers row yet
-- to write into.
-- ============================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS team_size TEXT
    CHECK (team_size IN ('solo','small_team','large_team')),
  ADD COLUMN IF NOT EXISTS accessibility_notes TEXT,
  ADD COLUMN IF NOT EXISTS languages_spoken TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS specialties TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS price_range TEXT
    CHECK (price_range IN ('budget','mid','premium','luxury')),
  ADD COLUMN IF NOT EXISTS preferred_contact_methods TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS preferred_payment_methods TEXT[] DEFAULT '{}';

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS team_size TEXT
    CHECK (team_size IN ('solo','small_team','large_team')),
  ADD COLUMN IF NOT EXISTS accessibility_notes TEXT,
  ADD COLUMN IF NOT EXISTS languages_spoken TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS service_locations TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS preferred_payment_methods TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_providers_service_locations
  ON public.providers USING GIN (service_locations);

-- ============================================================
-- DONE — provider_signup_business_fields.sql applied.
-- ============================================================

-- ════════════════════════════════════════════════════════════════════════════
-- fix_no_show_grace_period.sql
--
-- GAP: provider_update_booking_status()'s no_show guard allowed marking a
-- booking no_show the instant appointment start time passed (same calendar
-- day only) — no grace period. FIX: booking_policies.noShowGraceMinutes
-- (JSONB key, default 0 = unchanged behavior); no_show guard now checks
-- now() >= appointment_start + grace_minutes. Applied live 2026-08-17,
-- confirmed via pg_get_functiondef against the pre-existing live body
-- (which already carried the same-day + active-reschedule-request guards
-- from the post-fix_provider_status_transition_guard.sql hardening — both
-- preserved unchanged). See fix_no_show_grace_period.sql for full rationale.
-- Safe to re-run (CREATE OR REPLACE).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.provider_update_booking_status(p_booking_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_status  text;
  v_booking_date    date;
  v_booking_time    time;
  v_appt_start      timestamp;
  v_active_reschedule boolean;
  v_provider_id     uuid;
  v_grace_minutes   integer;
BEGIN
  SELECT b.status, b.booking_date, b.booking_time, b.provider_id
    INTO v_current_status, v_booking_date, v_booking_time, v_provider_id
    FROM public.bookings b
   WHERE b.id = p_booking_id
     AND b.provider_id IN (SELECT p.id FROM public.providers p WHERE p.user_id = auth.uid())
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found or not owned by caller';
  END IF;

  IF v_current_status IN ('cancelled', 'completed', 'no_show') THEN
    RAISE EXCEPTION 'Booking is already %, no further status changes allowed', v_current_status;
  END IF;

  IF p_status = 'cancelled' THEN
    RAISE EXCEPTION 'Use provider_cancel_own_booking() to cancel a booking';
  END IF;

  v_appt_start := (v_booking_date + v_booking_time)::timestamp;

  SELECT COALESCE((booking_policies->>'noShowGraceMinutes')::integer, 0)
    INTO v_grace_minutes
    FROM public.providers
   WHERE id = v_provider_id;
  v_grace_minutes := GREATEST(COALESCE(v_grace_minutes, 0), 0);

  IF p_status = 'no_show' THEN
    IF v_booking_date <> CURRENT_DATE THEN
      RAISE EXCEPTION 'no_show can only be marked on the day of the appointment';
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.booking_reschedule_requests r
       WHERE r.booking_id = p_booking_id
         AND r.status IN ('pending', 'provider_responded')
    ) INTO v_active_reschedule;
    IF v_active_reschedule THEN
      RAISE EXCEPTION 'Cannot mark no_show while a reschedule request is active for this booking';
    END IF;
  END IF;

  IF v_current_status = 'pending' THEN
    IF p_status <> 'confirmed' THEN
      RAISE EXCEPTION 'Invalid status transition: % -> %', v_current_status, p_status;
    END IF;

  ELSIF v_current_status = 'confirmed' THEN
    IF p_status = 'in_progress' THEN
      NULL;
    ELSIF p_status = 'no_show' THEN
      IF NOW() < v_appt_start + (v_grace_minutes * INTERVAL '1 minute') THEN
        RAISE EXCEPTION 'Cannot mark no_show until % minute(s) after the appointment start time', v_grace_minutes;
      END IF;
    ELSIF p_status = 'completed' THEN
      IF v_appt_start >= NOW() THEN
        RAISE EXCEPTION 'Cannot mark % before the appointment start time', p_status;
      END IF;
    ELSE
      RAISE EXCEPTION 'Invalid status transition: % -> %', v_current_status, p_status;
    END IF;

  ELSIF v_current_status = 'in_progress' THEN
    IF p_status = 'completed' THEN
      NULL;
    ELSIF p_status = 'no_show' THEN
      IF NOW() < v_appt_start + (v_grace_minutes * INTERVAL '1 minute') THEN
        RAISE EXCEPTION 'Cannot mark no_show until % minute(s) after the appointment start time', v_grace_minutes;
      END IF;
    ELSE
      RAISE EXCEPTION 'Invalid status transition: % -> %', v_current_status, p_status;
    END IF;

  ELSE
    RAISE EXCEPTION 'Unrecognized current status: %', v_current_status;
  END IF;

  UPDATE public.bookings SET status = p_status WHERE id = p_booking_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.provider_update_booking_status(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provider_update_booking_status(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.provider_update_booking_status(uuid, text) TO authenticated;

-- ============================================================
-- DONE — fix_no_show_grace_period.sql applied.
-- ============================================================

-- ════════════════════════════════════════════════════════════════════════════
-- fix_pending_booking_provider_reminder.sql
--
-- GAP: process_pending_booking_warnings() (cron pending-booking-warnings,
-- 0 10 * * *) notified only the CLIENT at T-24h that a booking was still
-- pending — the provider, who actually needs to confirm/decline it before
-- process_expire_stale_pending_bookings() auto-cancels it, was never
-- notified. FIX: same function now also notifies the provider, using new
-- notification_type 'pending_booking_reminder' (added to
-- notifications_type_check), same T-24h population + 25h dedup window,
-- scoped to the provider's own user id. No opt-out column exists for
-- providers yet (fires unconditionally, matching this repo's other
-- provider-facing reminder crons). Applied live 2026-08-17. See
-- fix_pending_booking_provider_reminder.sql for full rationale.
-- Safe to re-run (CREATE OR REPLACE; constraint re-add is idempotent).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'booking_pending', 'booking_confirmed', 'booking_declined', 'booking_cancelled',
    'booking_reminder', 'booking_in_progress', 'booking_not_started', 'no_show',
    'payment_success', 'new_provider', 'reschedule_request', 'reschedule_provider_response',
    'reschedule_confirmed', 'reschedule_declined', 'review_request', 'review_received', 'promotion',
    'intake_form_reminder', 'intake_form_received', 'intake_form_completed',
    'info_pack_received', 'provider_message', 'announcement', 'balance_reminder',
    'waitlist_slot_available', 'new_message', 'address_released', 'birthday_greeting',
    'post_appt_check_in', 'rebooking_nudge', 'daily_recap', 'schedule_fully_booked',
    'pending_booking_reminder'
  ));

CREATE OR REPLACE FUNCTION public.process_pending_booking_warnings()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT b.id AS booking_id, b.user_id, b.booking_date, b.booking_time,
           b.service_name_snapshot, b.provider_name_snapshot, b.provider_id
    FROM public.bookings b
    JOIN public.users u ON u.id = b.user_id
    WHERE b.status = 'pending'
      AND (b.booking_date::TIMESTAMP + b.booking_time) BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
      AND u.pending_warning_enabled = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.booking_id = b.id AND n.user_id = b.user_id
          AND n.type = 'booking_pending' AND n.recipient_role = 'client'
          AND n.created_at > NOW() - INTERVAL '25 hours'
      )
  LOOP
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      r.user_id, 'booking_pending', 'Booking Still Awaiting Confirmation',
      'Your ' || r.service_name_snapshot ||
        ' with ' || r.provider_name_snapshot ||
        ' on ' || TO_CHAR(r.booking_date, 'DD Mon YYYY') ||
        ' at ' || TO_CHAR(r.booking_time, 'HH12:MI AM') ||
        ' has not been confirmed yet. You may want to contact the provider.',
      'high', TRUE, r.booking_id, r.provider_id, 'client'
    );
  END LOOP;

  FOR r IN
    SELECT b.id AS booking_id, b.booking_date, b.booking_time,
           b.service_name_snapshot, b.customer_name, b.provider_id,
           p.user_id AS provider_user_id
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
    WHERE b.status = 'pending'
      AND (b.booking_date::TIMESTAMP + b.booking_time) BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
      AND p.user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.booking_id = b.id AND n.user_id = p.user_id
          AND n.type = 'pending_booking_reminder' AND n.recipient_role = 'provider'
          AND n.created_at > NOW() - INTERVAL '25 hours'
      )
  LOOP
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      r.provider_user_id, 'pending_booking_reminder', 'Booking Awaiting Your Response',
      r.customer_name || '''s ' || r.service_name_snapshot ||
        ' on ' || TO_CHAR(r.booking_date, 'DD Mon YYYY') ||
        ' at ' || TO_CHAR(r.booking_time, 'HH12:MI AM') ||
        ' is still pending confirmation — it will auto-cancel if not confirmed or declined in time.',
      'high', TRUE, r.booking_id, r.provider_id, 'provider'
    );
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.process_pending_booking_warnings() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_pending_booking_warnings() FROM anon;
GRANT EXECUTE ON FUNCTION public.process_pending_booking_warnings() TO authenticated, service_role;

-- ============================================================
-- DONE — fix_pending_booking_provider_reminder.sql applied.
-- ============================================================

-- ════════════════════════════════════════════════════════════════════════════
-- fix_waitlist_selection_method_hook.sql
--
-- GAP: invite_next_waitlist_entry() ordered candidates strictly FIFO
-- (position ASC), zero provider input. SCOPE: schema hook only for this
-- pass — booking_policies.waitlistSelectionMethod ('fifo' default |
-- 'manual' reserved), read defensively; every value still falls through to
-- the same FIFO ordering (no manual-selection logic implemented).
--
-- IMPORTANT: this REPLACE is layered on top of the already-live
-- BOOLEAN-returning version of this function (from
-- supabase/migrations/20260817110500_waitlist_lapse_and_exhaustion_
-- notifications.sql — confirmed applied live via pg_get_functiondef before
-- writing this), not the old VOID version — preserves the TRUE/FALSE
-- offered-vs-exhausted return contract that expire_waitlist_holds()/
-- decline_waitlist_hold() depend on for their "waitlist exhausted"
-- provider notifications. Applied live 2026-08-17. See
-- fix_waitlist_selection_method_hook.sql for full rationale.
-- Safe to re-run (CREATE OR REPLACE).
-- ════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.invite_next_waitlist_entry(UUID, UUID, DATE, TIME, TIME, NUMERIC, NUMERIC, NUMERIC, TEXT);

CREATE OR REPLACE FUNCTION public.invite_next_waitlist_entry(
  p_provider_id UUID,
  p_service_id  UUID,
  p_booking_date DATE DEFAULT NULL,
  p_booking_time TIME DEFAULT NULL,
  p_end_time TIME DEFAULT NULL,
  p_base_price NUMERIC DEFAULT NULL,
  p_add_ons_total NUMERIC DEFAULT NULL,
  p_service_charge NUMERIC DEFAULT NULL,
  p_service_category_snapshot TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  w                   RECORD;
  v_waitlist_enabled  BOOLEAN;
  v_auto_accept       BOOLEAN;
  v_selection_method  TEXT;
  v_new_booking_id    UUID;
BEGIN
  SELECT COALESCE((automation_settings->>'waitlistEnabled')::boolean, TRUE),
         COALESCE((automation_settings->>'autoAcceptWaitlist')::boolean, FALSE),
         COALESCE(booking_policies->>'waitlistSelectionMethod', 'fifo')
    INTO v_waitlist_enabled, v_auto_accept, v_selection_method
    FROM public.providers WHERE id = p_provider_id;

  IF NOT COALESCE(v_waitlist_enabled, TRUE) THEN
    RETURN FALSE;
  END IF;
  IF p_booking_date IS NULL OR p_booking_time IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_selection_method IS DISTINCT FROM 'fifo' THEN
    NULL; -- reserved for future manual-selection logic; FIFO fallback below
  END IF;

  FOR w IN
    SELECT *
      FROM public.provider_waitlist
     WHERE provider_id = p_provider_id
       AND status = 'waiting'
       AND (service_id = p_service_id OR service_id IS NULL)
       AND (
         preferred_dates IS NULL
         OR (p_booking_date >= preferred_dates[1]
             AND p_booking_date <= COALESCE(preferred_dates[2], 'infinity'::date))
       )
     ORDER BY (service_id IS NOT NULL AND service_id = p_service_id) DESC,
              position ASC
  LOOP
    BEGIN
      IF v_auto_accept THEN
        INSERT INTO public.bookings (
          user_id, provider_id, service_id, status,
          booking_date, booking_time, end_time,
          payment_type, base_price, add_ons_total, service_charge,
          deposit_amount, amount_paid, remaining_balance, payment_status,
          is_group_booking, group_booking_count,
          provider_name_snapshot, service_name_snapshot, service_category_snapshot,
          customer_name, waitlist_entry_id
        ) VALUES (
          w.user_id, p_provider_id, p_service_id, 'pending',
          p_booking_date, p_booking_time, p_end_time,
          'full', COALESCE(p_base_price, 0), COALESCE(p_add_ons_total, 0), COALESCE(p_service_charge, 0),
          0, 0, COALESCE(p_base_price, 0) + COALESCE(p_add_ons_total, 0) + COALESCE(p_service_charge, 0), 'pending',
          FALSE, 1,
          w.provider_name_snapshot, w.service_name_snapshot, p_service_category_snapshot,
          w.user_name_snapshot, w.id
        )
        RETURNING id INTO v_new_booking_id;

        UPDATE public.provider_waitlist SET status = 'booked', notified_at = NOW() WHERE id = w.id;
        RETURN TRUE;
      ELSE
        INSERT INTO public.bookings (
          user_id, provider_id, service_id, status,
          booking_date, booking_time, end_time,
          payment_type, base_price, add_ons_total, service_charge,
          deposit_amount, amount_paid, remaining_balance, payment_status,
          is_group_booking, group_booking_count,
          provider_name_snapshot, service_name_snapshot, service_category_snapshot,
          customer_name, waitlist_entry_id, hold_expires_at
        ) VALUES (
          w.user_id, p_provider_id, p_service_id, 'on_hold',
          p_booking_date, p_booking_time, p_end_time,
          'full', COALESCE(p_base_price, 0), COALESCE(p_add_ons_total, 0), COALESCE(p_service_charge, 0),
          0, 0, COALESCE(p_base_price, 0) + COALESCE(p_add_ons_total, 0) + COALESCE(p_service_charge, 0), 'pending',
          FALSE, 1,
          w.provider_name_snapshot, w.service_name_snapshot, p_service_category_snapshot,
          w.user_name_snapshot, w.id, NOW() + INTERVAL '3 hours'
        )
        RETURNING id INTO v_new_booking_id;

        UPDATE public.provider_waitlist SET status = 'notified', notified_at = NOW() WHERE id = w.id;

        INSERT INTO public.notifications
          (user_id, type, title, message, priority, is_actionable, provider_id, recipient_role, booking_id)
        VALUES (
          w.user_id,
          'waitlist_slot_available',
          'A slot opened up!',
          w.service_name_snapshot || ' with ' || w.provider_name_snapshot ||
            ' — ' || TO_CHAR(p_booking_date, 'DD Mon') || ' at ' || TO_CHAR(p_booking_time, 'HH12:MI AM') ||
            ' is held for you for 3 hours. Confirm now before it goes to the next person.',
          'high',
          TRUE,
          p_provider_id,
          'client',
          v_new_booking_id
        );
        RETURN TRUE;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
  END LOOP;
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.invite_next_waitlist_entry(UUID, UUID, DATE, TIME, TIME, NUMERIC, NUMERIC, NUMERIC, TEXT) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.invite_next_waitlist_entry(UUID, UUID, DATE, TIME, TIME, NUMERIC, NUMERIC, NUMERIC, TEXT) FROM public;
REVOKE EXECUTE ON FUNCTION public.invite_next_waitlist_entry(UUID, UUID, DATE, TIME, TIME, NUMERIC, NUMERIC, NUMERIC, TEXT) FROM anon;

-- ============================================================
-- DONE — fix_waitlist_selection_method_hook.sql applied.
-- ============================================================

-- ════════════════════════════════════════════════════════════════════════════
-- notifications_cleanup_2026_08.sql (was never folded in before — this
-- block was still writing birthday_greeting/rebooking_nudge notifications
-- under type='announcement'/'booking_reminder' with the real identity
-- hidden in metadata->>'kind', instead of the real, dedicated type values
-- the CHECK constraint already allowed. Folded in now as a prerequisite for
-- fix_vague_notification_copy.sql below, which layers improved title/body
-- text on top of these same three functions and assumes the real type
-- values are already in use.
--
-- Also removes process_provider_outstanding_balance_reminders() (the app
-- has no business nagging providers about an off-app remaining-balance
-- payment it never collects or verifies — see CLAUDE.md's deposit/balance
-- liability boundary) and the dead process_user_24hr_reminders() (zero
-- callers; process_client_appointment_reminders() is the real 24/48/72h
-- reminder path). handle_booking_cancelled() was also dropped in the
-- source file as dead code, but was never defined in this file at all, so
-- that DROP is a no-op here.
--
-- The notifications_type_check rebuild below also adds 'provider_no_show',
-- which the most recent constraint version above (STEP:
-- fix_pending_booking_provider_reminder.sql) was still missing despite
-- fix_provider_no_show_status.sql adding it live — same never-folded-in gap.
-- ════════════════════════════════════════════════════════════════════════════

SELECT cron.unschedule('provider-outstanding-balance-reminders');
DROP FUNCTION IF EXISTS public.process_provider_outstanding_balance_reminders();
DROP FUNCTION IF EXISTS public.process_user_24hr_reminders();
DROP FUNCTION IF EXISTS public.handle_booking_cancelled();

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'booking_pending', 'booking_confirmed', 'booking_declined', 'booking_cancelled',
    'booking_reminder', 'booking_in_progress', 'booking_not_started', 'no_show',
    'provider_no_show', 'payment_success', 'new_provider', 'reschedule_request',
    'reschedule_provider_response', 'reschedule_confirmed', 'reschedule_declined',
    'review_request', 'review_received', 'promotion',
    'intake_form_reminder', 'intake_form_received', 'intake_form_completed',
    'info_pack_received', 'provider_message', 'announcement', 'balance_reminder',
    'waitlist_slot_available', 'new_message', 'address_released', 'birthday_greeting',
    'post_appt_check_in', 'rebooking_nudge', 'daily_recap', 'schedule_fully_booked',
    'pending_booking_reminder'
    -- 'balance_collected' intentionally excluded: 0 live rows, no producer anywhere.
  ));

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

-- ============================================================
-- DONE — notifications_cleanup_2026_08.sql applied.
-- ============================================================

-- ════════════════════════════════════════════════════════════════════════════
-- fix_vague_notification_copy.sql
--
-- Found by a notification-copy audit (2026-08-17): three templates didn't
-- use data already available in their own query, reading as generic filler
-- identical regardless of the actual situation. Layers on top of the
-- notifications_cleanup_2026_08.sql block just above (same three functions,
-- real type values already in place) — only the SELECT list and the
-- message/title strings change here, not any eligibility/dedup logic.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.process_provider_unread_message_reminders()
RETURNS VOID AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.id AS conversation_id, c.provider_id, c.updated_at,
           p.user_id AS provider_user_id, u.name AS client_name
    FROM public.provider_conversations c
    JOIN public.providers p ON p.id = c.provider_id
    JOIN public.users u ON u.id = c.user_id
    WHERE c.unread_count_provider > 0
      AND c.updated_at < NOW() - INTERVAL '2 hours'
      AND p.reminder_notifications_enabled = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.provider_id = c.provider_id AND n.user_id = p.user_id
          AND n.type = 'provider_message'
          AND (n.metadata->>'conversation_id') = c.id::text
          AND n.created_at > NOW() - INTERVAL '4 hours'
      )
  LOOP
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, provider_id, metadata, recipient_role)
    VALUES (
      r.provider_user_id, 'provider_message',
      COALESCE(r.client_name, 'A client') || ' is waiting on a reply',
      COALESCE(r.client_name, 'A client') || ' has been waiting ' ||
        GREATEST(1, ROUND(EXTRACT(EPOCH FROM (NOW() - r.updated_at)) / 3600)::INT) ||
        ' hour' || CASE WHEN GREATEST(1, ROUND(EXTRACT(EPOCH FROM (NOW() - r.updated_at)) / 3600)::INT) = 1 THEN '' ELSE 's' END ||
        ' for a reply from you.',
      'medium', TRUE, r.provider_id,
      jsonb_build_object('conversation_id', r.conversation_id),
      'provider'
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
      p.display_name,
      (p.automation_settings->>'rebookingNudgeWeeks')::INT AS nudge_weeks,
      (ARRAY_AGG(b.service_name_snapshot ORDER BY b.booking_date DESC))[1] AS last_service_name
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
      'It''s been ' || r.nudge_weeks || ' week' || CASE WHEN r.nudge_weeks = 1 THEN '' ELSE 's' END ||
        ' since your last ' || COALESCE(r.last_service_name, 'appointment') ||
        ' with ' || COALESCE(r.display_name, 'them') || ' — book your next one now.',
      'medium',
      TRUE,
      r.provider_id,
      jsonb_build_object('kind', 'rebooking_nudge')
    );
  END LOOP;
END;
$function$;

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
      u.name AS customer_name,
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
      'Happy birthday' || CASE WHEN r.customer_name IS NOT NULL THEN ', ' || r.customer_name ELSE '' END ||
        '! Treat yourself — your next appointment with ' || COALESCE(r.display_name, 'them') || ' is just a tap away.',
      'low',
      TRUE,
      r.provider_id,
      jsonb_build_object('kind', 'birthday_greeting')
    );
  END LOOP;
END;
$function$;

-- ============================================================
-- DONE — fix_vague_notification_copy.sql applied.
-- ============================================================

-- ════════════════════════════════════════════════════════════════════════════
-- provider_practice_details_columns.sql — promotes 13 provider "practice
-- detail" fields out of device-local AsyncStorage ('@provider_extras') and
-- into real `providers` columns, so they survive reinstall, sync across
-- devices, and can actually reach clients.
--
-- Three are trust/safety-adjacent and were the real reason this couldn't
-- stay device-local: patch_test_policy (health-adjacent — clients need it
-- BEFORE booking), plus is_insured_self_declared / dbs_checked_self_declared.
-- The `_self_declared` suffix is deliberate: these are provider attestations
-- that Cerviced does NOT verify, and must never be presented as
-- platform-verified credentials.
--
-- Additive and nullable throughout, no backfill — existing rows read as
-- "not set" rather than a false negative. RLS unchanged: providers_owner_all
-- already covers writes, providers_public_read already gates client reads on
-- has_gone_live = true AND is_active = true.
-- See supabase/provider_practice_details_columns.sql for the full rationale.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS patch_test_policy TEXT
    CHECK (patch_test_policy IN ('always','new_clients','optional','not_needed')),
  ADD COLUMN IF NOT EXISTS qualifications TEXT,
  ADD COLUMN IF NOT EXISTS is_insured_self_declared BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dbs_checked_self_declared BOOLEAN NOT NULL DEFAULT false,
  -- No `service_setting` column here on purpose — the UI replaced that
  -- single-setting question with a cities-covered selector writing
  -- `service_locations`. See supabase/provider_practice_details_columns.sql.
  ADD COLUMN IF NOT EXISTS travel_radius TEXT,
  ADD COLUMN IF NOT EXISTS clientele TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS availability_windows TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS accepts_new_clients TEXT
    CHECK (accepts_new_clients IN ('yes','waitlist','no')),
  ADD COLUMN IF NOT EXISTS walk_ins_welcome BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS group_bookings_available BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS products_used TEXT,
  ADD COLUMN IF NOT EXISTS vegan_cruelty_free BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_providers_clientele
  ON public.providers USING GIN (clientele);
CREATE INDEX IF NOT EXISTS idx_providers_availability_windows
  ON public.providers USING GIN (availability_windows);
CREATE INDEX IF NOT EXISTS idx_providers_accepts_new_clients
  ON public.providers (accepts_new_clients)
  WHERE accepts_new_clients IS NOT NULL;

COMMENT ON COLUMN public.providers.patch_test_policy IS
  'Health-adjacent: whether a patch test is required before treatment. Shown to clients pre-booking.';
COMMENT ON COLUMN public.providers.is_insured_self_declared IS
  'Provider self-attestation only. Cerviced does NOT verify insurance — never present as platform-verified.';
COMMENT ON COLUMN public.providers.dbs_checked_self_declared IS
  'Provider self-attestation only. Cerviced does NOT verify DBS status — never present as platform-verified.';

-- ============================================================
-- DONE — provider_practice_details_columns.sql applied.
-- ============================================================

-- ============================================================
-- cron_job_run_details_retention.sql
--
-- cron.job_run_details grows without bound: pg_cron writes one INSERT and
-- three UPDATEs per job run, and nothing ever purges it. With 24 active jobs
-- (nine on */5 or */15 schedules) this reached ~27k rows / 6.2 MB in six
-- weeks, costing ~121s of CPU on the inserts alone.
--
-- pg_cron does not ship a retention policy, so schedule one.
-- Safe to re-run: unschedules any prior copy of the job first.
-- ============================================================

-- Drop a previously-scheduled copy so this file stays idempotent.
DO $$
BEGIN
  PERFORM cron.unschedule('purge-cron-run-history');
EXCEPTION WHEN OTHERS THEN
  NULL; -- not scheduled yet
END $$;

SELECT cron.schedule(
  'purge-cron-run-history',
  '17 4 * * *',  -- daily, off-peak, offset from the 0/8/9/10 job cluster
  $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days'$$
);

-- One-off catch-up for the existing backlog. The scheduled job above keeps it
-- trimmed from here on.
DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days';

-- ============================================================
-- DONE — cron_job_run_details_retention.sql applied.
-- ============================================================


-- ════════════════════════════════════════════════════
-- add_service_images_aspect_ratio.sql
-- ════════════════════════════════════════════════════
-- NOTE: only the SCHEMA half of that file is bundled here. Its one-off
-- backfill UPDATE targets specific live row ids (measured out-of-band from
-- the image files themselves) and is meaningless in a fresh environment —
-- new rows get their ratio written at upload time by
-- replace_provider_services(), and anything still NULL is measured on the
-- client. See supabase/add_service_images_aspect_ratio.sql for the backfill.
-- service_images.aspect_ratio
-- ─────────────────────────────────────────────────────────────────────────────
-- Explore's masonry grid and ImageDetailModal size an image's box from its
-- aspect ratio. portfolio_items has stored one since phase 1
-- (portfolio_items.aspect_ratio, stamped at upload from the picked asset's
-- width/height), but service_images never did — so every service photo in the
-- discover feed was mapped with a hardcoded 0.8 placeholder in ExploreScreen.
-- Real ratios in this table run 0.46–1.33, so that placeholder put landscape
-- photos in portrait boxes and let contentFit="cover" crop the difference away.
--
-- APPLIED LIVE 2026-08-18 (migrations add_service_images_aspect_ratio +
-- replace_provider_services_carry_aspect_ratio), including the backfill below.
--
-- Nullable with NO default on purpose: NULL means "not measured yet" and stays
-- distinguishable from a real value, so the client falls back to measuring the
-- file itself (see src/utils/useMeasuredAspectRatios.ts) rather than trusting a
-- fabricated number. A DEFAULT 1.0 (as portfolio_items has) would make
-- un-measured rows indistinguishable from genuinely-square photos.
--
-- Safe to re-run.

ALTER TABLE public.service_images
  ADD COLUMN IF NOT EXISTS aspect_ratio NUMERIC(6,4);

COMMENT ON COLUMN public.service_images.aspect_ratio IS
  'width/height of the image at url. NULL = never measured; the client falls back to measuring the file itself. Written at upload time by replace_provider_services().';

-- A zero/negative ratio would produce a zero-height or inverted card box, and
-- anything outside this range is a bad measurement rather than a real photo.
ALTER TABLE public.service_images
  DROP CONSTRAINT IF EXISTS service_images_aspect_ratio_sane;
ALTER TABLE public.service_images
  ADD CONSTRAINT service_images_aspect_ratio_sane
  CHECK (aspect_ratio IS NULL OR (aspect_ratio > 0 AND aspect_ratio <= 10));

-- ============================================================
-- DONE — add_service_images_aspect_ratio.sql applied.
-- ============================================================

-- ============================================================
-- provider_hair_types_catered.sql — adds the PROVIDER-level
-- "which hair types do you cater to" field.
--
-- Two levels on purpose: providers.hair_types_catered is the broad claim the
-- client Search "Hair Type" filter matches on (one provider-row read, no
-- per-service lookup), while the pre-existing services.hair_types_suitable
-- stays the per-service refinement shown once a client picks a service.
--
-- Empty/NULL = caters to all, matching services.hair_types_suitable, so an
-- untouched value is a valid answer rather than an incomplete profile.
-- Vocabulary is HAIR_TYPES in src/constants/hairTypes.ts — keep in step.
-- See supabase/provider_hair_types_catered.sql for the full rationale.
-- ============================================================

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS hair_types_catered TEXT[];

CREATE INDEX IF NOT EXISTS idx_providers_hair_types_catered
  ON public.providers USING GIN (hair_types_catered);

COMMENT ON COLUMN public.providers.hair_types_catered IS
  'Provider-level hair types this provider caters to (HAIR_TYPES vocabulary). NULL/empty = caters to all. Drives the client Search "Hair Type" filter; services.hair_types_suitable is the per-service refinement.';

-- ============================================================
-- DONE — provider_hair_types_catered.sql applied.
-- ============================================================
