-- ============================================================
-- RUN_ALL_NOTIFICATION_FIXES.sql   (generated bundle — do not hand-edit)
-- Paste-and-run in the Supabase SQL editor, top to bottom, in one go.
--
-- Order matters: several functions are defined in more than one section,
-- and the LAST definition wins. booking_todo_notification (the combined
-- "To Do" notice) is intentionally last so it overrides the per-form and
-- per-pack notifications.
--
-- Assumes the base schema + earlier migrations are already deployed.
-- Every section is CREATE OR REPLACE / idempotent, so this is safe to re-run.
-- Deploy the Edge Function separately: supabase functions deploy send-push-notification
-- ============================================================


-- ╔══════════════════════════════════════════════════════════
-- ║ STEP 1 / 5 :  notification_recipient_role.sql
-- ╚══════════════════════════════════════════════════════════

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

  IF v_auto_accept THEN
    -- Instant booking: confirm immediately. on_booking_status_changed
    -- (pending → confirmed) sends the client their "Booking Confirmed 🎉".
    -- No client "awaiting confirmation" notice — it would be instantly
    -- contradicted by the confirmation, so it's pure noise.
    UPDATE public.bookings
       SET status = 'confirmed', confirmed_at = NOW()
     WHERE id = NEW.id;

    -- Provider: a booking just landed. Title "You have a new booking";
    -- recipient_role 'provider' → push reads "<Business name> · You have a new booking".
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      v_provider_user_id,
      'booking_confirmed',
      'You have a new booking',
      COALESCE(NEW.customer_name, 'A client') || ' booked ' ||
        NEW.service_name_snapshot ||
        ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') ||
        ' at ' || TO_CHAR(NEW.booking_time, 'HH12:MI AM') || '.',
      'high', FALSE, NEW.id, NEW.provider_id, 'provider'
    );

  ELSE
    -- Manual flow: tell the client their request is awaiting confirmation…
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

    -- …and tell the provider to confirm or decline.
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
      -- Title deliberately differs from the client copy's "Booking Cancelled":
      -- a user who is BOTH a client and a provider receives both rows, and the
      -- push layer sends the title verbatim (send-push-notification/index.ts no
      -- longer prefixes the business name — it clipped long titles). Identical
      -- titles left such a user unable to tell which hat the alert was for.
      p.user_id, 'booking_cancelled', 'Client Cancelled',
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
      -- "Client Appointment Tomorrow", not the client copy's plain "Appointment
      -- Tomorrow" — see the booking_cancelled note above: a dual-hat user gets
      -- both rows, and push sends titles verbatim.
      r.provider_user_id, 'booking_reminder', 'Client Appointment Tomorrow',
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


