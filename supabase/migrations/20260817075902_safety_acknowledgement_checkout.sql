-- Safety acknowledgement at checkout.
--
-- Client-facing services can carry patch_test_required / is_pregnancy_safe
-- flags. Until now these were only shown as passive text on the provider
-- profile — nothing recorded that a client actually saw them before booking.
--
-- This is a RELAY, not a CERVICED safety determination: the flags are
-- provider-authored service data, and the client is acknowledging having
-- seen the provider's stated requirement, not attesting to any fact about
-- their own health. Not a hard block — booking can still proceed once
-- acknowledged, mirroring the existing informed-consent posture elsewhere
-- in the app (Terms acceptance) rather than a verification/gating system.
--
-- min_age is deliberately NOT covered here — it can be a statutory minimum
-- (see LEGAL-COMPLIANCE-NOTES.md item 5) and needs its own DOB-verified
-- mechanism, not a soft acknowledgement checkbox. Out of scope by design.

-- Durable snapshot on the booking row, consistent with this table's existing
-- snapshot convention (service_name_snapshot, provider_name_snapshot, etc.)
-- — records WHICH flags were active and WHETHER acknowledgement was given,
-- not any inference about the client's own health status.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS safety_ack_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS safety_ack_at timestamptz;

COMMENT ON COLUMN public.bookings.safety_ack_required IS
  'True if the booked service had patch_test_required or is_pregnancy_safe=false at booking time — a snapshot of the provider''s stated requirement, not a claim about the client''s health.';
COMMENT ON COLUMN public.bookings.safety_ack_at IS
  'When the client acknowledged the provider''s safety requirement during checkout. Null if safety_ack_required is false (nothing to acknowledge) or if required but somehow not recorded (should not happen — prepare_checkout rejects that case).';

-- prepare_checkout now takes an optional safety_ack flag per item and
-- REJECTS server-side if the service requires acknowledgement and the
-- client didn't provide it — so the UI checkbox can't be bypassed by
-- calling the RPC directly. Everything else in the function is unchanged
-- from the live version; only the safety-ack read/check/write is new.
CREATE OR REPLACE FUNCTION public.prepare_checkout(p_items jsonb)
RETURNS TABLE(checkout_batch_id uuid, amount_due numeric, expires_at timestamptz)
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
      customer_phone, hold_batch_id, hold_expires_at, safety_ack_required, safety_ack_at
    ) VALUES (
      auth.uid(), v_provider.id, v_service.id, 'on_hold', (v_item->>'booking_date')::date,
      (v_item->>'booking_time')::time, v_end_time, NULLIF(btrim(v_item->>'notes'), ''),
      CASE WHEN v_use_deposit THEN 'deposit' ELSE 'full' END, v_service.price, v_add_ons_total, 0,
      v_deposit, CASE WHEN v_use_deposit THEN v_deposit ELSE v_subtotal END,
      CASE WHEN v_use_deposit THEN v_subtotal - v_deposit ELSE 0 END,
      CASE WHEN v_use_deposit THEN 'deposit_paid' ELSE 'fully_paid' END,
      v_provider.display_name, v_service.name, v_service.category_name, v_provider.logo_url,
      v_user.name, v_user.email, v_user.phone, v_batch_id, v_expiry,
      v_safety_required, CASE WHEN v_safety_required THEN now() ELSE NULL END
    ) RETURNING id INTO v_booking_id;
    INSERT INTO public.checkout_batch_items (checkout_batch_id, booking_id, add_on_ids)
    VALUES (v_batch_id, v_booking_id, v_add_on_ids);
  END LOOP;

  UPDATE public.checkout_batches SET amount_due = v_due WHERE id = v_batch_id;
  RETURN QUERY SELECT v_batch_id, v_due, v_expiry;
END;
$function$;

