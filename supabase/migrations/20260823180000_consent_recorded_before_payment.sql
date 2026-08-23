-- Consent is recorded server-side, before payment, or the booking doesn't happen.
--
-- Two separate defects, one root cause: the client app was the only thing that
-- ever decided whether consent had been given, and the only thing that decided
-- when.
--
--  1. SAFETY ACKNOWLEDGEMENT was never recorded on the path real users take.
--     20260817075902 put the gate in prepare_checkout(), which is reachable
--     only when USE_STRIPE_PAYMENTS is on — and EXPO_PUBLIC_STRIPE_PAYMENTS_
--     ENABLED is set in no env file or eas.json profile, so it is off in every
--     build. The live path (hold_cart_booking_slots -> claim_cart_booking_
--     slots) never referenced safety_ack_required or safety_ack_at at all.
--     Live rows exist for services the provider flagged NOT pregnancy-safe
--     with safety_ack_required = false and safety_ack_at NULL: nothing
--     rejected them, and nothing recorded that anyone was told.
--
--  2. POLICY ACCEPTANCE was a client-supplied timestamp, so it was wrong in
--     three different ways at once — NULL on most rows (the app stamped the
--     live cart items but booked from a snapshot taken before the stamp),
--     carrying the PREVIOUS checkout attempt's time on a retry, and in a few
--     rows a policy_snapshot with no accompanying policy_accepted_at, which
--     reads as "we have their consent on file" to anything checking only for
--     a snapshot.
--
-- Both are fixed the same way and in the same place: at the HOLD, not the
-- claim. The hold is the last server-side step before the client is charged
-- — rejecting there costs them a corrected tap, whereas rejecting at claim
-- time would leave a taken payment with no booking (claimCartBookingSlots'
-- caller treats a throw as non-fatal and there is no longer a fallback
-- insert behind it, so the failure would be near-silent).
--
-- The server no longer takes the client's word for either fact:
--   * whether an acknowledgement is REQUIRED is derived from the service row,
--     never read from the payload — the client is only trusted to report that
--     the person actually acknowledged it;
--   * WHEN consent happened is now::timestamptz from the database clock, not
--     a value the caller supplies. That is what makes the stale-retry bug
--     unrepresentable rather than merely fixed.
--
-- STILL OPEN, deliberately: prepare_checkout() — the Stripe path — records
-- the safety acknowledgement but still writes no policy_accepted_at. It is
-- unreachable in every current build (the flag above), so no real booking is
-- affected today, and reproducing its ~100-line body a third time inside a
-- migration about something else would leave a worse trap for whoever
-- finishes the Stripe work than the gap it closes. Whoever turns
-- USE_STRIPE_PAYMENTS on must add the same two lines this migration adds to
-- hold_cart_booking_slots(): reject an item whose payload has no
-- policy_accepted, and stamp policy_accepted_at with now(). Tracked in
-- LEGAL-COMPLIANCE-NOTES.md item 2.
--
-- Ordering: this supersedes hold_cart_booking_slots() as redefined by
-- 20260821143919_emergency_booking_requests_hold_path.sql (part 3 of the
-- five-part set 20260821143821..144027) and reproduces its emergency-request
-- handling verbatim. It must run after that set; the guard below turns
-- getting that wrong into a loud failure instead of a silent revert of the
-- emergency feature.
--
-- This file was originally numbered 20260821143000 — BEFORE that set, which
-- was renumbered while this migration sat unapplied. In that order the
-- emergency hold-path migration redefined hold_cart_booking_slots() straight
-- back over this consent gate: a silent revert, no error, precisely the
-- failure the guard exists to catch (the guard itself would have fired first
-- here, since the columns wouldn't exist yet — but on an already-migrated
-- database it would have passed and then been overwritten). Renumbered to run
-- last on 2026-08-23. If the emergency set is ever renumbered again, this file
-- has to move with it.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'bookings'
       AND column_name = 'is_emergency_request'
  ) THEN
    RAISE EXCEPTION 'Run 20260821143821_emergency_booking_requests.sql first — this migration rebuilds hold_cart_booking_slots() on top of it and would otherwise drop its emergency-request handling.';
  END IF;
END $$;

