-- ════════════════════════════════════════════════════════════════════════════
-- notification_recipient_role.sql
-- Adds a recipient_role column to notifications so provider-facing and
-- client-facing rows can be distinguished even when the same user_id owns
-- both roles.
-- Run AFTER existing migrations. Safe to re-run (uses IF NOT EXISTS / OR REPLACE).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Add column ────────────────────────────────────────────────────────────
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS recipient_role TEXT NOT NULL DEFAULT 'client'
  CHECK (recipient_role IN ('provider', 'client'));

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_role
  ON public.notifications (recipient_role);

-- ── 2. Backfill existing rows ────────────────────────────────────────────────
-- Types that are exclusively provider-facing regardless of context:
UPDATE public.notifications
SET recipient_role = 'provider'
WHERE type IN (
  'review_received',
  'booking_not_started',
  'intake_form_reminder',
  'provider_message',
  'balance_reminder'
);

-- Ambiguous types (booking_pending, booking_reminder, booking_cancelled,
-- reschedule_request): use provider_id match as the signal.
-- If the notification's user_id is the linked provider's user_id then the
-- row was sent to the provider in their business role, not as a client.
UPDATE public.notifications n
SET recipient_role = 'provider'
WHERE n.type IN (
  'booking_pending',
  'booking_reminder',
  'booking_cancelled',
  'reschedule_request',
  'intake_form_completed',
  'balance_collected'
)
  AND n.provider_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.providers p
    WHERE p.id = n.provider_id AND p.user_id = n.user_id
  );

-- ── 3. Redefine trigger functions with recipient_role on every INSERT ─────────

-- handle_new_booking
CREATE OR REPLACE FUNCTION public.handle_new_booking()
RETURNS TRIGGER AS $$
DECLARE
  v_provider_user_id UUID;
  v_auto_accept      BOOLEAN;
BEGIN
  SELECT p.user_id, p.auto_accept_bookings
    INTO v_provider_user_id, v_auto_accept
    FROM public.providers p
   WHERE p.id = NEW.provider_id;

  -- Client: "your request was received"
  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
  VALUES (
    NEW.user_id,
    'booking_pending',
    'Booking Request Sent',
    'Your request with ' || NEW.provider_name_snapshot ||
      ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') ||
      ' at ' || TO_CHAR(NEW.booking_time, 'HH12:MI AM') ||
      ' is awaiting confirmation.',
    'high', TRUE, NEW.id, NEW.provider_id, 'client'
  );

  IF v_auto_accept THEN
    UPDATE public.bookings
       SET status = 'confirmed', confirmed_at = NOW()
     WHERE id = NEW.id;
  ELSE
    -- Provider: "new booking request"
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      v_provider_user_id,
      'booking_pending',
      'New Booking Request',
      COALESCE(NEW.customer_name, 'A client') || ' requested ' ||
        NEW.service_name_snapshot ||
        ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') ||
        '. Please confirm or decline.',
      'high', TRUE, NEW.id, NEW.provider_id, 'provider'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- handle_booking_status_change