-- ╔══════════════════════════════════════════════════════════
-- ║ STEP 2 / 5 :  fix_missing_notifications.sql
-- ╚══════════════════════════════════════════════════════════

  -- ════════════════════════════════════════════════════════════════════════════
  -- fix_missing_notifications.sql
  -- Fixes recipient_role on existing triggers that pre-date the column,
  -- adds new_provider notification when a provider goes live,
  -- and adds an RPC for manually attaching an info pack to a booking.
  -- Safe to re-run (CREATE OR REPLACE / IF NOT EXISTS throughout).
  -- ════════════════════════════════════════════════════════════════════════════

  -- ── 1. Fix notify_on_new_chat_message() ──────────────────────────────────────
  -- Was inserting without recipient_role → both sides defaulted to 'client'.
  -- Provider-direction messages (client → provider) were invisible in provider mode.
  CREATE OR REPLACE FUNCTION public.notify_on_new_chat_message()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
  DECLARE
    v_user_id          UUID;
    v_provider_id      UUID;
    v_provider_user_id UUID;
    v_provider_name    TEXT;
    v_recipient        UUID;
    v_sender_name      TEXT;
    v_recipient_role   TEXT;
  BEGIN
    SELECT c.user_id, c.provider_id, p.user_id, p.display_name
      INTO v_user_id, v_provider_id, v_provider_user_id, v_provider_name
      FROM public.provider_conversations c
      JOIN public.providers p ON p.id = c.provider_id
    WHERE c.id = NEW.conversation_id;

    IF v_user_id IS NULL THEN RETURN NEW; END IF;

    IF NEW.sender_type = 'user' THEN
      v_recipient      := v_provider_user_id;
      v_recipient_role := 'provider';
      SELECT COALESCE(u.name, 'A client') INTO v_sender_name
        FROM public.users u WHERE u.id = v_user_id;
    ELSE
      v_recipient      := v_user_id;
      v_recipient_role := 'client';
      v_sender_name    := v_provider_name;
    END IF;

    IF v_recipient IS NULL THEN RETURN NEW; END IF;

    -- Debounce: one notification per conversation partner per 10 minutes
    IF EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id        = v_recipient
        AND n.type           = 'new_message'
        AND n.provider_id    = v_provider_id
        AND n.recipient_role = v_recipient_role
        AND n.is_read        = FALSE
        AND n.created_at     > NOW() - INTERVAL '10 minutes'
    ) THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, provider_id, recipient_role)
    VALUES (
      v_recipient,
      'new_message',
      'New message from ' || COALESCE(v_sender_name, 'your conversation'),
      LEFT(NEW.content, 120) || CASE WHEN LENGTH(NEW.content) > 120 THEN '…' ELSE '' END,
      'medium', TRUE, v_provider_id, v_recipient_role
    );

    RETURN NEW;
  END;
  $$;

  DROP TRIGGER IF EXISTS trg_notify_new_chat_message ON public.provider_messages;
  CREATE TRIGGER trg_notify_new_chat_message
    AFTER INSERT ON public.provider_messages
    FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_chat_message();

  -- ── 2. Fix handle_intake_form_completed() ────────────────────────────────────
  -- Was defaulting recipient_role to 'client' — but this goes to the PROVIDER.
  CREATE OR REPLACE FUNCTION public.handle_intake_form_completed()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
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
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, metadata, recipient_role)
    VALUES (
      v_provider_user,
      'intake_form_completed',
      'Form Completed',
      COALESCE(v_booking.customer_name, 'A client') || ' filled in "' || NEW.title ||
        '" for their ' || COALESCE(v_booking.service_name_snapshot, 'appointment') ||
        COALESCE(' on ' || TO_CHAR(v_booking.booking_date, 'DD Mon'), '') || '.',
      'medium', TRUE, NEW.booking_id, NEW.provider_id,
      jsonb_build_object('form_id', NEW.id),
      'provider'
    );

    RETURN NEW;
  END;
  $$;

  DROP TRIGGER IF EXISTS on_intake_form_completed ON public.booking_intake_forms;
  CREATE TRIGGER on_intake_form_completed
    AFTER UPDATE ON public.booking_intake_forms
    FOR EACH ROW EXECUTE FUNCTION public.handle_intake_form_completed();

  -- ── 3. Fix handle_attach_info_packs() — explicit recipient_role ───────────────
  CREATE OR REPLACE FUNCTION public.handle_attach_info_packs()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
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
      AND (NEW.service_name_snapshot = ANY(ip.service_names) OR cardinality(ip.service_names) = 0)
    ON CONFLICT (booking_id, info_pack_id) DO NOTHING;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
      VALUES (
        NEW.user_id, 'info_pack_received', 'Info From Your Provider',
        COALESCE(v_provider.display_name, 'Your provider') ||
          ' sent you prep & aftercare info for your ' || NEW.service_name_snapshot ||
          ' — open the booking to read it.',
        'medium', TRUE, NEW.id, v_provider.id, 'client'
      );
    END IF;

    RETURN NEW;
  END;
  $$;

  DROP TRIGGER IF EXISTS on_booking_attach_info_packs ON public.bookings;
  CREATE TRIGGER on_booking_attach_info_packs
    AFTER INSERT ON public.bookings
    FOR EACH ROW EXECUTE FUNCTION public.handle_attach_info_packs();

  -- ── 4. Fix handle_new_info_pack() — explicit recipient_role ──────────────────
  CREATE OR REPLACE FUNCTION public.handle_new_info_pack()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
  DECLARE
    v_provider RECORD;
    b          RECORD;
  BEGIN
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
        AND (bk.service_name_snapshot = ANY(NEW.service_names) OR cardinality(NEW.service_names) = 0)
    LOOP
      INSERT INTO public.booking_info_packs
        (booking_id, info_pack_id, provider_id, client_user_id, title, service, content)
      VALUES (b.id, NEW.id, v_provider.id, b.user_id, NEW.title, b.service_name_snapshot, NEW.content)
      ON CONFLICT (booking_id, info_pack_id) DO NOTHING;

      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
      VALUES (
        b.user_id, 'info_pack_received', 'Info From Your Provider',
        COALESCE(v_provider.display_name, 'Your provider') || ' sent you "' || NEW.title ||
          '" for your ' || b.service_name_snapshot || ' — open the booking to read it.',
        'medium', TRUE, b.id, v_provider.id, 'client'
      );
    END LOOP;

    RETURN NEW;
  END;
  $$;

  DROP TRIGGER IF EXISTS on_info_pack_created ON public.info_packs;
  CREATE TRIGGER on_info_pack_created
    AFTER INSERT ON public.info_packs
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_info_pack();

  -- ── 5. new_provider — notify bookmarked clients when provider goes live ───────
  CREATE OR REPLACE FUNCTION public.handle_provider_gone_live()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
  BEGIN
    IF NEW.has_gone_live = TRUE AND (OLD.has_gone_live IS DISTINCT FROM TRUE) THEN
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, provider_id, recipient_role)
      SELECT
        bm.user_id,
        'new_provider',
        COALESCE(NEW.display_name, 'A provider') || ' is now live!',
        'A provider you bookmarked is now accepting bookings. Tap to check their services.',
        'medium', TRUE, NEW.id, 'client'
      FROM public.bookmarks bm
      WHERE bm.provider_id = NEW.id;
    END IF;
    RETURN NEW;
  END;
  $$;

  DROP TRIGGER IF EXISTS trg_provider_gone_live ON public.providers;
  CREATE TRIGGER trg_provider_gone_live
    AFTER UPDATE OF has_gone_live ON public.providers
    FOR EACH ROW EXECUTE FUNCTION public.handle_provider_gone_live();

  -- ── 6. RPC: manually attach an info pack to a specific booking ────────────────
  CREATE OR REPLACE FUNCTION public.attach_info_pack_to_booking(
    p_booking_id   UUID,
    p_info_pack_id UUID
  ) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
  DECLARE
    v_pack    RECORD;
    v_booking RECORD;
    v_provider RECORD;
    v_rows    INT;
  BEGIN
    SELECT * INTO v_pack FROM public.info_packs WHERE id = p_info_pack_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Info pack not found'; END IF;

    SELECT user_id, provider_id, service_name_snapshot
      INTO v_booking FROM public.bookings WHERE id = p_booking_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;

    SELECT id, display_name INTO v_provider
      FROM public.providers WHERE id = v_booking.provider_id;

    INSERT INTO public.booking_info_packs
      (booking_id, info_pack_id, provider_id, client_user_id, title, service, content)
    VALUES
      (p_booking_id, p_info_pack_id, v_provider.id, v_booking.user_id,
      v_pack.title, v_booking.service_name_snapshot, v_pack.content)
    ON CONFLICT (booking_id, info_pack_id) DO NOTHING;

    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF v_rows > 0 THEN
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
      VALUES (
        v_booking.user_id, 'info_pack_received', 'Info From Your Provider',
        COALESCE(v_provider.display_name, 'Your provider') || ' sent you "' || v_pack.title ||
          '" for your ' || v_booking.service_name_snapshot || ' — open the booking to read it.',
        'medium', TRUE, p_booking_id, v_provider.id, 'client'
      );
    END IF;
  END;
  $$;


