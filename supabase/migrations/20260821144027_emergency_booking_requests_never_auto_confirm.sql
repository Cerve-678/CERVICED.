-- Emergency booking requests, part 5 of 5: never auto-confirmed.
-- Introduced by 20260821143821_emergency_booking_requests.sql.
-- Only the v_auto_accept assignment and the notification copy differ from
-- the previous definition; everything else is reproduced verbatim.
CREATE OR REPLACE FUNCTION public.finalize_checkout(p_checkout_batch_id uuid, p_payment_intent_id text)
RETURNS TABLE(booking_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_batch public.checkout_batches%ROWTYPE;
  v_booking public.bookings%ROWTYPE;
  v_auto_accept boolean;
  v_provider_user_id uuid;
  v_add_on_id uuid;
BEGIN
  SELECT b.* INTO v_batch FROM public.checkout_batches b WHERE b.id = p_checkout_batch_id FOR UPDATE;
  -- This function is deliberately not executable by authenticated clients.
  -- The Edge Function validates the caller owns both this batch and the
  -- Stripe intent before invoking it with the service role.
  IF NOT FOUND OR v_batch.status <> 'prepared' OR v_batch.expires_at <= now() THEN
    RAISE EXCEPTION 'Checkout has expired or is unavailable';
  END IF;
  IF v_batch.payment_intent_id IS DISTINCT FROM p_payment_intent_id THEN RAISE EXCEPTION 'Payment does not match this checkout'; END IF;

  FOR v_booking IN SELECT b.* FROM public.bookings b WHERE b.hold_batch_id = v_batch.id AND b.status = 'on_hold' FOR UPDATE
  LOOP
    SELECT COALESCE(p.auto_accept_bookings, false), p.user_id INTO v_auto_accept, v_provider_user_id FROM public.providers p WHERE p.id = v_booking.provider_id;
    -- An emergency request is a deliberate ask for something the provider's
    -- own rules exclude, so it always waits for a real answer — auto-accept
    -- must never commit them to it silently.
    IF COALESCE(v_booking.is_emergency_request, false) THEN v_auto_accept := false; END IF;
    UPDATE public.bookings SET status = CASE WHEN v_auto_accept THEN 'confirmed' ELSE 'pending' END,
      confirmed_at = CASE WHEN v_auto_accept THEN now() ELSE null END, hold_batch_id = null, hold_expires_at = null,
      payment_intent_id = p_payment_intent_id WHERE id = v_booking.id;
    FOR v_add_on_id IN SELECT e.value::uuid FROM jsonb_array_elements_text((SELECT i.add_on_ids FROM public.checkout_batch_items i WHERE i.checkout_batch_id = v_batch.id AND i.booking_id = v_booking.id)) AS e(value)
    LOOP
      INSERT INTO public.booking_add_ons (booking_id, add_on_id, name_snapshot, price_snapshot)
      SELECT v_booking.id, a.id, a.name, a.price FROM public.service_add_ons a WHERE a.id = v_add_on_id;
    END LOOP;
    INSERT INTO public.notifications (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (v_batch.user_id, CASE WHEN v_auto_accept THEN 'booking_confirmed' ELSE 'booking_pending' END,
      CASE WHEN v_auto_accept THEN 'Booking Confirmed! 🎉' ELSE 'Booking Request Sent' END,
      CASE WHEN v_auto_accept THEN v_booking.provider_name_snapshot || ' confirmed your booking for ' || v_booking.service_name_snapshot || '.'
           WHEN COALESCE(v_booking.is_emergency_request, false)
             THEN 'Your request for a time outside ' || v_booking.provider_name_snapshot || '''s usual availability is awaiting their decision.'
           ELSE 'Your request with ' || v_booking.provider_name_snapshot || ' is awaiting confirmation.' END,
      'high', true, v_booking.id, v_booking.provider_id, 'client');
    IF v_provider_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
      VALUES (v_provider_user_id, CASE WHEN v_auto_accept THEN 'booking_confirmed' ELSE 'booking_pending' END,
        CASE WHEN v_auto_accept THEN 'New Booking'
             WHEN COALESCE(v_booking.is_emergency_request, false) THEN 'Booking Request — Outside Your Hours'
             ELSE 'New Booking Request' END,
        COALESCE(v_booking.customer_name, 'A client') || ' booked ' || v_booking.service_name_snapshot ||
        CASE WHEN COALESCE(v_booking.is_emergency_request, false)
             THEN ' outside your usual availability.' ELSE '.' END,
        'high', NOT v_auto_accept, v_booking.id, v_booking.provider_id, 'provider');
    END IF;
    booking_id := v_booking.id; RETURN NEXT;
  END LOOP;
  UPDATE public.checkout_batches SET status = 'finalised', finalised_at = now() WHERE id = v_batch.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.finalize_checkout(uuid, text) FROM PUBLIC, anon, authenticated;
