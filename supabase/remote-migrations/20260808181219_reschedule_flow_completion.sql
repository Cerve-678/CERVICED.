-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260808181219
-- Remote name: reschedule_flow_completion
-- Do not edit this recovery archive; create a new tracked migration for changes.

-- ============================================================
-- CERVICED — Complete the reschedule request/respond/confirm/decline loop
-- Deployed 2026-08-08. Source: supabase/fix_reschedule_flow_completion.sql
-- ============================================================

-- ── PART 1: widen the status CHECK constraint ──
ALTER TABLE public.booking_reschedule_requests
  DROP CONSTRAINT IF EXISTS booking_reschedule_requests_status_check;

ALTER TABLE public.booking_reschedule_requests
  ADD CONSTRAINT booking_reschedule_requests_status_check
  CHECK (status IN (
    'pending', 'provider_responded', 'confirmed', 'rejected', 'cancelled'
  ));

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'booking_pending','booking_confirmed','booking_declined','booking_cancelled',
    'booking_reminder','booking_in_progress','booking_not_started','no_show',
    'payment_success','new_provider',
    'reschedule_request','reschedule_provider_response','reschedule_confirmed',
    'reschedule_declined',
    'review_request','review_received','promotion',
    'intake_form_reminder','intake_form_received','intake_form_completed',
    'info_pack_received','provider_message','announcement','balance_reminder',
    'waitlist_slot_available','new_message','address_released','birthday_greeting',
    'post_appt_check_in','rebooking_nudge','daily_recap','schedule_fully_booked'
  ));