-- ╔══════════════════════════════════════════════════════════
-- ║ STEP 3 / 5 :  fix_auto_accept_provider_notification.sql
-- ╚══════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- fix_auto_accept_provider_notification.sql
-- handle_new_booking(): notifications on a brand-new booking.
--
--   • Auto-accept ON:
--       - confirm the booking immediately (status-change trigger then sends the
--         client "Booking Confirmed 🎉").
--       - the client gets NO "awaiting confirmation" notice — it would be
--         instantly contradicted by the confirmation, so it's pure noise.
--       - the PROVIDER is told a booking landed: title "You have a new booking"
--         (the push layer prepends the business name via recipient_role='provider',
--         so it reads "<Business> · You have a new booking"), body = client +
--         service + date/time.
--   • Auto-accept OFF (manual):
--       - client gets "Booking Request Sent … awaiting confirmation".
--       - provider gets "New Booking Request … confirm or decline".
-- ════════════════════════════════════════════════════════════════════════════

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

  IF v_auto_accept THEN
    -- Instant booking: confirm immediately. on_booking_status_changed
    -- (pending → confirmed) sends the client their "Booking Confirmed 🎉".
    UPDATE public.bookings
       SET status = 'confirmed', confirmed_at = NOW()
     WHERE id = NEW.id;

    -- Provider: a booking just landed (informational — nothing to confirm).
    -- Title "You have a new booking"; recipient_role='provider' makes the push
    -- layer render it as "<Business name> · You have a new booking".
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      v_provider_user_id,
      'booking_confirmed',
      'You have a new booking',
      COALESCE(NEW.customer_name, 'A client') || ' booked ' ||
        NEW.service_name_snapshot ||
        ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') ||
        ' at ' || TO_CHAR(NEW.booking_time, 'HH12:MI AM') || '.',
      'high', FALSE, NEW.id, NEW.provider_id, 'provider'
    );

  ELSE
    -- Manual flow: tell the client their request is awaiting confirmation…
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

    -- …and tell the provider to confirm or decline.
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


