-- Keep provider notes on the same reschedule request row as the offered times.
-- The offer, decline policy, note and slot holds are committed together.
BEGIN;

CREATE FUNCTION public.provider_initiate_reschedule_with_note(
  p_booking_id uuid,
  p_proposed_slots jsonb,
  p_cancel_if_declined boolean,
  p_note text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_booking record;
  v_note text := NULLIF(left(btrim(p_note), 500), '');
BEGIN
  SELECT b.booking_date, b.booking_time, b.status
    INTO v_booking
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
   WHERE b.id = p_booking_id AND p.user_id = auth.uid()
   FOR UPDATE OF b;

  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF v_booking.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Only confirmed bookings can be rescheduled';
  END IF;

  INSERT INTO public.booking_reschedule_requests
    (booking_id, requested_by, original_date, original_time, requested_dates,
     provider_available_slots, status, reschedule_count, response_note,
     cancel_if_declined, updated_at)
  VALUES
    (p_booking_id, 'provider', v_booking.booking_date, v_booking.booking_time,
     ARRAY[]::date[], p_proposed_slots, 'provider_responded', 0, v_note,
     COALESCE(p_cancel_if_declined, false), now())
  ON CONFLICT (booking_id) DO UPDATE
    SET requested_by = 'provider',
        original_date = v_booking.booking_date,
        original_time = v_booking.booking_time,
        requested_dates = ARRAY[]::date[],
        provider_available_slots = p_proposed_slots,
        status = 'provider_responded',
        response_note = v_note,
        cancel_if_declined = COALESCE(p_cancel_if_declined, false),
        updated_at = now();

  PERFORM public.release_reschedule_holds(p_booking_id);
  PERFORM public.place_reschedule_holds_from_slots(p_booking_id, p_proposed_slots);
END;
$function$;
REVOKE ALL ON FUNCTION public.provider_initiate_reschedule_with_note(uuid, jsonb, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provider_initiate_reschedule_with_note(uuid, jsonb, boolean, text) TO authenticated, service_role;

-- A client who declines a provider offer must also hear when the provider's
-- per-offer cancellation choice has cancelled the original appointment.
CREATE OR REPLACE FUNCTION public.decline_reschedule_offer(p_booking_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cancel boolean;
  v_payment_intent_id text;
  v_payment_status text;
  v_stripe_refund_id text;
  v_client_id uuid;
  v_provider_id uuid;
  v_provider_name text;
BEGIN
  SELECT r.cancel_if_declined, b.payment_intent_id, b.payment_status,
         b.stripe_refund_id, b.user_id, b.provider_id, b.provider_name_snapshot
    INTO v_cancel, v_payment_intent_id, v_payment_status,
         v_stripe_refund_id, v_client_id, v_provider_id, v_provider_name
    FROM public.booking_reschedule_requests r
    JOIN public.bookings b ON b.id = r.booking_id
   WHERE r.booking_id = p_booking_id AND b.user_id = auth.uid()
     AND r.status = 'provider_responded' AND b.status = 'confirmed'
     AND r.group_reschedule_batch_id IS NULL
   FOR UPDATE OF r, b;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active reschedule offer found for this booking';
  END IF;

  UPDATE public.booking_reschedule_requests
     SET status = 'rejected', updated_at = now()
   WHERE booking_id = p_booking_id;

  IF v_cancel THEN
    UPDATE public.bookings SET status = 'cancelled' WHERE id = p_booking_id;
    IF v_payment_intent_id IS NOT NULL
       AND v_payment_status IN ('fully_paid', 'deposit_paid')
       AND v_stripe_refund_id IS NULL THEN
      PERFORM public.refund_booking_async(p_booking_id, 'provider_offer_declined');
    END IF;
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      v_client_id, 'booking_cancelled', 'Appointment cancelled',
      'Your appointment with ' || COALESCE(v_provider_name, 'your provider') ||
      ' was cancelled after you declined the new time.' ||
      CASE WHEN v_payment_intent_id IS NOT NULL AND
                    v_payment_status IN ('fully_paid', 'deposit_paid') AND
                    v_stripe_refund_id IS NULL
           THEN ' Your payment is being refunded in full.' ELSE '' END,
      'high', FALSE, p_booking_id, v_provider_id, 'client'
    );
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.decline_reschedule_offer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_reschedule_offer(uuid) TO authenticated, service_role;

-- Include the note in the provider-initiated offer notification.
CREATE OR REPLACE FUNCTION public.handle_reschedule_request_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
          'high', TRUE, NEW.booking_id, v_booking.provider_id, 'provider'
        );
      END IF;
    ELSIF NEW.status = 'provider_responded' THEN
      IF NEW.group_reschedule_batch_id IS NOT NULL THEN
        IF v_representative_id = NEW.booking_id THEN
          INSERT INTO public.notifications
            (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
          VALUES (
            v_booking.user_id, 'reschedule_request', v_booking.provider_name_snapshot || ' needs to reschedule',
            v_booking.provider_name_snapshot || ' needs to reschedule your ' ||
              COALESCE(v_booking.group_booking_count, 1)::TEXT || ' service(s), starting with ' ||
              v_booking.service_name_snapshot ||
              '. Accept or decline the new proposed dates and times to confirm.' || CASE WHEN NULLIF(btrim(NEW.response_note), '') IS NOT NULL
                   THEN E'\n\nNote from provider: ' || NEW.response_note ELSE '' END,
            'high', TRUE, NEW.booking_id, v_booking.provider_id, 'client'
          );
        END IF;
      ELSE
        INSERT INTO public.notifications
          (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
        VALUES (
          v_booking.user_id, 'reschedule_request', v_booking.provider_name_snapshot || ' needs to reschedule',
          v_booking.provider_name_snapshot || ' needs to reschedule your ' ||
            v_booking.service_name_snapshot ||
            ' appointment. Accept or decline the new proposed date and time to confirm.' || CASE WHEN NULLIF(btrim(NEW.response_note), '') IS NOT NULL
                   THEN E'\n\nNote from provider: ' || NEW.response_note ELSE '' END,
          'high', TRUE, NEW.booking_id, v_booking.provider_id, 'client'
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
          'high', TRUE, NEW.booking_id, v_booking.provider_id, 'provider'
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
              v_booking.provider_name_snapshot || ' has offered new dates and times for your ' ||
                COALESCE(v_booking.group_booking_count, 1)::TEXT ||
                ' service(s). Accept or decline to confirm.'),
            'high', TRUE, NEW.booking_id, v_booking.provider_id, 'client'
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
            v_booking.provider_name_snapshot ||
              ' has offered new dates and times for your reschedule request.' ||
              ' Accept or decline to confirm.'),
          'high', TRUE, NEW.booking_id, v_booking.provider_id, 'client'
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
            'medium', FALSE, NEW.booking_id, v_booking.provider_id, 'provider'
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
            'medium', FALSE, NEW.booking_id, v_booking.provider_id, 'provider'
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
          'high', FALSE, NEW.booking_id, v_booking.provider_id, 'client'
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
                THEN ' declined the offered times for their ' || COALESCE(v_booking.group_booking_count, 1)::TEXT || ' service(s).' ||
                  CASE WHEN NEW.cancel_if_declined THEN ' The booking was cancelled and any payment is being refunded in full.'
                       ELSE ' Their original appointment times stand.' END
                ELSE ' declined the offered times for their ' || v_booking.service_name_snapshot || ' appointment.' ||
                  CASE WHEN NEW.cancel_if_declined THEN ' The booking was cancelled and any payment is being refunded in full.'
                       ELSE ' Their original appointment time stands.' END END),
            'medium', FALSE, NEW.booking_id, v_booking.provider_id, 'provider'
          );
        END IF;
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;
