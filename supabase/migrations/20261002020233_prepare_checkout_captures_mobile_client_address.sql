-- 20261002020233_prepare_checkout_captures_mobile_client_address.sql
--
-- APPLIED 2026-10-02 via apply_migration (recorded version 20261002020233;
-- authored 20260929061000, renamed to the stamped version). Verified live:
-- mobile gate present, client_address/client_area in the INSERT, SECURITY
-- DEFINER + search_path 'public','pg_temp' intact, anon cannot EXECUTE.
-- See supabase/MIGRATION_OWNER.md.
--
-- Teaches the Stripe checkout path to capture the client's address for a mobile
-- booking -- the prerequisite the guard migration 20260929060000 calls for.
--
-- THE GAP. On the live (mock) route the address is written at CLAIM time:
-- claim_cart_booking_slots() sets bookings.client_address, and the
-- on_booking_client_address_written trigger relocates it into
-- booking_client_addresses. The Stripe route never runs the claim -- it holds
-- via prepare_checkout() and promotes via finalize_checkout() -- and neither
-- touched client_address, so a mobile booking taken through Stripe would reach
-- the provider with no destination (verified live 2026-10-01). USE_STRIPE_PAYMENTS
-- is off today, so this is a latent gap, not a live bug.
--
-- THE FIX, in prepare_checkout() -- the Stripe path's hold step, the twin of
-- claim_cart_booking_slots():
--   1. A fail-closed gate, the same shape as the safety-ack and emergency-ack
--      gates already here: a mobile provider's item with no client_address is
--      rejected before any hold is created or any payment intent exists.
--   2. The held row is inserted WITH client_address / client_area (only for a
--      mobile provider; business_type is read server-side from the provider row,
--      not trusted from the client). The existing on_booking_client_address_written
--      trigger then relocates it into booking_client_addresses at insert time,
--      so finalize_checkout() needs no change -- by the time it promotes the hold
--      to confirmed, the address is already in the gated table.
--
-- Reproduced verbatim from the verified-live pg_get_functiondef() on 2026-10-01;
-- the ONLY changes are the mobile gate and the two new INSERT columns. LANGUAGE,
-- SECURITY DEFINER and `SET search_path TO 'public', 'pg_temp'` are preserved
-- exactly. apply_migration restamps the version -- rename this file and record
-- it in MIGRATION_OWNER.md; re-fetch pg_get_functiondef() afterwards to confirm
-- only those deltas landed.

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

    -- Mobile-address gate: a mobile provider travels TO the client, so a mobile
    -- booking with no client address is a provider sent nowhere. Fail closed
    -- here -- the same shape as the two gates above -- so the Stripe path can't
    -- create a mobile hold without one. business_type is read from the provider
    -- row (v_provider), never trusted from the client payload.
    IF v_provider.business_type = 'mobile'
       AND NULLIF(btrim(v_item->>'client_address'), '') IS NULL THEN
      RAISE EXCEPTION 'A mobile booking needs the client''s address before payment';
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
      is_emergency_request, emergency_ack_at, client_address, client_area
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
      v_emergency, CASE WHEN v_emergency THEN now() ELSE NULL END,
      -- Only a mobile provider's booking carries an address; the
      -- on_booking_client_address_written trigger relocates it into
      -- booking_client_addresses and nulls this funnel column immediately.
      CASE WHEN v_provider.business_type = 'mobile' THEN NULLIF(btrim(v_item->>'client_address'), '') ELSE NULL END,
      CASE WHEN v_provider.business_type = 'mobile' THEN NULLIF(btrim(v_item->>'client_area'), '') ELSE NULL END
    ) RETURNING id INTO v_booking_id;
    INSERT INTO public.checkout_batch_items (checkout_batch_id, booking_id, add_on_ids)
    VALUES (v_batch_id, v_booking_id, v_add_on_ids);
  END LOOP;

  UPDATE public.checkout_batches SET amount_due = v_due WHERE id = v_batch_id;
  RETURN QUERY SELECT v_batch_id, v_due, v_expiry;
END;
$function$;