-- ╔══════════════════════════════════════════════════════════
-- ║ STEP 4 / 5 :  fix_address_release_on_confirm.sql
-- ╚══════════════════════════════════════════════════════════

-- Fix: address auto-release on confirmation never fired
-- ─────────────────────────────────────────────────────────────────────────────
-- The auto_release_address() trigger guarded on NEW.status = 'upcoming', but the
-- bookings table only ever stores 'confirmed' (the app's 'upcoming' is a
-- display-only alias that maps to 'confirmed' on write). As a result
-- address_released_at was never set on confirmation, so clients with an
-- 'on_confirmation' provider never saw the address even though the provider UI
-- reported it as sent.
--
-- This migration (1) redefines the trigger to fire on the real 'confirmed'
-- transition, and (2) backfills bookings that were already confirmed while the
-- trigger was broken. Safe to run multiple times.

-- 1. Redefine the trigger function ────────────────────────────────────────────
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

-- 2. Backfill already-confirmed bookings that never got released ───────────────
UPDATE public.bookings b
SET address_released_at = COALESCE(b.confirmed_at, b.updated_at, NOW())
FROM public.providers p
WHERE b.provider_id = p.id
  AND p.address_release_policy = 'on_confirmation'
  AND b.address_released_at IS NULL
  AND b.status IN ('confirmed', 'in_progress', 'completed');


