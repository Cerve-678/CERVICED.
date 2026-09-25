-- Provider-facing "new booking" notifications say the day, not a bare date:
--   "Jane booked Lash Lift for Friday 4th Sept 2026 at 2:00pm."
-- (was: "Jane booked Lash Lift on 04 Sep 2026 at 02:00pm.")
--
-- Bodies below are the LIVE definitions (pg_get_functiondef, 2026-09-25) with
-- only the provider message changed. Client-facing copy is untouched.
--
-- Also repairs finalize_checkout: the 20260914 time-format migrations' regex
-- rewrote its client message into calls that don't exist
-- (format_notification_time(date, text) and one-argument TO_CHAR(time)), so it
-- would have raised the first time it ran. Dormant while USE_STRIPE_PAYMENTS is
-- off; restored here to TO_CHAR(date, 'DD Mon YYYY') + format_notification_time(time).
--
-- Notifications already sent keep their old text.

CREATE OR REPLACE FUNCTION public.format_notification_date(p_date date)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
SET search_path TO 'pg_catalog'
AS $$
  SELECT to_char(p_date, 'FMDay') || ' ' ||
         extract(day FROM p_date)::int ||
         CASE
           WHEN extract(day FROM p_date)::int BETWEEN 11 AND 13 THEN 'th'
           WHEN extract(day FROM p_date)::int % 10 = 1 THEN 'st'
           WHEN extract(day FROM p_date)::int % 10 = 2 THEN 'nd'
           WHEN extract(day FROM p_date)::int % 10 = 3 THEN 'rd'
           ELSE 'th'
         END || ' ' ||
         CASE WHEN extract(month FROM p_date)::int = 9 THEN 'Sept' ELSE to_char(p_date, 'FMMon') END ||
         ' ' || extract(year FROM p_date)::int
$$;

