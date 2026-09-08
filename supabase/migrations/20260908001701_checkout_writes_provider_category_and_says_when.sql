-- Checkout writes the provider's category, and both checkout paths say when.
--
-- Two defects, one cause: prepare_checkout()/finalize_checkout() is a thinner
-- reimplementation of claim_cart_booking_slots(), and it dropped detail the
-- older path already carried. Bookings made through it from 2026-09-07 15:32
-- onwards show both symptoms.
--
-- 1. bookings.service_category_snapshot is the provider's top-level category
--    (NAILS/HAIR/MUA/...), which is what the client's Bookings screen groups
--    Upcoming by and what ProviderBookingDetailScreen keys SERVICE_PROFILE_FIELDS
--    on. prepare_checkout wrote services.category_name instead -- the provider's
--    own menu heading ("Full Glam", "Acrylic", "Extensions"). Every sibling
--    writer (claim_cart_booking_slots, provider_create_manual_booking) already
--    uses providers.service_category; prepare_checkout was the sole outlier.
--    The group headers fragmented one-per-booking, labelled with a service name.
--
-- 2. finalize_checkout's four notification messages named the service but never
--    the date or time, so the provider's push read "jennifer booked Full Glam."
--    with nothing actionable in it. send-push-notification uses the notifications
--    row's message as the push body verbatim, so the bare copy reached the
--    lock screen too.
--
-- Both paths now produce the same sentences. The client's confirmation is the
-- fact and nothing else; the provider's carries a short trailing nudge to the
-- CLIENT PROFILE section, placed last so a truncated push still keeps who, what
-- and when. claim_cart_booking_slots's provider "requested" message also gains
-- the time, which its non-emergency arm had always omitted.
--
-- Each function below is reproduced from its current tracked definition; only
-- the one snapshot column and the message expressions differ. LANGUAGE,
-- SECURITY DEFINER, SET search_path and the grants are carried through verbatim.