-- ╔══════════════════════════════════════════════════════════
-- ║ STEP 5 / 5 :  booking_todo_notification.sql
-- ╚══════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- booking_todo_notification.sql
-- Collapse the two separate "you have stuff to do" client notifications fired at
-- booking creation — intake form (handle_auto_send_intake_form → intake_form_received)
-- and info packs (handle_attach_info_packs → info_pack_received) — into ONE
-- "To Do" notification, so a new booking doesn't spam the client.
--
--   • Both attach functions keep attaching form/packs, but no longer notify.
--   • A new last-firing trigger (on_booking_todo_notify) checks whether the
--     booking ended up with a form and/or info pack and emits a single "To Do".
--
-- Trigger order: Postgres fires AFTER-INSERT row triggers alphabetically by name.
-- 'on_booking_todo_notify' sorts after 'on_booking_attach_info_packs' and
-- 'on_booking_auto_send_intake', so by the time it runs the rows exist.
--
-- Run AFTER: client_automation_jobs.sql, info_packs_bookings.sql,
-- fix_missing_notifications.sql (this file's CREATE OR REPLACE must win). Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. handle_auto_send_intake_form — attach only, no per-form notification ───
CREATE OR REPLACE FUNCTION public.handle_auto_send_intake_form()
RETURNS TRIGGER AS $$
DECLARE
  v_provider RECORD;
  v_form     RECORD;
BEGIN
  SELECT id, display_name INTO v_provider
    FROM public.providers WHERE id = NEW.provider_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT * INTO v_form
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

  -- Per-form 'intake_form_received' notice removed — folded into the single
  -- "To Do" notification emitted by handle_booking_todo_notification().
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 2. handle_attach_info_packs — attach only, no per-pack notification ───────
CREATE OR REPLACE FUNCTION public.handle_attach_info_packs()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_provider RECORD;
BEGIN
  SELECT id, user_id, display_name INTO v_provider
    FROM public.providers WHERE id = NEW.provider_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  INSERT INTO public.booking_info_packs
    (booking_id, info_pack_id, provider_id, client_user_id, title, service, content)
  SELECT NEW.id, ip.id, v_provider.id, NEW.user_id, ip.title, NEW.service_name_snapshot, ip.content
    FROM public.info_packs ip
   WHERE ip.provider_id IN (v_provider.id, v_provider.user_id)
     AND (NEW.service_name_snapshot = ANY(ip.service_names) OR cardinality(ip.service_names) = 0)
  ON CONFLICT (booking_id, info_pack_id) DO NOTHING;

  -- Per-pack 'info_pack_received' notice removed — folded into the single
  -- "To Do" notification emitted by handle_booking_todo_notification().
  RETURN NEW;
END;
$$;

-- ── 3. The single combined "To Do" notification ──────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_booking_todo_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_has_form  BOOLEAN;
  v_has_packs BOOLEAN;
  v_type      TEXT;
  v_msg       TEXT;
BEGIN
  v_has_form  := EXISTS (SELECT 1 FROM public.booking_intake_forms WHERE booking_id = NEW.id);
  v_has_packs := EXISTS (SELECT 1 FROM public.booking_info_packs   WHERE booking_id = NEW.id);

  IF NOT v_has_form AND NOT v_has_packs THEN
    RETURN NEW;  -- nothing to do
  END IF;

  IF v_has_form AND v_has_packs THEN
    v_msg := 'You have a form to fill in and an info pack to read for your ' ||
             NEW.service_name_snapshot || ' booking.';
  ELSIF v_has_form THEN
    v_msg := 'You have a form to fill in for your ' ||
             NEW.service_name_snapshot || ' booking.';
  ELSE
    v_msg := 'You have an info pack to read for your ' ||
             NEW.service_name_snapshot || ' booking.';
  END IF;

  -- Type drives deep-linking (both are BOOKING_TYPES in notificationTapHandler →
  -- the client opens the booking, whose TO DO section shows the form/packs).
  v_type := CASE WHEN v_has_form THEN 'intake_form_received' ELSE 'info_pack_received' END;

  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
  VALUES (
    NEW.user_id, v_type, 'To Do', v_msg,
    CASE WHEN v_has_form THEN 'high' ELSE 'medium' END,
    TRUE, NEW.id, NEW.provider_id, 'client'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Name sorts AFTER on_booking_attach_info_packs / on_booking_auto_send_intake,
-- so the form + packs are already attached when this runs.
DROP TRIGGER IF EXISTS on_booking_todo_notify ON public.bookings;
CREATE TRIGGER on_booking_todo_notify
  AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.handle_booking_todo_notification();

