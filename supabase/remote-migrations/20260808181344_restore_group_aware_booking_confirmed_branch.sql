-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260808181344
-- Remote name: restore_group_aware_booking_confirmed_branch
-- Do not edit this recovery archive; create a new tracked migration for changes.

-- Re-merges the group_booking_id-aware booking_confirmed branch (from
-- fix_group_booking_notification_dedup.sql, deployed 2026-08-08) back into
-- handle_booking_status_change() after fix_reschedule_flow_completion.sql's
-- deploy silently overwrote it with an older baseline that predates that
-- fix. This is exactly the "two CREATE OR REPLACE of the same function,
-- second one wins" trap both files' own headers warned about. Body is
-- otherwise identical to what's live now (orphan-close, actor-aware cancel
-- branches, recipient_role) — only the booking_confirmed branch changes.
CREATE OR REPLACE FUNCTION public.handle_booking_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_actor              UUID := auth.uid();
  v_provider_user_id   UUID;
  v_representative_id  UUID;
BEGIN

  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    PERFORM public.close_orphaned_reschedule_request(NEW.id);
  END IF;

  -- Provider confirmed: pending → confirmed. Group-aware: only the
  -- earliest-appointment sibling in a group_booking_id group sends, phrased
  -- for the whole group. Ungrouped bookings unchanged.
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
          (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
        VALUES (
          NEW.user_id,
          'booking_confirmed',
          'Booking Confirmed! 🎉',
          COALESCE(NEW.group_booking_count, 1)::TEXT || ' of your services have been confirmed, starting with ' ||
            NEW.service_name_snapshot || ' with ' || NEW.provider_name_snapshot ||
            ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') ||
            ' at ' || TO_CHAR(NEW.booking_time, 'HH12:MI AM') || '.',
          'high', TRUE, NEW.id, NEW.provider_id, 'client'
        );
      END IF;
      RETURN NEW;
    END IF;

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
    IF v_actor IS NOT NULL AND v_actor = NEW.user_id THEN
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

  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' AND OLD.status != 'pending' THEN
    SELECT p.user_id INTO v_provider_user_id
      FROM public.providers p WHERE p.id = NEW.provider_id;

    IF v_actor IS NULL OR v_actor != NEW.user_id THEN
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
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
      SELECT
        p.user_id, 'booking_cancelled', 'Client Cancelled',
        COALESCE(NEW.customer_name, 'A client') || ' cancelled their ' ||
          NEW.service_name_snapshot ||
          ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || '.',
        'medium', FALSE, NEW.id, NEW.provider_id, 'provider'
      FROM public.providers p WHERE p.id = NEW.provider_id;
    END IF;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS on_booking_status_changed ON public.bookings;
CREATE TRIGGER on_booking_status_changed
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.handle_booking_status_change();

REVOKE ALL ON FUNCTION public.handle_booking_status_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_booking_status_change() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_booking_status_change() FROM authenticated;