-- ── 1. The hold gate ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hold_cart_booking_slots(p_hold_batch_id uuid, p_items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item JSONB;
  v_provider_id UUID;
  v_service_id UUID;
  v_emergency BOOLEAN;
  v_service public.services%ROWTYPE;
  v_safety_required BOOLEAN;
  v_safety_ack BOOLEAN;
  v_policy_accepted BOOLEAN;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_provider_id := (v_item->>'provider_id')::UUID;
    v_service_id  := NULLIF(v_item->>'service_id', '')::UUID;

    IF EXISTS (
      SELECT 1 FROM public.providers p
       WHERE p.id = v_provider_id AND p.user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'You can''t book your own provider profile.';
    END IF;

    -- Agreement to CERVICED's Terms and the provider's cancellation policy.
    -- One checkbox on the Confirm & Pay step gates the button that gets here,
    -- so a payload without it did not come from the app's own flow.
    v_policy_accepted := COALESCE((v_item->>'policy_accepted')::boolean, false);
    IF NOT v_policy_accepted THEN
      RAISE EXCEPTION 'Please agree to the booking terms before continuing';
    END IF;

    -- Whether an acknowledgement is required is the SERVICE's fact, read from
    -- the service row — a caller cannot talk its way out of the gate by
    -- omitting a flag. Mirrors prepare_checkout()'s derivation exactly.
    -- A hold with no service_id (a local/unresolved item) can't be checked
    -- against anything, so it carries no requirement rather than a guessed one.
    v_safety_required := false;
    IF v_service_id IS NOT NULL THEN
      SELECT s.* INTO v_service FROM public.services s WHERE s.id = v_service_id;
      IF FOUND THEN
        v_safety_required := COALESCE(v_service.patch_test_required, false)
          OR v_service.is_pregnancy_safe = false;
      END IF;
    END IF;

    v_safety_ack := COALESCE((v_item->>'safety_ack')::boolean, false);
    IF v_safety_required AND NOT v_safety_ack THEN
      RAISE EXCEPTION 'Please confirm you have seen this treatment''s safety information before continuing';
    END IF;

    v_emergency := COALESCE((v_item->>'is_emergency_request')::boolean, false);

    INSERT INTO public.bookings (
      user_id, provider_id, service_id, status,
      booking_date, booking_time, end_time,
      payment_type, base_price, add_ons_total, service_charge,
      deposit_amount, amount_paid, remaining_balance, payment_status,
      provider_name_snapshot, service_name_snapshot,
      hold_batch_id, hold_expires_at, is_emergency_request, emergency_ack_at,
      safety_ack_required, safety_ack_at, policy_accepted_at
    ) VALUES (
      auth.uid(),
      v_provider_id,
      v_service_id,
      'on_hold',
      (v_item->>'booking_date')::DATE,
      (v_item->>'booking_time')::TIME,
      (v_item->>'end_time')::TIME,
      'full', 0, 0, 0, 0, 0, 0, 'pending',
      'Reserving…', 'Reserving…',
      p_hold_batch_id, NOW() + INTERVAL '10 minutes',
      v_emergency, CASE WHEN v_emergency THEN now() ELSE NULL END,
      v_safety_required, CASE WHEN v_safety_required THEN now() ELSE NULL END,
      now()
    );
  END LOOP;
END;
$function$;

-- ── 2. The claim stops overwriting what the hold recorded ───────────────
-- policy_accepted_at is now owned by the hold, for the same reason
-- is_emergency_request already is: it records something that happened before
-- payment, and re-sending it from the client at claim time is what let a
-- retry write the previous attempt's timestamp over a correct one. The claim
-- keeps writing policy_snapshot — that is the policy's CONTENT, not evidence
-- of consent, and it is only known once the full item payload is assembled.
-- Everything else is reproduced verbatim.
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

    IF v_provider_user_id IS NOT NULL AND v_provider_user_id = auth.uid() THEN
      RAISE EXCEPTION 'You can''t book your own provider profile.';
    END IF;

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

COMMENT ON COLUMN public.bookings.policy_accepted_at IS
  'When the client agreed to CERVICED''s Terms and the provider''s cancellation policy, stamped from the database clock by hold_cart_booking_slots() at the moment of the pre-payment gate. Never supplied by the client. NULL on provider-created manual bookings, where no client ticked anything, and on rows created before 2026-08-23.';