REVOKE ALL ON FUNCTION public.format_notification_date(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.format_notification_date(date) TO authenticated, service_role;

-- ── claim_cart_booking_slots ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_cart_booking_slots(p_hold_batch_id uuid, p_items jsonb)
 RETURNS TABLE(provider_id uuid, booking_date date, booking_time time without time zone, booking_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item JSONB;
  v_provider_id UUID;
  v_booking_date DATE;
  v_booking_time TIME;
  v_claimed_id UUID;
  v_auto_accept BOOLEAN;
  v_full_address TEXT;
  v_latitude NUMERIC(10,7);
  v_longitude NUMERIC(10,7);
  v_provider_user_id UUID;
  v_claimed_status TEXT;
  v_provider_name TEXT;
  v_service_name TEXT;
  v_customer_name TEXT;
  v_is_emergency BOOLEAN;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_provider_id := (v_item->>'provider_id')::UUID;
    v_booking_date := (v_item->>'booking_date')::DATE;
    v_booking_time := (v_item->>'booking_time')::TIME;

    SELECT COALESCE(auto_accept_bookings, FALSE), user_id INTO v_auto_accept, v_provider_user_id
      FROM public.providers WHERE id = v_provider_id;

    IF v_provider_user_id IS NOT NULL AND v_provider_user_id = auth.uid() THEN
      RAISE EXCEPTION 'You can''t book your own provider profile.';
    END IF;

    SELECT full_address, latitude, longitude
      INTO v_full_address, v_latitude, v_longitude
      FROM public.provider_private_details
     WHERE public.provider_private_details.provider_id = v_provider_id;

    UPDATE public.bookings SET
      -- An emergency request is a deliberate ask for something the provider's
      -- own rules exclude, so it always waits for a real answer — auto-accept
      -- must never commit them to it silently. Read off the held row, not off
      -- p_items: is_emergency_request is stamped at hold time and the client
      -- payload has no authority over it.
      status = CASE WHEN v_auto_accept AND NOT COALESCE(public.bookings.is_emergency_request, FALSE)
                    THEN 'confirmed' ELSE 'pending' END,
      hold_expires_at = NULL,
      hold_batch_id = NULL,
      service_id = NULLIF(v_item->>'service_id', '')::UUID,
      end_time = (v_item->>'end_time')::TIME,
      notes = v_item->>'notes',
      booking_instructions = NULL,
      payment_type = v_item->>'payment_type',
      base_price = (v_item->>'base_price')::NUMERIC,
      add_ons_total = (v_item->>'add_ons_total')::NUMERIC,
      service_charge = (v_item->>'service_charge')::NUMERIC,
      deposit_amount = (v_item->>'deposit_amount')::NUMERIC,
      amount_paid = (v_item->>'amount_paid')::NUMERIC,
      remaining_balance = (v_item->>'remaining_balance')::NUMERIC,
      payment_status = v_item->>'payment_status',
      payment_method = v_item->>'payment_method',
      payment_intent_id = v_item->>'payment_intent_id',
      is_group_booking = COALESCE((v_item->>'is_group_booking')::BOOLEAN, FALSE),
      group_booking_id = NULLIF(v_item->>'group_booking_id', '')::UUID,
      group_booking_count = COALESCE((v_item->>'group_booking_count')::INTEGER, 1),
      provider_name_snapshot = v_item->>'provider_name_snapshot',
      service_name_snapshot = v_item->>'service_name_snapshot',
      service_category_snapshot = v_item->>'service_category_snapshot',
      provider_logo_snapshot = v_item->>'provider_logo_snapshot',
      provider_address_snapshot = COALESCE(NULLIF(btrim(v_full_address), ''), v_item->>'provider_address_snapshot'),
      provider_phone_snapshot = v_item->>'provider_phone_snapshot',
      provider_coordinates = CASE
        WHEN v_latitude IS NOT NULL AND v_longitude IS NOT NULL
          THEN jsonb_build_object('lat', v_latitude, 'lng', v_longitude)
        WHEN v_item ? 'provider_coordinates' THEN v_item->'provider_coordinates'
        ELSE NULL
      END,
      customer_name = v_item->>'customer_name',
      customer_email = v_item->>'customer_email',
      customer_phone = v_item->>'customer_phone',
      client_address = v_item->>'client_address',
      confirmed_at = CASE WHEN v_auto_accept AND NOT COALESCE(public.bookings.is_emergency_request, FALSE)
                          THEN NOW() ELSE NULL END,
      policy_snapshot = v_item->'policy_snapshot'
    WHERE public.bookings.hold_batch_id = p_hold_batch_id
      AND public.bookings.provider_id = v_provider_id
      AND public.bookings.booking_date = v_booking_date
      AND public.bookings.booking_time = v_booking_time
      AND public.bookings.status = 'on_hold'
      AND public.bookings.hold_expires_at > NOW()
      AND public.bookings.user_id = auth.uid()
    RETURNING id, status, provider_name_snapshot, service_name_snapshot, customer_name,
              COALESCE(is_emergency_request, FALSE)
      INTO v_claimed_id, v_claimed_status, v_provider_name, v_service_name, v_customer_name,
           v_is_emergency;

    IF v_claimed_id IS NOT NULL THEN
      IF v_claimed_status = 'confirmed' THEN
        INSERT INTO public.notifications
          (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
        VALUES (
          auth.uid(), 'booking_confirmed', 'Booking Confirmed! 🎉',
          'Your appointment with ' || v_provider_name || ' is confirmed for ' ||
            TO_CHAR(v_booking_date, 'DD Mon YYYY') ||
            ' at ' || public.format_notification_time(v_booking_time) || '.',
          'high', TRUE, v_claimed_id, v_provider_id, 'client'
        );

        IF v_provider_user_id IS NOT NULL THEN
          INSERT INTO public.notifications
            (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
          VALUES (
            v_provider_user_id, 'booking_confirmed', 'New Booking',
            COALESCE(v_customer_name, 'A client') || ' booked ' || v_service_name ||
              ' for ' || public.format_notification_date(v_booking_date) ||
              ' at ' || public.format_notification_time(v_booking_time) ||
              '. Check their client profile for anything important.',
            'high', FALSE, v_claimed_id, v_provider_id, 'provider'
          );
        END IF;
      ELSE
        -- Same split finalize_checkout() makes: a request the provider has to
        -- answer BECAUSE it breaks their own rules should not read as an
        -- ordinary "awaiting confirmation" — on either side.
        INSERT INTO public.notifications
          (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
        VALUES (
          auth.uid(), 'booking_pending', 'Booking Request Sent',
          'Your request with ' || v_provider_name ||
            ' for ' || TO_CHAR(v_booking_date, 'DD Mon YYYY') ||
            ' at ' || public.format_notification_time(v_booking_time) ||
            CASE WHEN v_is_emergency
                 THEN ' is outside their usual availability and is awaiting their decision.'
                 ELSE ' is awaiting confirmation.' END,
          'high', TRUE, v_claimed_id, v_provider_id, 'client'
        );

        IF v_provider_user_id IS NOT NULL THEN
          INSERT INTO public.notifications
            (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
          VALUES (
            v_provider_user_id, 'booking_pending',
            CASE WHEN v_is_emergency THEN 'Booking Request — Outside Your Hours'
                 ELSE 'New Booking Request' END,
            COALESCE(v_customer_name, 'A client') || ' requested ' || v_service_name ||
              ' for ' || public.format_notification_date(v_booking_date) ||
              ' at ' || public.format_notification_time(v_booking_time) ||
              CASE WHEN v_is_emergency
                   THEN ', outside your usual availability. Check their client profile, then confirm or decline.'
                   ELSE '. Check their client profile, then confirm or decline.' END,
            'high', TRUE, v_claimed_id, v_provider_id, 'provider'
          );
        END IF;
      END IF;

      provider_id := v_provider_id;
      booking_date := v_booking_date;
      booking_time := v_booking_time;
      booking_id := v_claimed_id;
      RETURN NEXT;
      v_claimed_id := NULL;
      v_is_emergency := NULL;
    END IF;
  END LOOP;
END;
$function$;

-- ── finalize_checkout ───────────────────────────────────────────────────────
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
      CASE WHEN v_auto_accept
             THEN 'Your appointment with ' || v_booking.provider_name_snapshot || ' is confirmed for ' ||
                  TO_CHAR(v_booking.booking_date, 'DD Mon YYYY') || ' at ' || public.format_notification_time(v_booking.booking_time) || '.'
           WHEN COALESCE(v_booking.is_emergency_request, false)
             THEN 'Your request with ' || v_booking.provider_name_snapshot || ' for ' ||
                  TO_CHAR(v_booking.booking_date, 'DD Mon YYYY') || ' at ' || public.format_notification_time(v_booking.booking_time) ||
                  ' is outside their usual availability and is awaiting their decision.'
           ELSE 'Your request with ' || v_booking.provider_name_snapshot || ' for ' ||
                TO_CHAR(v_booking.booking_date, 'DD Mon YYYY') || ' at ' || public.format_notification_time(v_booking.booking_time) ||
                ' is awaiting confirmation.' END,
      'high', true, v_booking.id, v_booking.provider_id, 'client');
    IF v_provider_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
      VALUES (v_provider_user_id, CASE WHEN v_auto_accept THEN 'booking_confirmed' ELSE 'booking_pending' END,
        CASE WHEN v_auto_accept THEN 'New Booking'
             WHEN COALESCE(v_booking.is_emergency_request, false) THEN 'Booking Request — Outside Your Hours'
             ELSE 'New Booking Request' END,
        COALESCE(v_booking.customer_name, 'A client') ||
        CASE WHEN v_auto_accept THEN ' booked ' ELSE ' requested ' END || v_booking.service_name_snapshot ||
        ' for ' || public.format_notification_date(v_booking.booking_date) ||
        ' at ' || public.format_notification_time(v_booking.booking_time) ||
        CASE WHEN COALESCE(v_booking.is_emergency_request, false)
             THEN ', outside your usual availability. Check their client profile, then confirm or decline.'
             WHEN v_auto_accept THEN '. Check their client profile for anything important.'
             ELSE '. Check their client profile, then confirm or decline.' END,
        'high', NOT v_auto_accept, v_booking.id, v_booking.provider_id, 'provider');
    END IF;
    booking_id := v_booking.id; RETURN NEXT;
  END LOOP;
  UPDATE public.checkout_batches SET status = 'finalised', finalised_at = now() WHERE id = v_batch.id;
END;
$function$;

-- ── handle_new_booking ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_provider_user_id UUID;
  v_auto_accept      BOOLEAN;
BEGIN
  IF NEW.status = 'on_hold' THEN
    RETURN NEW;
  END IF;

  SELECT p.user_id, p.auto_accept_bookings
    INTO v_provider_user_id, v_auto_accept
    FROM public.providers p
   WHERE p.id = NEW.provider_id;

  IF v_auto_accept THEN
    UPDATE public.bookings
       SET status = 'confirmed', confirmed_at = NOW()
     WHERE id = NEW.id;

    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      v_provider_user_id,
      'booking_confirmed',
      'You have a new booking',
      COALESCE(NEW.customer_name, 'A client') || ' booked ' ||
        NEW.service_name_snapshot ||
        ' for ' || public.format_notification_date(NEW.booking_date) ||
        ' at ' || public.format_notification_time(NEW.booking_time) || '.',
      'high', FALSE, NEW.id, NEW.provider_id, 'provider'
    );

  ELSE
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      NEW.user_id,
      'booking_pending',
      'Booking Request Sent',
      'Your request with ' || NEW.provider_name_snapshot ||
        ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') ||
        ' at ' || public.format_notification_time(NEW.booking_time) ||
        ' is awaiting confirmation.',
      'high', TRUE, NEW.id, NEW.provider_id, 'client'
    );

    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      v_provider_user_id,
      'booking_pending',
      'New Booking Request',
      COALESCE(NEW.customer_name, 'A client') || ' requested ' ||
        NEW.service_name_snapshot ||
        ' for ' || public.format_notification_date(NEW.booking_date) ||
        '. Please confirm or decline.',
      'high', TRUE, NEW.id, NEW.provider_id, 'provider'
    );
  END IF;

  RETURN NEW;
END;
$function$;
