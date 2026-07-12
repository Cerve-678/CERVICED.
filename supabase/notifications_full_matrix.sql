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
    'intake_form_received',   -- client got a form to fill in (client_automation_jobs.sql)
    'intake_form_completed',  -- client sent a filled form back (info_packs_bookings.sql)
    'info_pack_received',     -- client got prep/aftercare info (info_packs_bookings.sql)
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
