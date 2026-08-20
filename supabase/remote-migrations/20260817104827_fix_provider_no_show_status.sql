-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260817104827
-- Remote name: fix_provider_no_show_status
-- Do not edit this recovery archive; create a new tracked migration for changes.

-- ALTER 1: bookings_status_check + 'provider_no_show'
ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_status_check CHECK (status = ANY (ARRAY[
    'pending'::text, 'confirmed'::text, 'in_progress'::text,
    'completed'::text, 'cancelled'::text, 'no_show'::text, 'on_hold'::text,
    'provider_no_show'::text
  ]));

-- ALTER 2: notifications_type_check + 'provider_no_show'
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
    'pending_booking_reminder',
    'provider_no_show'
  ));

-- FUNCTION 3: client_mark_provider_no_show
CREATE OR REPLACE FUNCTION public.client_mark_provider_no_show(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_status    text;
  v_booking_date      date;
  v_booking_time      time;
  v_appt_start        timestamp;
  v_active_reschedule boolean;
BEGIN
  SELECT b.status, b.booking_date, b.booking_time
    INTO v_current_status, v_booking_date, v_booking_time
    FROM public.bookings b
   WHERE b.id = p_booking_id
     AND b.user_id = auth.uid()
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_current_status IN ('cancelled', 'completed', 'no_show', 'provider_no_show') THEN
    RAISE EXCEPTION 'Booking is already %, no further status changes allowed', v_current_status;
  END IF;

  IF v_current_status NOT IN ('confirmed', 'in_progress') THEN
    RAISE EXCEPTION 'Cannot mark provider no-show from status %', v_current_status;
  END IF;

  v_appt_start := (v_booking_date + v_booking_time)::timestamp;

  IF v_booking_date <> CURRENT_DATE THEN
    RAISE EXCEPTION 'Provider no-show can only be marked on the day of the appointment';
  END IF;

  IF NOW() < v_appt_start THEN
    RAISE EXCEPTION 'Cannot mark provider no-show before the appointment start time';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.booking_reschedule_requests r
     WHERE r.booking_id = p_booking_id
       AND r.status IN ('pending', 'provider_responded')
  ) INTO v_active_reschedule;
  IF v_active_reschedule THEN
    RAISE EXCEPTION 'Cannot mark provider no-show while a reschedule request is active for this booking';
  END IF;

  UPDATE public.bookings SET status = 'provider_no_show' WHERE id = p_booking_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.client_mark_provider_no_show(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.client_mark_provider_no_show(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.client_mark_provider_no_show(uuid) TO authenticated;

COMMENT ON FUNCTION public.client_mark_provider_no_show(uuid) IS
  'Client-facing reverse of provider_update_booking_status()''s no_show branch — lets a client mark a booking as the PROVIDER not showing up. Same guardrails philosophy (same-day, appointment-start-passed, terminal-state check, no active reschedule request), scoped by user_id = auth.uid(). See fix_provider_no_show_status.sql.';

-- FUNCTION 4: handle_booking_status_change with new provider_no_show branch
CREATE OR REPLACE FUNCTION public.handle_booking_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor              UUID := auth.uid();
  v_provider_user_id   UUID;
  v_representative_id  UUID;
BEGIN

  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    PERFORM public.close_orphaned_reschedule_request(NEW.id);
  END IF;

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
      IF NEW.group_booking_id IS NOT NULL THEN
        SELECT id INTO v_representative_id
          FROM public.bookings
         WHERE group_booking_id = NEW.group_booking_id
           AND user_id = NEW.user_id
           AND provider_id = NEW.provider_id
         ORDER BY booking_date ASC, booking_time ASC, id ASC
         LIMIT 1;

        IF v_representative_id = NEW.id THEN
          INSERT INTO public.notifications
            (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
          VALUES (
            NEW.user_id, 'booking_declined', 'Booking Declined',
            'Unfortunately, ' || NEW.provider_name_snapshot ||
              ' is unable to accept your ' || COALESCE(NEW.group_booking_count, 1)::TEXT ||
              ' requested service(s), starting with ' || NEW.service_name_snapshot ||
              ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || '.',
            'high', FALSE, NEW.id, NEW.provider_id, 'client'
          );
        END IF;
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

  IF NEW.status = 'provider_no_show' AND OLD.status != 'provider_no_show' THEN
    SELECT p.user_id INTO v_provider_user_id
      FROM public.providers p WHERE p.id = NEW.provider_id;

    IF v_provider_user_id IS NOT NULL THEN
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
      VALUES (
        v_provider_user_id, 'provider_no_show', 'Client Reported a Missed Appointment',
        COALESCE(NEW.customer_name, 'A client') || ' marked ' ||
          NEW.service_name_snapshot || ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') ||
          ' at ' || TO_CHAR(NEW.booking_time, 'HH12:MI AM') ||
          ' as a missed appointment — you did not show up.',
        'high', FALSE, NEW.id, NEW.provider_id, 'provider'
      );
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' AND OLD.status != 'pending' AND OLD.status != 'on_hold' THEN
    SELECT p.user_id INTO v_provider_user_id
      FROM public.providers p WHERE p.id = NEW.provider_id;

    IF NEW.group_booking_id IS NOT NULL THEN
      SELECT id INTO v_representative_id
        FROM public.bookings
       WHERE group_booking_id = NEW.group_booking_id
         AND user_id = NEW.user_id
         AND provider_id = NEW.provider_id
       ORDER BY booking_date ASC, booking_time ASC, id ASC
       LIMIT 1;

      IF v_representative_id = NEW.id THEN
        IF v_actor IS NULL OR v_actor != NEW.user_id THEN
          INSERT INTO public.notifications
            (user_id, type, title, message, priority, is_actionable, booking_id, recipient_role)
          VALUES (
            NEW.user_id, 'booking_cancelled', 'Booking Cancelled',
            'Your ' || COALESCE(NEW.group_booking_count, 1)::TEXT || ' service(s) with ' ||
              NEW.provider_name_snapshot || ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') ||
              ' have been cancelled.',
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
              COALESCE(NEW.group_booking_count, 1)::TEXT || ' service(s) on ' ||
              TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || '.',
            'medium', FALSE, NEW.id, NEW.provider_id, 'provider'
          FROM public.providers p WHERE p.id = NEW.provider_id;
        END IF;
      END IF;
    ELSE
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
$function$;
