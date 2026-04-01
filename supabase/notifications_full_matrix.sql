-- ============================================================
-- FULL NOTIFICATION MATRIX
-- Run this in the Supabase SQL editor.
-- ============================================================

-- ───────────────────────────────────────────────────────────
-- 1. Expand the notifications.type CHECK constraint
-- ───────────────────────────────────────────────────────────
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'booking_pending',        -- new booking awaiting provider confirmation
    'booking_confirmed',      -- provider confirmed the booking
    'booking_declined',       -- provider declined the booking
    'booking_cancelled',      -- booking cancelled (after confirmation)
    'booking_reminder',       -- upcoming appointment reminder
    'booking_in_progress',    -- provider started the session
    'no_show',                -- provider marked client as no-show
    'payment_success',        -- payment processed
    'new_provider',           -- new provider joined
    'reschedule_request',     -- user requested a reschedule
    'reschedule_response',    -- provider responded with available dates
    'reschedule_confirmed',   -- user confirmed a new date/time
    'review_request',         -- prompt user to leave a review
    'review_received',        -- provider received a new review
    'promotion'               -- promotional offer
  ));

-- ───────────────────────────────────────────────────────────
-- 2. handle_new_booking — fires on INSERT
--    New bookings are PENDING, so we tell both sides accordingly
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_booking()
RETURNS TRIGGER AS $$
BEGIN
  -- Notify user: request sent, awaiting confirmation
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

  -- Notify provider: new booking request
  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
  SELECT
    p.user_id,
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
  FROM public.providers p
  WHERE p.id = NEW.provider_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_booking_created ON public.bookings;
CREATE TRIGGER on_booking_created
  AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_booking();

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
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
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