CREATE OR REPLACE FUNCTION public.prepare_checkout(p_items jsonb)
RETURNS TABLE(checkout_batch_id uuid, amount_due numeric, expires_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_item jsonb;
  v_provider public.providers%ROWTYPE;
  v_service public.services%ROWTYPE;
  v_booking_id uuid;
  v_batch_id uuid := gen_random_uuid();
  v_add_on_ids jsonb;
  v_add_ons_total numeric(10,2);
  v_subtotal numeric(10,2);
  v_deposit numeric(10,2);
  v_due numeric(10,2) := 0;
  v_use_deposit boolean;
  v_deposit_type text;
  v_deposit_amount numeric(10,2);
  v_end_time time;
  v_user public.users%ROWTYPE;
  v_expiry timestamptz := now() + interval '10 minutes';
  v_daily_booking_cap integer;
  v_active_booking_count integer;
  v_safety_required boolean;
  v_safety_ack boolean;
  v_emergency boolean;
  v_emergency_ack boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in is required'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one booking is required';
  END IF;
  IF jsonb_array_length(p_items) > 20 THEN RAISE EXCEPTION 'Too many bookings in one checkout'; END IF;

  SELECT u.* INTO v_user FROM public.users u WHERE u.id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Client profile was not found'; END IF;

  INSERT INTO public.checkout_batches (id, user_id, amount_due, expires_at)
  VALUES (v_batch_id, auth.uid(), 0, v_expiry);

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF NULLIF(v_item->>'provider_id', '') IS NULL
       OR NULLIF(v_item->>'service_id', '') IS NULL
       OR NULLIF(v_item->>'booking_date', '') IS NULL
       OR NULLIF(v_item->>'booking_time', '') IS NULL THEN
      RAISE EXCEPTION 'Each booking needs a provider, service, date and time';
    END IF;

    SELECT p.* INTO v_provider FROM public.providers p
     WHERE p.id = (v_item->>'provider_id')::uuid AND p.has_gone_live = true FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Provider is not available for booking'; END IF;
    SELECT s.* INTO v_service FROM public.services s
     WHERE s.id = (v_item->>'service_id')::uuid AND s.provider_id = v_provider.id AND s.is_active = true FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Service is no longer available'; END IF;

    v_add_on_ids := COALESCE(v_item->'add_on_ids', '[]'::jsonb);
    IF jsonb_typeof(v_add_on_ids) <> 'array' THEN RAISE EXCEPTION 'Invalid add-ons'; END IF;
    SELECT COALESCE(sum(a.price), 0) INTO v_add_ons_total
      FROM public.service_add_ons a
     WHERE a.service_id = v_service.id AND a.is_active = true
       AND a.id IN (SELECT e.value::uuid FROM jsonb_array_elements_text(v_add_on_ids) AS e(value));
    IF (SELECT count(*) FROM jsonb_array_elements_text(v_add_on_ids)) <>
       (SELECT count(*) FROM public.service_add_ons a WHERE a.service_id = v_service.id AND a.is_active = true
          AND a.id IN (SELECT e.value::uuid FROM jsonb_array_elements_text(v_add_on_ids) AS e(value))) THEN
      RAISE EXCEPTION 'One or more add-ons are unavailable';
    END IF;

    -- Safety acknowledgement gate: required whenever the service demands a
    -- patch test or is flagged unsafe in pregnancy. Checked server-side so
    -- the client-side checkbox can't be skipped by calling this RPC
    -- directly with a hand-built payload.
    v_safety_required := COALESCE(v_service.patch_test_required, false)
      OR v_service.is_pregnancy_safe = false;
    v_safety_ack := COALESCE((v_item->>'safety_ack')::boolean, false);
    IF v_safety_required AND NOT v_safety_ack THEN
      RAISE EXCEPTION 'Please confirm you have seen this treatment''s safety information before continuing';
    END IF;

    -- Emergency (outside the provider's normal scheduling rules) request.
    -- Same server-side-enforced shape as the safety gate above: the client
    -- has to have been shown, and accepted, the confirmation pointing them
    -- at the provider's policy. enforce_booking_bookability() is what
    -- decides whether this provider actually permits the request at all.
    v_emergency := COALESCE((v_item->>'emergency')::boolean, false);
    v_emergency_ack := COALESCE((v_item->>'emergency_ack')::boolean, false);
    IF v_emergency AND NOT v_emergency_ack THEN
      RAISE EXCEPTION 'Please confirm you have read this provider''s policy before requesting a time outside their availability';
    END IF;

    v_subtotal := v_service.price + v_add_ons_total;
    v_use_deposit := COALESCE((v_item->>'use_deposit')::boolean, false);
    v_deposit_type := COALESCE(v_provider.booking_policies->>'depositType', 'percentage');
    v_deposit_amount := NULLIF(v_provider.booking_policies->>'depositAmount', '')::numeric;
    IF COALESCE((v_provider.booking_policies->>'depositRequired')::boolean, true) = false THEN v_use_deposit := false; END IF;
    IF COALESCE((v_provider.booking_policies->>'depositOnly')::boolean, false) THEN v_use_deposit := true; END IF;
    v_deposit := CASE WHEN v_use_deposit THEN LEAST(v_subtotal,
      CASE WHEN v_deposit_type = 'fixed' THEN COALESCE(v_deposit_amount, 0)
           ELSE round(v_subtotal * COALESCE(v_deposit_amount, 20) / 100, 2) END)
      ELSE 0 END;
    v_due := v_due + CASE WHEN v_use_deposit THEN v_deposit ELSE v_subtotal END;
    v_end_time := (v_item->>'booking_time')::time + make_interval(mins => v_service.duration_minutes);

    v_daily_booking_cap := COALESCE(v_provider.max_bookings_per_day, 0);
    IF v_daily_booking_cap > 0 THEN
      SELECT count(*) INTO v_active_booking_count
        FROM public.bookings b
       WHERE b.provider_id = v_provider.id
         AND b.booking_date = (v_item->>'booking_date')::date
         AND b.status IN ('pending', 'confirmed', 'in_progress', 'on_hold');
      IF v_active_booking_count >= v_daily_booking_cap THEN
        RAISE EXCEPTION 'This provider has reached their booking limit for that date';
      END IF;
    END IF;

    INSERT INTO public.bookings (
      user_id, provider_id, service_id, status, booking_date, booking_time, end_time, notes,
      payment_type, base_price, add_ons_total, service_charge, deposit_amount, amount_paid,
      remaining_balance, payment_status, provider_name_snapshot, service_name_snapshot,
      service_category_snapshot, provider_logo_snapshot, customer_name, customer_email,
      customer_phone, hold_batch_id, hold_expires_at, safety_ack_required, safety_ack_at,
      is_emergency_request, emergency_ack_at
    ) VALUES (
      auth.uid(), v_provider.id, v_service.id, 'on_hold', (v_item->>'booking_date')::date,
      (v_item->>'booking_time')::time, v_end_time, NULLIF(btrim(v_item->>'notes'), ''),
      CASE WHEN v_use_deposit THEN 'deposit' ELSE 'full' END, v_service.price, v_add_ons_total, 0,
      v_deposit, CASE WHEN v_use_deposit THEN v_deposit ELSE v_subtotal END,
      CASE WHEN v_use_deposit THEN v_subtotal - v_deposit ELSE 0 END,
      CASE WHEN v_use_deposit THEN 'deposit_paid' ELSE 'fully_paid' END,
      v_provider.display_name, v_service.name, v_provider.service_category, v_provider.logo_url,
      v_user.name, v_user.email, v_user.phone, v_batch_id, v_expiry,
      v_safety_required, CASE WHEN v_safety_required THEN now() ELSE NULL END,
      v_emergency, CASE WHEN v_emergency THEN now() ELSE NULL END
    ) RETURNING id INTO v_booking_id;
    INSERT INTO public.checkout_batch_items (checkout_batch_id, booking_id, add_on_ids)
    VALUES (v_batch_id, v_booking_id, v_add_on_ids);
  END LOOP;

  UPDATE public.checkout_batches SET amount_due = v_due WHERE id = v_batch_id;
  RETURN QUERY SELECT v_batch_id, v_due, v_expiry;
END;
$function$;

REVOKE ALL ON FUNCTION public.prepare_checkout(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prepare_checkout(jsonb) TO authenticated;

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
                  TO_CHAR(v_booking.booking_date, 'DD Mon YYYY') || ' at ' || TO_CHAR(v_booking.booking_time, 'HH12:MI AM') || '.'
           WHEN COALESCE(v_booking.is_emergency_request, false)
             THEN 'Your request with ' || v_booking.provider_name_snapshot || ' for ' ||
                  TO_CHAR(v_booking.booking_date, 'DD Mon YYYY') || ' at ' || TO_CHAR(v_booking.booking_time, 'HH12:MI AM') ||
                  ' is outside their usual availability and is awaiting their decision.'
           ELSE 'Your request with ' || v_booking.provider_name_snapshot || ' for ' ||
                TO_CHAR(v_booking.booking_date, 'DD Mon YYYY') || ' at ' || TO_CHAR(v_booking.booking_time, 'HH12:MI AM') ||
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
        ' on ' || TO_CHAR(v_booking.booking_date, 'DD Mon YYYY') ||
        ' at ' || TO_CHAR(v_booking.booking_time, 'HH12:MI AM') ||
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

REVOKE ALL ON FUNCTION public.finalize_checkout(uuid, text) FROM PUBLIC, anon, authenticated;

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
              ' at ' || TO_CHAR(v_booking_time, 'HH12:MI AM') ||
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
              ' at ' || TO_CHAR(v_booking_time, 'HH12:MI AM') ||
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


-- Repair the rows prepare_checkout already wrote. Deliberately narrow: only a
-- row whose snapshot is exactly the booked service's own category_name AND
-- differs from the provider's category is one this bug wrote. A snapshot column
-- records the value at booking time, so a blanket "make it match the provider
-- today" update would rewrite history for any provider who later changed
-- category -- this cannot, because it requires the service-heading fingerprint.
UPDATE public.bookings b
SET service_category_snapshot = p.service_category
FROM public.providers p, public.services s
WHERE p.id = b.provider_id
  AND s.id = b.service_id
  AND b.service_category_snapshot = s.category_name
  AND b.service_category_snapshot IS DISTINCT FROM p.service_category
  AND p.service_category IS NOT NULL;