CREATE OR REPLACE FUNCTION public.handle_booking_status_change()
RETURNS TRIGGER AS $$
BEGIN

  IF NEW.status = 'confirmed' AND OLD.status = 'pending' THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      NEW.user_id, 'booking_confirmed', 'Booking Confirmed! 🎉',
      NEW.provider_name_snapshot || ' confirmed your booking for ' ||
        NEW.service_name_snapshot ||
        ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') ||
        ' at ' || TO_CHAR(NEW.booking_time, 'HH12:MI AM') || '.',
      'high', TRUE, NEW.id, NEW.provider_id, 'client'
    );
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelled' AND OLD.status = 'pending' THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      NEW.user_id, 'booking_declined', 'Booking Declined',
      'Unfortunately, ' || NEW.provider_name_snapshot ||
        ' is unable to accept your booking for ' ||
        NEW.service_name_snapshot ||
        ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || '.',
      'high', FALSE, NEW.id, NEW.provider_id, 'client'
    );
    RETURN NEW;
  END IF;

  IF NEW.status = 'in_progress' AND OLD.status != 'in_progress' THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      NEW.user_id, 'booking_in_progress', 'Your Appointment Has Started',
      NEW.provider_name_snapshot || ' has started your ' ||
        NEW.service_name_snapshot || ' appointment.',
      'high', FALSE, NEW.id, NEW.provider_id, 'client'
    );
    RETURN NEW;
  END IF;

  IF NEW.status = 'no_show' AND OLD.status != 'no_show' THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      NEW.user_id, 'no_show', 'Missed Appointment',
      'Your appointment with ' || NEW.provider_name_snapshot ||
        ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') ||
        ' was marked as a no-show.',
      'high', FALSE, NEW.id, NEW.provider_id, 'client'
    );
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' AND OLD.status != 'pending' THEN
    -- Client copy
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, recipient_role)
    VALUES (
      NEW.user_id, 'booking_cancelled', 'Booking Cancelled',
      'Your booking with ' || NEW.provider_name_snapshot ||
        ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || ' has been cancelled.',
      'high', FALSE, NEW.id, 'client'
    );
    -- Provider copy
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    SELECT
      p.user_id, 'booking_cancelled', 'Booking Cancelled',
      COALESCE(NEW.customer_name, 'A client') || ' cancelled their ' ||
        NEW.service_name_snapshot ||
        ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || '.',
      'medium', FALSE, NEW.id, NEW.provider_id, 'provider'
    FROM public.providers p WHERE p.id = NEW.provider_id;
    RETURN NEW;
  END IF;

  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    IF COALESCE((
      SELECT (p.automation_settings->>'autoReviewRequest')::BOOLEAN
        FROM public.providers p WHERE p.id = NEW.provider_id
    ), TRUE) THEN
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
      VALUES (
        NEW.user_id, 'review_request', 'How was your appointment?',
        'Leave a review for ' || NEW.provider_name_snapshot ||
          '. Your feedback helps others find great providers.',
        'medium', TRUE, NEW.id, NEW.provider_id, 'client'
      );
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- handle_review_received
CREATE OR REPLACE FUNCTION public.handle_review_received()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
  SELECT
    p.user_id, 'review_received', 'New Review Received ⭐',
    'You received a ' || ROUND(NEW.rating::numeric, 1) || '-star review' ||
      CASE
        WHEN NEW.comment IS NOT NULL AND LENGTH(TRIM(NEW.comment)) > 0
          THEN ': "' || LEFT(NEW.comment, 80) ||
               CASE WHEN LENGTH(NEW.comment) > 80 THEN '…"' ELSE '"' END
        ELSE '.'
      END,
    'medium', TRUE, NEW.booking_id, NEW.provider_id, 'provider'
  FROM public.providers p WHERE p.id = NEW.provider_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- process_provider_24hr_reminders (provider-facing booking_reminder)
CREATE OR REPLACE FUNCTION public.process_provider_24hr_reminders()
RETURNS VOID AS $$
DECLARE
  v_tomorrow DATE := CURRENT_DATE + INTERVAL '1 day';
  r          RECORD;
BEGIN
  FOR r IN
    SELECT b.id AS booking_id, b.booking_time, b.booking_date,
           b.service_name_snapshot, b.customer_name, b.provider_id,
           p.user_id AS provider_user_id
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
    WHERE b.booking_date = v_tomorrow AND b.status = 'confirmed'
      AND p.reminder_notifications_enabled = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.booking_id = b.id AND n.user_id = p.user_id
          AND n.type = 'booking_reminder' AND n.recipient_role = 'provider'
      )
  LOOP
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      r.provider_user_id, 'booking_reminder', 'Appointment Tomorrow',
      COALESCE(r.customer_name, 'A client') || ' has ' ||
        r.service_name_snapshot || ' booked tomorrow at ' ||
        TO_CHAR(r.booking_time, 'HH12:MI AM') || '.',
      'medium', FALSE, r.booking_id, r.provider_id, 'provider'
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- process_user_24hr_reminders (client-facing booking_reminder)
CREATE OR REPLACE FUNCTION public.process_user_24hr_reminders()
RETURNS VOID AS $$
DECLARE
  v_tomorrow DATE := CURRENT_DATE + INTERVAL '1 day';
  r          RECORD;
