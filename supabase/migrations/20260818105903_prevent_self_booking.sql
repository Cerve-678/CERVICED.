-- ════════════════════════════════════════════════════════════════════════════
-- prevent_self_booking.sql
--
-- GAP: a provider who also has a client hat could book their OWN provider
-- profile through the client-side booking flow. Confirmed via investigation
-- that no layer — client-side, server-side RPC, or DB constraint — rejected
-- this anywhere in the app. Neither createBooking()'s plain INSERT path
-- (src/services/databaseService.ts) nor the cart-checkout RPC pair
-- (hold_cart_booking_slots / claim_cart_booking_slots) checked the caller
-- against the provider row's owning user_id.
--
-- FIX: reject a self-booking at both stages of the cart-checkout path:
--   1. hold_cart_booking_slots() — fails fast, before payment even opens.
--   2. claim_cart_booking_slots() — defense in depth, in case a hold was
--      ever created some other way and only claimed here.
-- The plain-INSERT createBooking() path (src/services/databaseService.ts,
-- ~line 1856) gets the equivalent app-side check in the same change; this
-- migration only covers the two SECURITY DEFINER RPCs, which are the actual
-- enforcement boundary a client can't route around.
--
-- Verified live via pg_get_functiondef() through the Supabase MCP tools
-- immediately before writing this file — both function bodies below are
-- byte-for-byte the live definitions (matching supabase/fix_cart_checkout_
-- slot_hold.sql and supabase/fix_claim_cart_booking_slots_missing_
-- notifications.sql respectively) with only the new self-booking guard
-- added. No other logic changed.
--
-- Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.hold_cart_booking_slots(p_hold_batch_id uuid, p_items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item JSONB;
  v_provider_id UUID;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_provider_id := (v_item->>'provider_id')::UUID;

    IF EXISTS (
      SELECT 1 FROM public.providers p
       WHERE p.id = v_provider_id AND p.user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'You can''t book your own provider profile.';
    END IF;

    INSERT INTO public.bookings (
      user_id, provider_id, service_id, status,
      booking_date, booking_time, end_time,
      payment_type, base_price, add_ons_total, service_charge,
      deposit_amount, amount_paid, remaining_balance, payment_status,
      provider_name_snapshot, service_name_snapshot,
      hold_batch_id, hold_expires_at
    ) VALUES (
      auth.uid(),
      v_provider_id,
      NULLIF(v_item->>'service_id', '')::UUID,
      'on_hold',
      (v_item->>'booking_date')::DATE,
      (v_item->>'booking_time')::TIME,
      (v_item->>'end_time')::TIME,
      'full', 0, 0, 0, 0, 0, 0, 'pending',
      -- Placeholder — claim_cart_booking_slots() overwrites this with the
      -- real name on payment success; expire_cart_holds() cancels the row
      -- if it never gets claimed. Never shown to a user in either case.
      'Reserving…', 'Reserving…',
      p_hold_batch_id, NOW() + INTERVAL '10 minutes'
    );
  END LOOP;
END;
$function$;

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
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_provider_id := (v_item->>'provider_id')::UUID;
    v_booking_date := (v_item->>'booking_date')::DATE;
    v_booking_time := (v_item->>'booking_time')::TIME;

    SELECT COALESCE(auto_accept_bookings, FALSE), user_id INTO v_auto_accept, v_provider_user_id
      FROM public.providers WHERE id = v_provider_id;

    -- Defense in depth: hold_cart_booking_slots() already rejects this at
    -- hold time, but reject again here in case a hold row was ever created
    -- some other way and only reaches this claim step.
    IF v_provider_user_id IS NOT NULL AND v_provider_user_id = auth.uid() THEN
      RAISE EXCEPTION 'You can''t book your own provider profile.';
    END IF;

    -- This table is owner-only to clients, but this controlled server function
    -- may snapshot it for the booked client. Never use location_text here.
    SELECT full_address, latitude, longitude
      INTO v_full_address, v_latitude, v_longitude
      FROM public.provider_private_details
     WHERE public.provider_private_details.provider_id = v_provider_id;

    UPDATE public.bookings SET
      status = CASE WHEN v_auto_accept THEN 'confirmed' ELSE 'pending' END,
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
      confirmed_at = CASE WHEN v_auto_accept THEN NOW() ELSE NULL END,
      policy_accepted_at = (v_item->>'policy_accepted_at')::TIMESTAMPTZ,
      policy_snapshot = v_item->'policy_snapshot'
    WHERE public.bookings.hold_batch_id = p_hold_batch_id
      AND public.bookings.provider_id = v_provider_id
      AND public.bookings.booking_date = v_booking_date
      AND public.bookings.booking_time = v_booking_time
      AND public.bookings.status = 'on_hold'
      AND public.bookings.hold_expires_at > NOW()
      AND public.bookings.user_id = auth.uid()
    RETURNING id, status, provider_name_snapshot, service_name_snapshot, customer_name
      INTO v_claimed_id, v_claimed_status, v_provider_name, v_service_name, v_customer_name;

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
        INSERT INTO public.notifications
          (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
        VALUES (
          auth.uid(), 'booking_pending', 'Booking Request Sent',
          'Your request with ' || v_provider_name ||
            ' on ' || TO_CHAR(v_booking_date, 'DD Mon YYYY') ||
            ' at ' || TO_CHAR(v_booking_time, 'HH12:MI AM') ||
            ' is awaiting confirmation.',
          'high', TRUE, v_claimed_id, v_provider_id, 'client'
        );

        IF v_provider_user_id IS NOT NULL THEN
          INSERT INTO public.notifications
            (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
          VALUES (
            v_provider_user_id, 'booking_pending', 'New Booking Request',
            COALESCE(v_customer_name, 'A client') || ' requested ' || v_service_name ||
              ' on ' || TO_CHAR(v_booking_date, 'DD Mon YYYY') || '. Please confirm or decline.',
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
    END IF;
  END LOOP;
END;
$function$;
