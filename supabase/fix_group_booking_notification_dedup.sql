-- ============================================================
-- CERVICED — Dedup client-facing "Address Now Available" and
-- "Booking Confirmed" notifications for group bookings.
-- Run this in the Supabase SQL editor, whole file, top to bottom.
-- Safe to re-run.
--
-- PROBLEM: notify_address_released() and handle_booking_status_change()'s
-- booking_confirmed branch both fire strictly per bookings ROW (FOR EACH
-- ROW triggers, one INSERT into notifications per row). Neither is aware
-- of group_booking_id (phase1_schema.sql), which BookingContext.tsx
-- already stamps onto every sibling row of a multi-provider checkout
-- batch (see updateBookingGroupInfo call after checkout). Result: a
-- 4-provider group booking that shares one address and confirms as a
-- unit sends 4 separate "Address Now Available" notifications and 4
-- separate "Booking Confirmed" notifications to the same client, instead
-- of one notification describing the group.
--
-- payment_success is NOT touched here — BookingContext.tsx:1792-1803
-- already sends exactly one payment notification per checkout, summed
-- across every booked item. This file brings the two DB-trigger-owned
-- notifications in line with that same "one per group" shape.
--
-- FIX: both functions now check NEW.group_booking_id. If it's set, the
-- notification only sends from the GROUP'S REPRESENTATIVE ROW — the
-- earliest appointment in the group (booking_date, booking_time, then id
-- to break ties, since id is a random UUID with no useful ordering) — and
-- its message is phrased for the whole group using group_booking_count.
-- Ungrouped bookings (group_booking_id IS NULL, the common single-booking
-- case) are completely unchanged: same condition, same per-row message,
-- zero behavior change.
--
-- Provider-facing notifications (handle_new_booking's "New Booking" /
-- "New Booking Request" to the provider) are deliberately NOT touched —
-- each is a distinct request to a distinct provider, so per-row is
-- correct there; only client-facing notices that describe the SAME
-- address/confirmation event repeated across a client's own group get
-- deduped.
-- ============================================================

-- ── 1. notify_address_released() — group-aware ─────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_address_released(p_booking_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b RECORD;
  v_representative_id UUID;
BEGIN
  SELECT id, user_id, provider_id, service_name_snapshot, provider_name_snapshot,
         booking_date, group_booking_id, group_booking_count
    INTO b
  FROM public.bookings
  WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF b.group_booking_id IS NOT NULL THEN
    -- Only the earliest-appointment sibling in the group sends the
    -- notification; the rest are silently skipped (not an error — this
    -- is expected to be called once per sibling as each one confirms).
    SELECT id INTO v_representative_id
      FROM public.bookings
     WHERE group_booking_id = b.group_booking_id
       AND user_id = b.user_id
     ORDER BY booking_date ASC, booking_time ASC, id ASC
     LIMIT 1;

    IF v_representative_id != b.id THEN
      RETURN;
    END IF;

    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      b.user_id,
      'address_released',
      'Addresses Now Available',
      'Locations for your ' || COALESCE(b.group_booking_count, 1)::TEXT ||
        ' upcoming services, starting with ' || b.service_name_snapshot ||
        ' on ' || TO_CHAR(b.booking_date, 'DD Mon YYYY') ||
        ', have been shared — tap to view.',
      'medium', TRUE, b.id, b.provider_id, 'client'
    )
    ON CONFLICT (booking_id, user_id) WHERE (type = 'address_released') DO NOTHING;

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

REVOKE ALL ON FUNCTION public.notify_address_released(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_address_released(uuid) FROM anon, authenticated;

-- ── 2. handle_booking_status_change() — booking_confirmed branch made
--    group-aware; every other branch (declined, in_progress, no_show,
--    cancelled, completed/review_request) is copied over unchanged. ───────
CREATE OR REPLACE FUNCTION public.handle_booking_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_representative_id UUID;
BEGIN

  -- Provider confirmed: pending → confirmed
  IF NEW.status = 'confirmed' AND OLD.status = 'pending' THEN
    IF NEW.group_booking_id IS NOT NULL THEN
      SELECT id INTO v_representative_id
        FROM public.bookings
       WHERE group_booking_id = NEW.group_booking_id
         AND user_id = NEW.user_id
       ORDER BY booking_date ASC, booking_time ASC, id ASC
       LIMIT 1;

      IF v_representative_id = NEW.id THEN
        INSERT INTO public.notifications
          (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
        VALUES (
          NEW.user_id,
          'booking_confirmed',
          'Booking Confirmed! 🎉',
          COALESCE(NEW.group_booking_count, 1)::TEXT || ' of your services have been confirmed, starting with ' ||
            NEW.service_name_snapshot || ' with ' || NEW.provider_name_snapshot ||
            ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') ||
            ' at ' || TO_CHAR(NEW.booking_time, 'HH12:MI AM') || '.',
          'high',
          TRUE,
          NEW.id,
          NEW.provider_id
        );
      END IF;
      RETURN NEW;
    END IF;

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

-- Trigger definition is unchanged (still FOR EACH ROW — the dedup logic
-- lives inside the function, not the trigger shape) but re-asserted here
-- so this file is a complete, standalone re-run of the notification path.
DROP TRIGGER IF EXISTS on_booking_status_changed ON public.bookings;
CREATE TRIGGER on_booking_status_changed
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.handle_booking_status_change();

-- ── Verification ─────────────────────────────────────────────────────────
-- After applying, a 4-item group checkout that all confirm and all release
-- address should produce exactly 1 'booking_confirmed' row and 1
-- 'address_released' row for that group_booking_id, not 4:
--   select type, count(*) from notifications
--   where booking_id in (select id from bookings where group_booking_id = '<group id>')
--   group by type;
