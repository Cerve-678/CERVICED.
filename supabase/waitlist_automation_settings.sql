-- ════════════════════════════════════════════════════════════════════════════
-- waitlist_automation_settings.sql
--
-- WHY THIS FILE EXISTS:
-- ProviderAutomationsScreen has had two waitlist toggles for a while —
-- "Enable waitlist" and "Auto-invite from waitlist" ("When a booking is
-- cancelled, automatically invite and schedule the next person in the
-- queue") — but neither `automation_settings->>'waitlistEnabled'` nor
-- `automation_settings->>'autoAcceptWaitlist'` was ever read anywhere in the
-- DB. invite_next_waitlist_entry() (called from handle_booking_status_change
-- on every cancellation — see booking_cancellation_actor_aware_fix.sql,
-- confirmed live) has always just sent a "tap to book" notification to the
-- top waiting entry, unconditionally, regardless of either toggle. So:
--   - turning "Enable waitlist" off did nothing — invites kept firing.
--   - turning "Auto-invite" on did nothing — it never actually booked anyone;
--     a provider still had to open Booking History → Waitlist and use
--     "Schedule & Invite" by hand every time.
--
-- This file wires both up:
--   1. invite_next_waitlist_entry() now checks waitlistEnabled first (default
--      TRUE when unset, matching the client-side join gate in
--      ProviderProfileScreen.tsx:275 — `automation_settings?.waitlistEnabled
--      !== false` — so this doesn't silently stop notifying providers who
--      never touched the setting but already have real waiting entries).
--   2. When autoAcceptWaitlist is on, it now takes 7 extra params describing
--      the slot that just freed up (passed from NEW.* by the two
--      handle_booking_status_change call sites) and inserts a real 'pending'
--      booking into that exact slot for the top waiter, instead of just
--      notifying. That INSERT fires the existing on_booking_created trigger
--      (handle_new_booking), which already sends both sides their normal
--      new-booking notifications — and instantly confirms it too, if the
--      provider separately has auto-accept-bookings on. Nothing new to
--      notify here; reusing that trigger is the point, not duplicating it.
--   3. That INSERT can legitimately fail — before_booking_enforce_bookability
--      re-checks the provider's notice window, working hours, blocked dates
--      etc., same as any booking, and the freed slot may no longer clear
--      them. It's wrapped in its own BEGIN/EXCEPTION block (an implicit
--      savepoint) specifically so a failure there can never roll back the
--      cancellation that triggered it — it just falls back to a plain
--      notify, same as autoAcceptWaitlist being off.
--
-- Only one live caller (confirmed via information_schema.routines): the two
-- PERFORM sites inside handle_booking_status_change. Safe to change the
-- signature outright rather than keep the old one around as a dead overload.
--
-- Run in the Supabase SQL editor, whole file, top to bottom. Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.invite_next_waitlist_entry(UUID, UUID);

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
) RETURNS VOID AS $$
DECLARE
  w                   RECORD;
  v_waitlist_enabled  BOOLEAN;
  v_auto_accept       BOOLEAN;
  v_booked            BOOLEAN := FALSE;
BEGIN
  SELECT COALESCE((automation_settings->>'waitlistEnabled')::boolean, TRUE),
         COALESCE((automation_settings->>'autoAcceptWaitlist')::boolean, FALSE)
    INTO v_waitlist_enabled, v_auto_accept
    FROM public.providers WHERE id = p_provider_id;

  IF NOT COALESCE(v_waitlist_enabled, TRUE) THEN
    RETURN;
  END IF;

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

  IF v_auto_accept AND p_booking_date IS NOT NULL AND p_booking_time IS NOT NULL THEN
    BEGIN
      INSERT INTO public.bookings (
        user_id, provider_id, service_id, status,
        booking_date, booking_time, end_time,
        payment_type, base_price, add_ons_total, service_charge,
        deposit_amount, amount_paid, remaining_balance, payment_status,
        is_group_booking, group_booking_count,
        provider_name_snapshot, service_name_snapshot, service_category_snapshot,
        customer_name
      ) VALUES (
        w.user_id, p_provider_id, p_service_id, 'pending',
        p_booking_date, p_booking_time, p_end_time,
        'full', COALESCE(p_base_price, 0), COALESCE(p_add_ons_total, 0), COALESCE(p_service_charge, 0),
        0, 0, COALESCE(p_base_price, 0) + COALESCE(p_add_ons_total, 0) + COALESCE(p_service_charge, 0), 'pending',
        FALSE, 1,
        w.provider_name_snapshot, w.service_name_snapshot, p_service_category_snapshot,
        w.user_name_snapshot
      );

      UPDATE public.provider_waitlist
         SET status = 'booked', notified_at = NOW()
       WHERE id = w.id;

      v_booked := TRUE;
    EXCEPTION WHEN OTHERS THEN
      -- Slot didn't actually clear the provider's booking rules (notice
      -- window, working hours, blocked date, etc. all changed since the
      -- original booking was made) — fall through to a plain notify.
      v_booked := FALSE;
    END;
  END IF;

  IF v_booked THEN
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
    p_provider_id,
    'client'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── handle_booking_status_change: same live body, both PERFORM sites now
--    pass the freed slot's details through ──
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

    -- The slot is free again — invite (or auto-book) the next waitlist entry.
    PERFORM public.invite_next_waitlist_entry(
      NEW.provider_id, NEW.service_id,
      NEW.booking_date, NEW.booking_time, NEW.end_time,
      NEW.base_price, NEW.add_ons_total, NEW.service_charge,
      NEW.service_category_snapshot
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

    -- The slot is free again — invite (or auto-book) the next waitlist entry.
    PERFORM public.invite_next_waitlist_entry(
      NEW.provider_id, NEW.service_id,
      NEW.booking_date, NEW.booking_time, NEW.end_time,
      NEW.base_price, NEW.add_ons_total, NEW.service_charge,
      NEW.service_category_snapshot
    );
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

-- DONE — invite_next_waitlist_entry now respects waitlistEnabled and
-- autoAcceptWaitlist; handle_booking_status_change passes the freed slot's
-- details through to it. Nothing else in this function changed.
