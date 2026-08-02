-- ════════════════════════════════════════════════════════════════════════════
-- booking_cancellation_actor_aware_fix.sql
--
-- WHY THIS FILE EXISTS:
-- booking_flow_fixes.sql (2026-07-18) added two things to
-- handle_booking_status_change(): actor-aware cancellation wording (auth.uid()
-- tells us whether the client withdrew their own request or the provider
-- declined/cancelled it) and a call to invite_next_waitlist_entry() on every
-- transition into 'cancelled'. notification_recipient_role.sql (2026-07-29)
-- redefined the SAME function to add the recipient_role column, but its
-- version was copied from an older baseline that predates both of those
-- fixes — so applying it after booking_flow_fixes.sql silently reverted them.
--
-- Confirmed live via `select pg_get_functiondef('public.handle_booking_status_change'::regproc)`
-- on 2026-07-30: the deployed function has recipient_role (keep it — correct)
-- but neither actor-awareness nor the waitlist invite call (regression).
--
-- This file takes the CURRENTLY LIVE function as its base (so recipient_role
-- and the autoReviewRequest guard are preserved) and restores only the two
-- missing pieces. handle_new_booking needed no changes — the live version
-- already matches the later fix_auto_accept_provider_notification.sql and is
-- correct.
--
-- Safe to re-run (CREATE OR REPLACE throughout).
-- ════════════════════════════════════════════════════════════════════════════

-- ── Re-assert invite_next_waitlist_entry exists (unchanged from booking_flow_fixes.sql) ──
CREATE OR REPLACE FUNCTION public.invite_next_waitlist_entry(
  p_provider_id UUID,
  p_service_id  UUID
) RETURNS VOID AS $$
DECLARE
  w RECORD;
BEGIN
  SELECT *
    INTO w
    FROM public.provider_waitlist
   WHERE provider_id = p_provider_id
     AND status = 'waiting'
     AND (service_id = p_service_id OR service_id IS NULL)
   ORDER BY (service_id IS NOT NULL AND service_id = p_service_id) DESC,
            position ASC
   LIMIT 1;

  IF w.id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.provider_waitlist
     SET status = 'notified',
         notified_at = NOW()
   WHERE id = w.id;

  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, provider_id, recipient_role)
  VALUES (
    w.user_id,
    'waitlist_slot_available',
    'A slot opened up!',
    w.service_name_snapshot || ' with ' || w.provider_name_snapshot || ' — tap to book.',
    'high',
    TRUE,
    w.provider_id,
    'client'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── handle_booking_status_change: live version + actor-awareness + waitlist invite ──
CREATE OR REPLACE FUNCTION public.handle_booking_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_actor            UUID := auth.uid();  -- NULL when cron / service role
  v_provider_user_id UUID;
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

  -- Pending booking cancelled: provider declined OR client withdrew.
  IF NEW.status = 'cancelled' AND OLD.status = 'pending' THEN
    IF v_actor IS NOT NULL AND v_actor = NEW.user_id THEN
      -- Client withdrew their own request → tell the provider, not the client.
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
      SELECT
        p.user_id, 'booking_cancelled', 'Booking Request Withdrawn',
        COALESCE(NEW.customer_name, 'A client') || ' withdrew their request for ' ||
          NEW.service_name_snapshot ||
          ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || '.',
        'medium', FALSE, NEW.id, NEW.provider_id, 'provider'
      FROM public.providers p WHERE p.id = NEW.provider_id;
    ELSE
      -- Provider (or system/cron auto-expire) declined → tell the client.
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
    END IF;

    -- The slot is free again — invite the next waitlist entry.
    PERFORM public.invite_next_waitlist_entry(NEW.provider_id, NEW.service_id);
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

  -- Cancelled after confirmation. Notify both sides EXCEPT whoever performed
  -- the cancellation (they already know).
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' AND OLD.status != 'pending' THEN
    SELECT p.user_id INTO v_provider_user_id
      FROM public.providers p WHERE p.id = NEW.provider_id;

    IF v_actor IS NULL OR v_actor != NEW.user_id THEN
      -- Client copy
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, recipient_role)
      VALUES (
        NEW.user_id, 'booking_cancelled', 'Booking Cancelled',
        'Your booking with ' || NEW.provider_name_snapshot ||
          ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || ' has been cancelled.',
        'high', FALSE, NEW.id, 'client'
      );
    END IF;

    IF v_provider_user_id IS NOT NULL
       AND (v_actor IS NULL OR v_actor != v_provider_user_id) THEN
      -- Provider copy
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
      SELECT
        -- Title deliberately differs from the client copy's "Booking Cancelled":
        -- a user who is BOTH a client and a provider receives both rows, and the
        -- push layer sends the title verbatim (send-push-notification/index.ts
        -- does not prefix the business name — it clipped long titles). Identical
        -- titles left such a user unable to tell which hat the alert was for.
        p.user_id, 'booking_cancelled', 'Client Cancelled',
        COALESCE(NEW.customer_name, 'A client') || ' cancelled their ' ||
          NEW.service_name_snapshot ||
          ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || '.',
        'medium', FALSE, NEW.id, NEW.provider_id, 'provider'
      FROM public.providers p WHERE p.id = NEW.provider_id;
    END IF;

    -- The slot is free again — invite the next waitlist entry.
    PERFORM public.invite_next_waitlist_entry(NEW.provider_id, NEW.service_id);
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

-- DONE — recipient_role preserved, actor-aware cancellation wording and
-- waitlist invites restored. handle_new_booking is untouched (already correct).