REVOKE ALL ON FUNCTION public.prepare_checkout(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prepare_checkout(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.prepare_checkout(jsonb) TO authenticated;

-- provider_create_manual_booking gets the same server-side gate. The
-- provider is the one who set these flags on their own service, so this is
-- a lighter-weight "confirm you've told the client" acknowledgement rather
-- than the client-facing checkbox — still recorded the same way so the two
-- paths agree on what a booking's safety_ack_* columns mean.
--
-- Everything else below is copied UNCHANGED from the live function
-- (confirmed via pg_get_functiondef before writing this) — including the
-- cerviced.bypass_working_hours squeeze-in escape hatch and the
-- remaining_balance = price + add_ons_total calc — only the safety-ack
-- read/check/write is new.
--
-- Adding a new trailing parameter to a CREATE OR REPLACE does NOT replace
-- the old signature — Postgres treats a different argument list as a
-- distinct overload, so the pre-existing 6-arg version stayed live
-- alongside this one, callable with the new safety check simply omitted.
-- Explicitly drop it so the 6-arg bypass never exists, even on a fresh
-- environment rebuilding from this migration file.
DROP FUNCTION IF EXISTS public.provider_create_manual_booking(uuid, uuid, date, time, text, uuid[]);

CREATE OR REPLACE FUNCTION public.provider_create_manual_booking(
  p_client_user_id uuid,
  p_service_id uuid,
  p_booking_date date,
  p_booking_time time,
  p_notes text DEFAULT NULL,
  p_add_on_ids uuid[] DEFAULT '{}',
  p_safety_ack boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_provider public.providers%ROWTYPE;
  v_service public.services%ROWTYPE;
  v_client public.users%ROWTYPE;
  v_booking_id uuid;
  v_end_time time;
  v_daily_booking_cap integer;
  v_active_booking_count integer;
  v_add_ons_total numeric(10,2) := 0;
  v_safety_required boolean;
BEGIN
  SELECT p.* INTO v_provider
    FROM public.providers p
   WHERE p.user_id = auth.uid()
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only the owning provider can add a booking';
  END IF;

  SELECT s.* INTO v_service
    FROM public.services s
   WHERE s.id = p_service_id
     AND s.provider_id = v_provider.id
     AND s.is_active = TRUE
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service is not active for this provider';
  END IF;

  SELECT u.* INTO v_client
    FROM public.users u
   WHERE u.id = p_client_user_id
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client account was not found';
  END IF;

  IF p_booking_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Booking date cannot be in the past';
  END IF;
  IF p_booking_time IS NULL THEN
    RAISE EXCEPTION 'Booking time is required';
  END IF;

  -- Safety acknowledgement gate — new.
  v_safety_required := COALESCE(v_service.patch_test_required, false)
    OR v_service.is_pregnancy_safe = false;
  IF v_safety_required AND NOT COALESCE(p_safety_ack, false) THEN
    RAISE EXCEPTION 'Please confirm the client has been told this treatment''s safety requirements';
  END IF;

  v_end_time := p_booking_time + make_interval(mins => v_service.duration_minutes);

  -- Server-resolved add-on total — never trust a client-sent price. Only
  -- add-ons that belong to this exact service and are still active count.
  IF p_add_on_ids IS NOT NULL AND array_length(p_add_on_ids, 1) > 0 THEN
    SELECT COALESCE(SUM(sao.price), 0) INTO v_add_ons_total
      FROM public.service_add_ons sao
     WHERE sao.id = ANY(p_add_on_ids)
       AND sao.service_id = p_service_id
       AND sao.is_active = TRUE;
  END IF;

  -- A provider's capacity is an additional guard on top of time overlap.
  v_daily_booking_cap := COALESCE(v_provider.max_bookings_per_day, 0);
  IF v_daily_booking_cap > 0 THEN
    SELECT count(*) INTO v_active_booking_count
      FROM public.bookings b
     WHERE b.provider_id = v_provider.id
       AND b.booking_date = p_booking_date
       AND b.status IN ('pending', 'confirmed', 'in_progress', 'on_hold');
    IF v_active_booking_count >= v_daily_booking_cap THEN
      RAISE EXCEPTION 'This provider has reached their booking limit for that date';
    END IF;
  END IF;

  -- Squeeze-in support: skip only the working-hours fit check, and only for
  -- this INSERT. Transaction-local, cannot affect any other statement.
  PERFORM set_config('cerviced.bypass_working_hours', 'on', true);

  INSERT INTO public.bookings (
    user_id, provider_id, service_id, status,
    booking_date, booking_time, end_time, notes,
    payment_type, base_price, add_ons_total, service_charge,
    deposit_amount, amount_paid, remaining_balance, payment_status,
    provider_name_snapshot, service_name_snapshot, service_category_snapshot,
    provider_logo_snapshot, customer_name, customer_email, customer_phone,
    safety_ack_required, safety_ack_at
  ) VALUES (
    v_client.id, v_provider.id, v_service.id, 'on_hold',
    p_booking_date, p_booking_time, v_end_time, NULLIF(btrim(p_notes), ''),
    'full', v_service.price, v_add_ons_total, 0,
    0, 0, v_service.price + v_add_ons_total, 'pending',
    v_provider.display_name, v_service.name, v_service.category_name,
    v_provider.logo_url, v_client.name, v_client.email, v_client.phone,
    v_safety_required, CASE WHEN v_safety_required THEN now() ELSE NULL END
  ) RETURNING id INTO v_booking_id;

  IF p_add_on_ids IS NOT NULL AND array_length(p_add_on_ids, 1) > 0 THEN
    INSERT INTO public.booking_add_ons (booking_id, add_on_id, name_snapshot, price_snapshot)
    SELECT v_booking_id, sao.id, sao.name, sao.price
      FROM public.service_add_ons sao
     WHERE sao.id = ANY(p_add_on_ids)
       AND sao.service_id = p_service_id
       AND sao.is_active = TRUE;
  END IF;

  UPDATE public.bookings
     SET status = 'confirmed', confirmed_at = now()
   WHERE id = v_booking_id;

  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
  VALUES (
    v_client.id, 'booking_confirmed', 'Booking Confirmed! 🎉',
    v_provider.display_name || ' booked your ' || v_service.name ||
      ' for ' || to_char(p_booking_date, 'DD Mon YYYY') ||
      ' at ' || to_char(p_booking_time, 'HH12:MI AM') || '.',
    'high', TRUE, v_booking_id, v_provider.id, 'client'
  );
  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
  VALUES (
    v_provider.user_id, 'booking_confirmed', 'Manual Booking Added',
    COALESCE(v_client.name, 'Client') || ' was added for ' || v_service.name ||
      ' on ' || to_char(p_booking_date, 'DD Mon YYYY') ||
      ' at ' || to_char(p_booking_time, 'HH12:MI AM') || '.',
    'medium', FALSE, v_booking_id, v_provider.id, 'provider'
  );

  RETURN v_booking_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.provider_create_manual_booking(uuid, uuid, date, time, text, uuid[], boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provider_create_manual_booking(uuid, uuid, date, time, text, uuid[], boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.provider_create_manual_booking(uuid, uuid, date, time, text, uuid[], boolean) TO authenticated;