BEGIN
  FOR r IN
    SELECT b.id AS booking_id, b.user_id, b.booking_time, b.booking_date,
           b.service_name_snapshot, b.provider_name_snapshot, b.provider_id
    FROM public.bookings b
    JOIN public.users u ON u.id = b.user_id
    WHERE b.booking_date = v_tomorrow AND b.status = 'confirmed'
      AND u.reminder_enabled = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.booking_id = b.id AND n.user_id = b.user_id
          AND n.type = 'booking_reminder' AND n.recipient_role = 'client'
      )
  LOOP
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      r.user_id, 'booking_reminder', 'Appointment Tomorrow',
      'Your ' || r.service_name_snapshot ||
        ' with ' || r.provider_name_snapshot ||
        ' is tomorrow at ' || TO_CHAR(r.booking_time, 'HH12:MI AM') ||
        '. Please arrive 10 minutes early.',
      'medium', TRUE, r.booking_id, r.provider_id, 'client'
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- process_pending_booking_warnings (client-facing)
CREATE OR REPLACE FUNCTION public.process_pending_booking_warnings()
RETURNS VOID AS $$
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
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- process_provider_unaccepted_booking_reminders (provider-facing)
CREATE OR REPLACE FUNCTION public.process_provider_unaccepted_booking_reminders()
RETURNS VOID AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT b.id AS booking_id, b.customer_name, b.service_name_snapshot,
           b.booking_date, b.booking_time, b.provider_id,
           p.user_id AS provider_user_id
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
    WHERE b.status = 'pending'
      AND b.created_at < NOW() - INTERVAL '2 hours'
      AND p.reminder_notifications_enabled = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.booking_id = b.id AND n.user_id = p.user_id
          AND n.type = 'booking_pending' AND n.recipient_role = 'provider'
          AND n.created_at > NOW() - INTERVAL '4 hours'
      )
  LOOP
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      r.provider_user_id, 'booking_pending', 'Booking Still Awaiting Your Response',
      COALESCE(r.customer_name, 'A client') || '''s request for ' ||
        r.service_name_snapshot || ' on ' || TO_CHAR(r.booking_date, 'DD Mon YYYY') ||
        ' is still waiting for you to confirm or decline.',
      'high', TRUE, r.booking_id, r.provider_id, 'provider'
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- process_provider_not_started_reminders (provider-facing)
CREATE OR REPLACE FUNCTION public.process_provider_not_started_reminders()
RETURNS VOID AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT b.id AS booking_id, b.customer_name, b.service_name_snapshot,
           b.booking_time, b.provider_id, p.user_id AS provider_user_id
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
    WHERE b.status = 'confirmed'
      AND (b.booking_date::TIMESTAMP + b.booking_time) < NOW() - INTERVAL '15 minutes'
      AND p.reminder_notifications_enabled = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.booking_id = b.id AND n.user_id = p.user_id
          AND n.type = 'booking_not_started'
      )
  LOOP
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      r.provider_user_id, 'booking_not_started', 'Appointment Not Started',
      COALESCE(r.customer_name, 'A client') || '''s ' || r.service_name_snapshot ||
        ' was due to start at ' || TO_CHAR(r.booking_time, 'HH12:MI AM') ||
        '. Mark it as started or update its status.',
      'high', TRUE, r.booking_id, r.provider_id, 'provider'
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- process_provider_intake_form_reminders (provider-facing)
CREATE OR REPLACE FUNCTION public.process_provider_intake_form_reminders()
RETURNS VOID AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT b.id AS booking_id, b.customer_name, b.service_name_snapshot,
           b.booking_date, b.provider_id, p.user_id AS provider_user_id
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
    WHERE b.status = 'confirmed'
      AND (b.booking_date::TIMESTAMP + b.booking_time) BETWEEN NOW() AND NOW() + INTERVAL '48 hours'
      AND p.reminder_notifications_enabled = TRUE
      AND EXISTS (SELECT 1 FROM public.booking_intake_forms f2 WHERE f2.provider_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM public.booking_intake_forms f WHERE f.booking_id = b.id)
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.booking_id = b.id AND n.user_id = p.user_id
          AND n.type = 'intake_form_reminder'
          AND n.created_at > NOW() - INTERVAL '24 hours'
      )
  LOOP
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      r.provider_user_id, 'intake_form_reminder', 'Intake Form Not Sent',
      COALESCE(r.customer_name, 'A client') || '''s ' || r.service_name_snapshot ||
        ' on ' || TO_CHAR(r.booking_date, 'DD Mon YYYY') ||
        ' is coming up and they haven''t received an intake form yet.',
      'medium', TRUE, r.booking_id, r.provider_id, 'provider'
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- process_provider_unread_message_reminders (provider-facing)
CREATE OR REPLACE FUNCTION public.process_provider_unread_message_reminders()
RETURNS VOID AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.id AS conversation_id, c.provider_id,
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
      r.provider_user_id, 'provider_message', 'Unread Message',
      COALESCE(r.client_name, 'A client') || ' is still waiting on a reply from you.',
      'medium', TRUE, r.provider_id,
      jsonb_build_object('conversation_id', r.conversation_id),
      'provider'
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- process_provider_outstanding_balance_reminders (provider-facing)
CREATE OR REPLACE FUNCTION public.process_provider_outstanding_balance_reminders()
RETURNS VOID AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT b.id AS booking_id, b.customer_name, b.service_name_snapshot,
           b.remaining_balance, b.provider_id, p.user_id AS provider_user_id
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
    WHERE b.status = 'completed' AND b.remaining_balance > 0
      AND b.payment_status NOT IN ('fully_paid', 'refunded')
      AND (
        (b.end_time IS NOT NULL AND (b.booking_date::TIMESTAMP + b.end_time) < NOW() - INTERVAL '2 hours')
        OR (b.end_time IS NULL AND (b.booking_date::TIMESTAMP + b.booking_time + INTERVAL '1 hour') < NOW() - INTERVAL '2 hours')
      )
      AND p.reminder_notifications_enabled = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.booking_id = b.id AND n.user_id = p.user_id
          AND n.type = 'balance_reminder'
          AND n.created_at > NOW() - INTERVAL '24 hours'
      )
  LOOP
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      r.provider_user_id, 'balance_reminder', 'Outstanding Balance',
      COALESCE(r.customer_name, 'A client') || ' still owes £' ||
        TRIM(TO_CHAR(r.remaining_balance, 'FM999999990.00')) || ' for ' ||
        r.service_name_snapshot || '.',
      'medium', TRUE, r.booking_id, r.provider_id, 'provider'
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- process_provider_unpaid_deposit_reminders (provider-facing)
CREATE OR REPLACE FUNCTION public.process_provider_unpaid_deposit_reminders()
RETURNS VOID AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT b.id AS booking_id, b.customer_name, b.service_name_snapshot,
           b.booking_date, b.booking_time, b.provider_id,
           p.user_id AS provider_user_id
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
    WHERE b.status = 'confirmed'
      AND b.payment_status = 'pending'
      AND (b.booking_date::TIMESTAMP + b.booking_time) BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
      AND p.reminder_notifications_enabled = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.booking_id = b.id AND n.user_id = p.user_id
          AND n.type = 'balance_reminder'
          AND n.created_at > NOW() - INTERVAL '12 hours'
      )
  LOOP
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      r.provider_user_id, 'balance_reminder', 'Payment Not Collected',
      COALESCE(r.customer_name, 'A client') || '''s ' || r.service_name_snapshot ||
        ' on ' || TO_CHAR(r.booking_date, 'DD Mon YYYY') ||
        ' at ' || TO_CHAR(r.booking_time, 'HH12:MI AM') ||
        ' is coming up with no payment collected yet.',
      'high', TRUE, r.booking_id, r.provider_id, 'provider'
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- process_provider_stale_reschedule_reminders (provider-facing)
CREATE OR REPLACE FUNCTION public.process_provider_stale_reschedule_reminders()
RETURNS VOID AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT rr.id AS reschedule_id, rr.booking_id,
           b.customer_name, b.service_name_snapshot,
           b.provider_id, p.user_id AS provider_user_id
    FROM public.booking_reschedule_requests rr
    JOIN public.bookings b  ON b.id = rr.booking_id
    JOIN public.providers p ON p.id = b.provider_id
    WHERE rr.requested_by = 'user'
      AND rr.status = 'pending'
      AND rr.created_at < NOW() - INTERVAL '4 hours'
      AND p.reminder_notifications_enabled = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.booking_id = rr.booking_id AND n.user_id = p.user_id
          AND n.type = 'reschedule_request'
          AND n.created_at > NOW() - INTERVAL '8 hours'
      )
  LOOP
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      r.provider_user_id, 'reschedule_request', 'Reschedule Request Awaiting Response',
      COALESCE(r.customer_name, 'A client') || ' asked to reschedule ' ||
        r.service_name_snapshot || ' and is waiting on available dates from you.',
      'high', TRUE, r.booking_id, r.provider_id, 'provider'
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
