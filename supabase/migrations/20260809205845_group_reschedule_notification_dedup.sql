CREATE OR REPLACE FUNCTION public.handle_reschedule_request_change()
RETURNS TRIGGER AS $$
DECLARE
  v_actor              UUID := auth.uid();
  v_booking            RECORD;
  v_provider_user_id   UUID;
  v_representative_id  UUID;
BEGIN
  SELECT b.user_id, b.provider_id, b.customer_name,
         b.provider_name_snapshot, b.service_name_snapshot,
         b.group_booking_id, b.group_booking_count
    INTO v_booking
    FROM public.bookings b
   WHERE b.id = NEW.booking_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT p.user_id INTO v_provider_user_id
    FROM public.providers p WHERE p.id = v_booking.provider_id;

  IF NEW.group_reschedule_batch_id IS NOT NULL THEN
    SELECT r.booking_id INTO v_representative_id
      FROM public.booking_reschedule_requests r
     WHERE r.group_reschedule_batch_id = NEW.group_reschedule_batch_id
     ORDER BY r.original_date ASC, r.original_time ASC, r.booking_id ASC
     LIMIT 1;
  END IF;

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
      IF NEW.group_reschedule_batch_id IS NOT NULL THEN
        IF v_representative_id = NEW.booking_id THEN
          INSERT INTO public.notifications
            (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
          VALUES (
            v_booking.user_id, 'reschedule_request', v_booking.provider_name_snapshot || ' needs to reschedule',
            v_booking.provider_name_snapshot || ' has proposed new times for your ' ||
              COALESCE(v_booking.group_booking_count, 1)::TEXT || ' service(s), starting with ' ||
              v_booking.service_name_snapshot || '.',
            'high', TRUE, NEW.id, v_booking.provider_id, 'client'
          );
        END IF;
      ELSE
        INSERT INTO public.notifications
          (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
        VALUES (
          v_booking.user_id, 'reschedule_request', v_booking.provider_name_snapshot || ' needs to reschedule',
          v_booking.provider_name_snapshot || ' has proposed new times for your ' ||
            v_booking.service_name_snapshot || ' appointment.',
          'high', TRUE, NEW.id, v_booking.provider_id, 'client'
        );
      END IF;
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
      IF NEW.group_reschedule_batch_id IS NOT NULL THEN
        IF v_representative_id = NEW.booking_id THEN
          INSERT INTO public.notifications
            (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
          VALUES (
            v_booking.user_id, 'reschedule_provider_response',
            CASE WHEN NEW.response_note IS NOT NULL
              THEN v_booking.provider_name_snapshot || ' can''t make those dates'
              ELSE 'Provider Responded' END,
            COALESCE(NEW.response_note,
              v_booking.provider_name_snapshot || ' has shared available dates for your ' ||
                COALESCE(v_booking.group_booking_count, 1)::TEXT || ' service(s).'),
            'high', TRUE, NEW.id, v_booking.provider_id, 'client'
          );
        END IF;
      ELSE
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
      END IF;

    ELSIF NEW.status = 'confirmed' THEN
      IF NEW.group_reschedule_batch_id IS NOT NULL THEN
        IF v_representative_id = NEW.booking_id AND v_provider_user_id IS NOT NULL THEN
          INSERT INTO public.notifications
            (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
          VALUES (
            v_provider_user_id, 'reschedule_confirmed', 'Reschedule Confirmed',
            COALESCE(v_booking.customer_name, 'A client') || ' confirmed the new time for their ' ||
              COALESCE(v_booking.group_booking_count, 1)::TEXT || ' service(s).',
            'medium', FALSE, NEW.id, v_booking.provider_id, 'provider'
          );
        END IF;
      ELSE
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
      END IF;

    ELSIF NEW.status = 'rejected' THEN
      IF NEW.group_reschedule_batch_id IS NOT NULL AND v_representative_id != NEW.booking_id THEN
        NULL;
      ELSIF v_actor IS NOT NULL AND v_actor = v_provider_user_id THEN
        INSERT INTO public.notifications
          (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
        VALUES (
          v_booking.user_id, 'reschedule_declined', 'Reschedule Declined',
          COALESCE(NEW.response_note,
            v_booking.provider_name_snapshot ||
              (CASE WHEN NEW.group_reschedule_batch_id IS NOT NULL
                THEN ' was unable to accommodate your reschedule request for ' ||
                     COALESCE(v_booking.group_booking_count, 1)::TEXT || ' service(s). Your original appointment times stand.'
                ELSE ' was unable to accommodate your reschedule request. Your original appointment time stands.' END)),
          'high', FALSE, NEW.id, v_booking.provider_id, 'client'
        );
      ELSE
        IF v_provider_user_id IS NOT NULL THEN
          INSERT INTO public.notifications
            (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
          VALUES (
            v_provider_user_id, 'reschedule_declined',
            CASE WHEN NEW.group_reschedule_batch_id IS NOT NULL THEN 'Reschedule Times Declined' ELSE 'Reschedule Times Declined' END,
            COALESCE(v_booking.customer_name, 'A client') ||
              (CASE WHEN NEW.group_reschedule_batch_id IS NOT NULL
                THEN ' declined the offered times for their ' || COALESCE(v_booking.group_booking_count, 1)::TEXT || ' service(s). Their original appointment times stand.'
                ELSE ' declined the offered times for their ' || v_booking.service_name_snapshot || ' appointment. Their original appointment time stands.' END),
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
;
