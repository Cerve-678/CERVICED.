-- Emergency booking requests: the claim path never auto-confirms either.
--
-- 20260821144027_emergency_booking_requests_never_auto_confirm.sql taught
-- finalize_checkout() that an emergency request must ignore
-- providers.auto_accept_bookings and always wait for a real answer. It missed
-- the twin: claim_cart_booking_slots(), which is the path the app actually
-- runs today (the Stripe prepare/finalize pair is the not-yet-live route).
-- The result was that for any provider with auto-accept ON, a client's
-- request for a time outside that provider's own rules was committed on their
-- behalf the instant it was paid for — no pending row, so no Confirm/Decline
-- in the provider inbox at all. Two live bookings were created this way
-- (2026-08-26 and 2026-08-27) before it was noticed.
--
-- Reproduced from pg_get_functiondef() of the live definition; only the
-- status/confirmed_at CASE arms and the pending-branch notification copy
-- differ. LANGUAGE, SECURITY DEFINER and SET search_path are carried through
-- verbatim, and CREATE OR REPLACE preserves the existing grants
-- (authenticated + service_role EXECUTE), which this path needs.
--
-- The status is now decided by the held row itself rather than by the
-- provider setting alone, and v_claimed_status — which already drives which
-- pair of notifications is sent — is read back from the UPDATE, so the
-- "awaiting confirmation" notifications follow automatically.
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
          v_provider_name || ' confirmed your booking for ' || v_service_name ||
            ' on ' || TO_CHAR(v_booking_date, 'DD Mon YYYY') ||
            ' at ' || TO_CHAR(v_booking_time, 'HH12:MI AM') || '.',
          'high', TRUE, v_claimed_id, v_provider_id, 'client'
        );

        IF v_provider_user_id IS NOT NULL THEN
          INSERT INTO public.notifications
            (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
          VALUES (
            v_provider_user_id, 'booking_confirmed', 'New Booking',
            COALESCE(v_customer_name, 'A client') || ' booked ' || v_service_name ||
              ' on ' || TO_CHAR(v_booking_date, 'DD Mon YYYY') ||
              ' at ' || TO_CHAR(v_booking_time, 'HH12:MI AM') || '.',
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
            ' on ' || TO_CHAR(v_booking_date, 'DD Mon YYYY') ||
            ' at ' || TO_CHAR(v_booking_time, 'HH12:MI AM') ||
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
              ' on ' || TO_CHAR(v_booking_date, 'DD Mon YYYY') ||
              CASE WHEN v_is_emergency
                   THEN ' at ' || TO_CHAR(v_booking_time, 'HH12:MI AM') ||
                        ', outside your usual availability. Please confirm or decline.'
                   ELSE '. Please confirm or decline.' END,
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
