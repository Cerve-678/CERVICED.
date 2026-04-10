-- ─────────────────────────────────────────────────────────────────────────────
-- PATCH: Add target_role to notifications
-- Run this in Supabase SQL Editor ONCE
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add the column (defaults 'user' so existing rows stay visible on user side)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS target_role TEXT NOT NULL DEFAULT 'user'
  CHECK (target_role IN ('user', 'provider'));

-- 2. Back-fill existing rows: any row where the notification's user_id
--    matches the providers.user_id whose id = notifications.provider_id
--    AND whose title looks like a provider action — mark as 'provider'.
--    This handles: 'New Booking Request', 'Booking Cancelled' (provider copy),
--    'New Review Received', 'reschedule_request'.
UPDATE public.notifications n
SET target_role = 'provider'
WHERE n.type IN ('reschedule_request', 'review_received')
   OR (
     n.type = 'booking_pending'
     AND n.provider_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.providers p
       WHERE p.id = n.provider_id
         AND p.user_id = n.user_id
     )
   )
   OR (
     n.type = 'booking_cancelled'
     AND n.provider_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.providers p
       WHERE p.id = n.provider_id
         AND p.user_id = n.user_id
     )
   );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Replace trigger: handle_new_booking
--    User side  → target_role = 'user'
--    Provider side → target_role = 'provider'
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_booking()
RETURNS TRIGGER AS $$
BEGIN
  -- Notify customer: booking request sent
  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, target_role)
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
    NEW.provider_id,
    'user'
  );

  -- Notify provider: new booking to confirm/decline
  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, target_role)
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
    NEW.provider_id,
    'provider'
  FROM public.providers p
  WHERE p.id = NEW.provider_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_booking_created ON public.bookings;
CREATE TRIGGER on_booking_created
  AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_booking();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Replace trigger: handle_booking_status_change
--    All user-facing inserts → target_role = 'user'
--    Provider-facing insert (cancelled notify) → target_role = 'provider'
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_booking_status_change()
RETURNS TRIGGER AS $$
BEGIN

  -- Provider confirmed → notify customer
  IF NEW.status = 'confirmed' AND OLD.status = 'pending' THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, target_role)
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
      NEW.provider_id,
      'user'
    );
    RETURN NEW;
  END IF;

  -- Provider declined (pending → cancelled) → notify customer
  IF NEW.status = 'cancelled' AND OLD.status = 'pending' THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, target_role)
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
      NEW.provider_id,
      'user'
    );
    RETURN NEW;
  END IF;

  -- Provider started session → notify customer
  IF NEW.status = 'in_progress' AND OLD.status != 'in_progress' THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, target_role)
    VALUES (
      NEW.user_id,
      'booking_in_progress',
      'Your Appointment Has Started',
      NEW.provider_name_snapshot || ' has started your ' ||
        NEW.service_name_snapshot || ' appointment.',
      'high',
      FALSE,
      NEW.id,
      NEW.provider_id,
      'user'
    );
    RETURN NEW;
  END IF;

  -- No-show → notify customer
  IF NEW.status = 'no_show' AND OLD.status != 'no_show' THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, target_role)
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
      NEW.provider_id,
      'user'
    );
    RETURN NEW;
  END IF;

  -- Cancelled after confirmation → notify both sides
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' AND OLD.status != 'pending' THEN
    -- Customer copy
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, target_role)
    VALUES (
      NEW.user_id,
      'booking_cancelled',
      'Booking Cancelled',
      'Your booking with ' || NEW.provider_name_snapshot ||
        ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || ' has been cancelled.',
      'high',
      FALSE,
      NEW.id,
      'user'
    );

    -- Provider copy
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, target_role)
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
      NEW.provider_id,
      'provider'
    FROM public.providers p
    WHERE p.id = NEW.provider_id;

    RETURN NEW;
  END IF;

  -- Completed → ask customer for review
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, target_role)
    VALUES (
      NEW.user_id,
      'review_request',
      'How was your appointment?',
      'Leave a review for ' || NEW.provider_name_snapshot ||
        '. Your feedback helps others find great providers.',
      'medium',
      TRUE,
      NEW.id,
      NEW.provider_id,
      'user'
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Replace trigger: handle_review_received → target_role = 'provider'
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_review_received()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, target_role)
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
    NEW.provider_id,
    'provider'
  FROM public.providers p
  WHERE p.id = NEW.provider_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_review_received ON public.reviews;
CREATE TRIGGER on_review_received
  AFTER INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.handle_review_received();
