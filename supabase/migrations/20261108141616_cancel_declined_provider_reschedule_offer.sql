-- A provider may make cancellation the outcome of declining one reschedule
-- offer. The default preserves the existing original-time-stands behaviour.
BEGIN;

ALTER TABLE public.booking_reschedule_requests
  ADD COLUMN cancel_if_declined boolean NOT NULL DEFAULT false;

-- Legacy callers must clear a previous offer's decline policy when re-offering.
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
         cancel_if_declined = FALSE,
         updated_at = NOW()
   WHERE booking_id = p_booking_id;

  -- The client's own requested time is no longer a candidate: the provider has
  -- just answered with alternatives instead. Released BEFORE the new holds go
  -- down, so a provider re-offering the very time the client asked for is not
  -- blocked by that client's own stage 1 hold.
  PERFORM public.release_reschedule_holds(p_booking_id);
  PERFORM public.place_reschedule_holds_from_slots(p_booking_id, p_available_slots);
END;
$$;

CREATE OR REPLACE FUNCTION public.provider_initiate_reschedule(
  p_booking_id UUID,
  p_proposed_slots JSONB
) RETURNS VOID AS $$
DECLARE
  v_booking RECORD;
BEGIN
  SELECT b.booking_date, b.booking_time, b.status
    INTO v_booking
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
   WHERE b.id = p_booking_id
     AND p.user_id = auth.uid()
   FOR UPDATE OF b;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_booking.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Only confirmed bookings can be rescheduled';
  END IF;

  INSERT INTO public.booking_reschedule_requests
    (booking_id, requested_by, original_date, original_time, requested_dates,
     provider_available_slots, status, reschedule_count, updated_at)
  VALUES
    (p_booking_id, 'provider', v_booking.booking_date, v_booking.booking_time,
     ARRAY[]::DATE[], p_proposed_slots, 'provider_responded', 0, NOW())
  ON CONFLICT (booking_id) DO UPDATE
    SET requested_by = 'provider',
        original_date = v_booking.booking_date,
        original_time = v_booking.booking_time,
        requested_dates = ARRAY[]::DATE[],
        provider_available_slots = p_proposed_slots,
        status = 'provider_responded',
        cancel_if_declined = FALSE,
        updated_at = NOW();

  PERFORM public.release_reschedule_holds(p_booking_id);
  PERFORM public.place_reschedule_holds_from_slots(p_booking_id, p_proposed_slots);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Keep the existing RPC signatures for older clients. These wrappers make
-- the offer and its decline policy one transaction.
CREATE FUNCTION public.provider_initiate_reschedule_with_policy(
  p_booking_id uuid, p_proposed_slots jsonb, p_cancel_if_declined boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.provider_initiate_reschedule(p_booking_id, p_proposed_slots);
  UPDATE public.booking_reschedule_requests r
     SET cancel_if_declined = COALESCE(p_cancel_if_declined, false)
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
   WHERE r.booking_id = b.id AND b.id = p_booking_id
     AND p.user_id = auth.uid() AND r.status = 'provider_responded';
  IF NOT FOUND THEN RAISE EXCEPTION 'Reschedule offer not found'; END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.provider_initiate_reschedule_with_policy(uuid, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provider_initiate_reschedule_with_policy(uuid, jsonb, boolean) TO authenticated, service_role;

CREATE FUNCTION public.respond_to_reschedule_request_with_policy(
  p_booking_id uuid, p_available_slots jsonb, p_response_note text, p_cancel_if_declined boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.respond_to_reschedule_request(p_booking_id, p_available_slots, p_response_note);
  UPDATE public.booking_reschedule_requests r
     SET cancel_if_declined = COALESCE(p_cancel_if_declined, false)
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
   WHERE r.booking_id = b.id AND b.id = p_booking_id
     AND p.user_id = auth.uid() AND r.status = 'provider_responded';
  IF NOT FOUND THEN RAISE EXCEPTION 'Reschedule offer not found'; END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.respond_to_reschedule_request_with_policy(uuid, jsonb, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_to_reschedule_request_with_policy(uuid, jsonb, text, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.decline_reschedule_offer(p_booking_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cancel boolean;
  v_payment_intent_id text;
  v_payment_status text;
  v_stripe_refund_id text;
BEGIN
  SELECT r.cancel_if_declined, b.payment_intent_id, b.payment_status, b.stripe_refund_id
    INTO v_cancel, v_payment_intent_id, v_payment_status, v_stripe_refund_id
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
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.decline_reschedule_offer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_reschedule_offer(uuid) TO authenticated, service_role;

-- The provider notification must describe the chosen decline outcome.
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
              '. Accept or decline the new proposed dates and times to confirm.',
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
            ' appointment. Accept or decline the new proposed date and time to confirm.',
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