-- ── PART 2: close-on-cancellation helper ──
CREATE OR REPLACE FUNCTION public.close_orphaned_reschedule_request(
  p_booking_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.booking_reschedule_requests
     SET status = 'cancelled',
         updated_at = NOW()
   WHERE booking_id = p_booking_id
     AND status IN ('pending', 'provider_responded');
END;
$$;

REVOKE ALL ON FUNCTION public.close_orphaned_reschedule_request(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.close_orphaned_reschedule_request(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.close_orphaned_reschedule_request(uuid) FROM authenticated;

-- ── PART 3: re-apply handle_booking_status_change() with the
--    close-orphaned-request addition ──
CREATE OR REPLACE FUNCTION public.handle_booking_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_actor            UUID := auth.uid();
  v_provider_user_id UUID;
BEGIN

  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    PERFORM public.close_orphaned_reschedule_request(NEW.id);
  END IF;

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

UPDATE public.booking_reschedule_requests r
   SET status = 'cancelled', updated_at = NOW()
  FROM public.bookings b
 WHERE b.id = r.booking_id
   AND b.status = 'cancelled'
   AND r.status IN ('pending', 'provider_responded');

-- ── PART 4: decline RPCs ──
CREATE OR REPLACE FUNCTION public.reject_reschedule_request(
  p_booking_id UUID,
  p_response_note TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_found BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.booking_reschedule_requests r
    JOIN public.bookings b ON b.id = r.booking_id
    JOIN public.providers p ON p.id = b.provider_id
    WHERE r.booking_id = p_booking_id
      AND p.user_id = auth.uid()
      AND r.status = 'pending'
    FOR UPDATE OF r
  ) INTO v_found;

  IF NOT v_found THEN
    RAISE EXCEPTION 'No pending reschedule request found for this booking';
  END IF;

  UPDATE public.booking_reschedule_requests
     SET status = 'rejected',
         response_note = p_response_note,
         updated_at = NOW()
   WHERE booking_id = p_booking_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_reschedule_offer(
  p_booking_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_found BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.booking_reschedule_requests r
    JOIN public.bookings b ON b.id = r.booking_id
    WHERE r.booking_id = p_booking_id
      AND b.user_id = auth.uid()
      AND r.status = 'provider_responded'
    FOR UPDATE OF r
  ) INTO v_found;

  IF NOT v_found THEN
    RAISE EXCEPTION 'No provider-responded reschedule request found for this booking';
  END IF;

  UPDATE public.booking_reschedule_requests
     SET status = 'rejected',
         updated_at = NOW()
   WHERE booking_id = p_booking_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_reschedule_request(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_reschedule_request(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.reject_reschedule_request(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.decline_reschedule_offer(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decline_reschedule_offer(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.decline_reschedule_offer(uuid) TO authenticated;

ALTER TABLE public.booking_reschedule_requests
  ADD COLUMN IF NOT EXISTS response_note TEXT;

CREATE OR REPLACE FUNCTION public.respond_to_reschedule_request(
  p_booking_id UUID,
  p_available_slots JSONB,
  p_response_note TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_found BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.booking_reschedule_requests r
    JOIN public.bookings b ON b.id = r.booking_id
    JOIN public.providers p ON p.id = b.provider_id
    WHERE r.booking_id = p_booking_id
      AND p.user_id = auth.uid()
      AND r.status = 'pending'
    FOR UPDATE OF r
  ) INTO v_found;

  IF NOT v_found THEN
    RAISE EXCEPTION 'No pending reschedule request found for this booking';
  END IF;

  UPDATE public.booking_reschedule_requests
     SET provider_available_slots = p_available_slots,
         status = 'provider_responded',
         response_note = p_response_note,
         updated_at = NOW()
   WHERE booking_id = p_booking_id;
END;
$$;

REVOKE ALL ON FUNCTION public.respond_to_reschedule_request(uuid, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.respond_to_reschedule_request(uuid, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.respond_to_reschedule_request(uuid, jsonb, text) TO authenticated;

DROP FUNCTION IF EXISTS public.respond_to_reschedule_request(uuid, jsonb);

-- ── PART 5: trigger-owned reschedule notifications ──
CREATE OR REPLACE FUNCTION public.handle_reschedule_request_change()
RETURNS TRIGGER AS $$
DECLARE
  v_actor            UUID := auth.uid();
  v_booking          RECORD;
  v_provider_user_id UUID;
BEGIN
  SELECT b.user_id, b.provider_id, b.customer_name,
         b.provider_name_snapshot, b.service_name_snapshot
    INTO v_booking
    FROM public.bookings b
   WHERE b.id = NEW.booking_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT p.user_id INTO v_provider_user_id
    FROM public.providers p WHERE p.id = v_booking.provider_id;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'pending' THEN
      IF v_provider_user_id IS NOT NULL THEN
        INSERT INTO public.notifications
          (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
        VALUES (
          v_provider_user_id, 'reschedule_request', 'Reschedule Request',
          COALESCE(v_booking.customer_name, 'A client') || ' wants to reschedule their ' ||
            v_booking.service_name_snapshot || ' appointment.',
          'high', TRUE, NEW.id, v_booking.provider_id, 'provider'
        );
      END IF;
    ELSIF NEW.status = 'provider_responded' THEN
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
      VALUES (
        v_booking.user_id, 'reschedule_request', v_booking.provider_name_snapshot || ' needs to reschedule',
        v_booking.provider_name_snapshot || ' has proposed new times for your ' ||
          v_booking.service_name_snapshot || ' appointment.',
        'high', TRUE, NEW.id, v_booking.provider_id, 'client'
      );
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN

    IF NEW.status = 'pending' THEN
      IF v_provider_user_id IS NOT NULL THEN
        INSERT INTO public.notifications
          (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
        VALUES (
          v_provider_user_id, 'reschedule_request', 'Reschedule Request',
          COALESCE(v_booking.customer_name, 'A client') || ' wants to reschedule their ' ||
            v_booking.service_name_snapshot || ' appointment.',
          'high', TRUE, NEW.id, v_booking.provider_id, 'provider'
        );
      END IF;

    ELSIF NEW.status = 'provider_responded' THEN
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
      VALUES (
        v_booking.user_id, 'reschedule_provider_response',
        CASE WHEN NEW.response_note IS NOT NULL
          THEN v_booking.provider_name_snapshot || ' can''t make those dates'
          ELSE 'Provider Responded' END,
        COALESCE(NEW.response_note,
          v_booking.provider_name_snapshot || ' has shared available dates for your reschedule request.'),
        'high', TRUE, NEW.id, v_booking.provider_id, 'client'
      );

    ELSIF NEW.status = 'confirmed' THEN
      IF v_provider_user_id IS NOT NULL THEN
        INSERT INTO public.notifications
          (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
        VALUES (
          v_provider_user_id, 'reschedule_confirmed', 'Reschedule Confirmed',
          COALESCE(v_booking.customer_name, 'A client') || ' confirmed the new time for their ' ||
            v_booking.service_name_snapshot || ' appointment.',
          'medium', FALSE, NEW.id, v_booking.provider_id, 'provider'
        );
      END IF;

    ELSIF NEW.status = 'rejected' THEN
      IF v_actor IS NOT NULL AND v_actor = v_provider_user_id THEN
        INSERT INTO public.notifications
          (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
        VALUES (
          v_booking.user_id, 'reschedule_declined', 'Reschedule Declined',
          COALESCE(NEW.response_note,
            v_booking.provider_name_snapshot || ' was unable to accommodate your reschedule request. Your original appointment time stands.'),
          'high', FALSE, NEW.id, v_booking.provider_id, 'client'
        );
      ELSE
        IF v_provider_user_id IS NOT NULL THEN
          INSERT INTO public.notifications
            (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
          VALUES (
            v_provider_user_id, 'reschedule_declined', 'Reschedule Times Declined',
            COALESCE(v_booking.customer_name, 'A client') || ' declined the offered times for their ' ||
              v_booking.service_name_snapshot || ' appointment. Their original appointment time stands.',
            'medium', FALSE, NEW.id, v_booking.provider_id, 'provider'
          );
        END IF;
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS on_reschedule_request_changed ON public.booking_reschedule_requests;
CREATE TRIGGER on_reschedule_request_changed
  AFTER INSERT OR UPDATE OF status ON public.booking_reschedule_requests
  FOR EACH ROW EXECUTE FUNCTION public.handle_reschedule_request_change();

REVOKE ALL ON FUNCTION public.handle_reschedule_request_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_reschedule_request_change() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_reschedule_request_change() FROM authenticated;

-- ── PART 6: requested_dates TEXT[]/DATE[] type mismatch fix ──
CREATE OR REPLACE FUNCTION public.request_reschedule_own_booking(
  p_booking_id UUID,
  p_preferred_dates TEXT[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking RECORD;
  v_policies JSONB;
  v_max_raw TEXT;
  v_max INT;
  v_notice_raw TEXT;
  v_notice_hrs INT;
  v_hours_until NUMERIC;
  v_hours_since_last NUMERIC;
  v_active_request BOOLEAN;
  v_dates DATE[] := ARRAY[]::DATE[];
  v_times TEXT[] := ARRAY[]::TEXT[];
  v_raw TEXT;
BEGIN
  SELECT b.status, b.booking_date, b.booking_time, b.provider_id,
         b.reschedule_count, b.last_rescheduled_at
    INTO v_booking
    FROM public.bookings b
   WHERE b.id = p_booking_id
     AND b.user_id = auth.uid()
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_booking.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Only confirmed bookings can be rescheduled';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.booking_reschedule_requests
     WHERE booking_id = p_booking_id AND status IN ('pending', 'provider_responded')
  ) INTO v_active_request;

  IF v_active_request THEN
    RAISE EXCEPTION 'A reschedule request is already in progress for this booking';
  END IF;

  IF v_booking.last_rescheduled_at IS NOT NULL THEN
    v_hours_since_last := EXTRACT(EPOCH FROM (NOW() - v_booking.last_rescheduled_at)) / 3600;
    IF v_hours_since_last < 24 THEN
      RAISE EXCEPTION 'You can reschedule again in % hours', CEIL(24 - v_hours_since_last);
    END IF;
  END IF;

  SELECT booking_policies INTO v_policies
    FROM public.providers WHERE id = v_booking.provider_id;

  v_max_raw := v_policies->>'maxReschedules';
  IF v_max_raw IS DISTINCT FROM 'unlimited' THEN
    v_max := COALESCE(NULLIF(v_max_raw, '')::INT, 1);
    IF v_booking.reschedule_count >= v_max THEN
      RAISE EXCEPTION 'This provider allows a maximum of % reschedule(s) per booking', v_max;
    END IF;
  END IF;

  v_notice_raw := v_policies->>'rescheduleNotice';
  v_notice_hrs := CASE v_notice_raw
    WHEN 'same_day' THEN 0
    WHEN '48h' THEN 48
    WHEN '72h' THEN 72
    ELSE 24
  END;

  IF v_notice_hrs > 0 THEN
    v_hours_until := EXTRACT(EPOCH FROM (
      (v_booking.booking_date + v_booking.booking_time)::timestamp - NOW()
    )) / 3600;
    IF v_hours_until < v_notice_hrs THEN
      RAISE EXCEPTION 'This provider requires % hours notice to reschedule', v_notice_hrs;
    END IF;
  END IF;

  FOREACH v_raw IN ARRAY p_preferred_dates LOOP
    v_dates := v_dates || (split_part(v_raw, ' ', 1))::DATE;
    v_times := v_times || NULLIF(split_part(v_raw, ' ', 2), '');
  END LOOP;

  INSERT INTO public.booking_reschedule_requests
    (booking_id, requested_by, original_date, original_time, requested_dates,
     requested_times, provider_available_slots, status, reschedule_count, updated_at)
  VALUES
    (p_booking_id, 'user', v_booking.booking_date, v_booking.booking_time,
     v_dates, v_times, NULL, 'pending', 0, NOW())
  ON CONFLICT (booking_id) DO UPDATE
    SET requested_by = 'user',
        requested_dates = v_dates,
        requested_times = v_times,
        provider_available_slots = NULL,
        status = 'pending',
        updated_at = NOW();
END;
$$;

REVOKE ALL ON FUNCTION public.request_reschedule_own_booking(uuid, text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.request_reschedule_own_booking(uuid, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.request_reschedule_own_booking(uuid, text[]) TO authenticated;

ALTER TABLE public.booking_reschedule_requests
  ADD COLUMN IF NOT EXISTS requested_times TEXT[];
