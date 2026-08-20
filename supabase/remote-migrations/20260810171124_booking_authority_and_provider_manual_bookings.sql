-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260810171124
-- Remote name: booking_authority_and_provider_manual_bookings
-- Do not edit this recovery archive; create a new tracked migration for changes.

-- Booking authority and provider-created bookings.
--
-- This migration is deliberately additive: the app moves to the secured
-- checkout route before legacy client writes are revoked in a later release.

CREATE OR REPLACE FUNCTION public.provider_create_manual_booking(
  p_client_user_id uuid,
  p_service_id uuid,
  p_booking_date date,
  p_booking_time time,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_provider public.providers%ROWTYPE;
  v_service public.services%ROWTYPE;
  v_client public.users%ROWTYPE;
  v_booking_id uuid;
  v_end_time time;
  v_daily_booking_cap integer;
  v_active_booking_count integer;
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

  v_end_time := p_booking_time + make_interval(mins => v_service.duration_minutes);

  -- A provider's capacity is an additional guard on top of time overlap.
  -- Count the same active states used by the booking availability trigger.
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

  -- Insert as a hold first so the normal booking-created trigger stays quiet;
  -- the function then atomically promotes it and emits the correct pair of
  -- notifications below. Existing schedule and no-overlap triggers run on
  -- both statements and remain the final authority.
  INSERT INTO public.bookings (
    user_id, provider_id, service_id, status,
    booking_date, booking_time, end_time, notes,
    payment_type, base_price, add_ons_total, service_charge,
    deposit_amount, amount_paid, remaining_balance, payment_status,
    provider_name_snapshot, service_name_snapshot, service_category_snapshot,
    provider_logo_snapshot, customer_name, customer_email, customer_phone
  ) VALUES (
    v_client.id, v_provider.id, v_service.id, 'on_hold',
    p_booking_date, p_booking_time, v_end_time, NULLIF(btrim(p_notes), ''),
    'full', v_service.price, 0, 0,
    0, 0, v_service.price, 'pending',
    v_provider.display_name, v_service.name, v_service.category_name,
    v_provider.logo_url, v_client.name, v_client.email, v_client.phone
  ) RETURNING id INTO v_booking_id;

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
$function$

REVOKE ALL ON FUNCTION public.provider_create_manual_booking(uuid, uuid, date, time, text) FROM PUBLIC

REVOKE EXECUTE ON FUNCTION public.provider_create_manual_booking(uuid, uuid, date, time, text) FROM anon

GRANT EXECUTE ON FUNCTION public.provider_create_manual_booking(uuid, uuid, date, time, text) TO authenticated

-- ── Server-owned checkout batches ─────────────────────────────────────────
-- The client submits intent only (service, add-ons, date/time, notes and a
-- deposit preference). Prices, duration, status and all snapshots are read
-- from the database and therefore cannot be changed by a modified client.

CREATE TABLE IF NOT EXISTS public.checkout_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'prepared'
    CHECK (status IN ('prepared', 'finalised', 'expired', 'cancelled')),
  currency text NOT NULL DEFAULT 'gbp',
  amount_due numeric(10,2) NOT NULL CHECK (amount_due >= 0),
  payment_intent_id text UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  created_at timestamptz NOT NULL DEFAULT now(),
  finalised_at timestamptz
)

CREATE INDEX IF NOT EXISTS idx_checkout_batches_owner_active
  ON public.checkout_batches(user_id, status, expires_at)

CREATE TABLE IF NOT EXISTS public.checkout_batch_items (
  checkout_batch_id uuid NOT NULL REFERENCES public.checkout_batches(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  add_on_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (checkout_batch_id, booking_id)
)

ALTER TABLE public.checkout_batches ENABLE ROW LEVEL SECURITY

ALTER TABLE public.checkout_batch_items ENABLE ROW LEVEL SECURITY

DROP POLICY IF EXISTS "checkout batches owner read" ON public.checkout_batches

CREATE POLICY "checkout batches owner read" ON public.checkout_batches
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id)

DROP POLICY IF EXISTS "checkout batch items owner read" ON public.checkout_batch_items

CREATE POLICY "checkout batch items owner read" ON public.checkout_batch_items
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.checkout_batches b
      WHERE b.id = checkout_batch_items.checkout_batch_id
        AND b.user_id = (select auth.uid()))
  )

CREATE OR REPLACE FUNCTION public.prepare_checkout(p_items jsonb)
RETURNS TABLE(checkout_batch_id uuid, amount_due numeric, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
      customer_phone, hold_batch_id, hold_expires_at
    ) VALUES (
      auth.uid(), v_provider.id, v_service.id, 'on_hold', (v_item->>'booking_date')::date,
      (v_item->>'booking_time')::time, v_end_time, NULLIF(btrim(v_item->>'notes'), ''),
      CASE WHEN v_use_deposit THEN 'deposit' ELSE 'full' END, v_service.price, v_add_ons_total, 0,
      v_deposit, CASE WHEN v_use_deposit THEN v_deposit ELSE v_subtotal END,
      CASE WHEN v_use_deposit THEN v_subtotal - v_deposit ELSE 0 END,
      CASE WHEN v_use_deposit THEN 'deposit_paid' ELSE 'fully_paid' END,
      v_provider.display_name, v_service.name, v_service.category_name, v_provider.logo_url,
      v_user.name, v_user.email, v_user.phone, v_batch_id, v_expiry
    ) RETURNING id INTO v_booking_id;
    INSERT INTO public.checkout_batch_items (checkout_batch_id, booking_id, add_on_ids)
    VALUES (v_batch_id, v_booking_id, v_add_on_ids);
  END LOOP;

  UPDATE public.checkout_batches SET amount_due = v_due WHERE id = v_batch_id;
  RETURN QUERY SELECT v_batch_id, v_due, v_expiry;
END;
$function$

CREATE OR REPLACE FUNCTION public.finalize_checkout(p_checkout_batch_id uuid, p_payment_intent_id text)
RETURNS TABLE(booking_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
           ELSE 'Your request with ' || v_booking.provider_name_snapshot || ' is awaiting confirmation.' END,
      'high', true, v_booking.id, v_booking.provider_id, 'client');
    IF v_provider_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
      VALUES (v_provider_user_id, CASE WHEN v_auto_accept THEN 'booking_confirmed' ELSE 'booking_pending' END,
        CASE WHEN v_auto_accept THEN 'New Booking' ELSE 'New Booking Request' END,
        COALESCE(v_booking.customer_name, 'A client') || ' booked ' || v_booking.service_name_snapshot || '.',
        'high', NOT v_auto_accept, v_booking.id, v_booking.provider_id, 'provider');
    END IF;
    booking_id := v_booking.id; RETURN NEXT;
  END LOOP;
  UPDATE public.checkout_batches SET status = 'finalised', finalised_at = now() WHERE id = v_batch.id;
END;
$function$

CREATE OR REPLACE FUNCTION public.expire_checkout_batches()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  UPDATE public.checkout_batches
     SET status = 'expired'
   WHERE status = 'prepared'
     AND expires_at <= now();
$function$

CREATE OR REPLACE FUNCTION public.cancel_checkout(p_checkout_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in is required'; END IF;

  UPDATE public.checkout_batches
     SET status = 'cancelled'
   WHERE id = p_checkout_batch_id
     AND user_id = auth.uid()
     AND status = 'prepared';

  IF NOT FOUND THEN RETURN; END IF;
  UPDATE public.bookings
     SET status = 'cancelled'
   WHERE hold_batch_id = p_checkout_batch_id
     AND status = 'on_hold';
END;
$function$

REVOKE ALL ON FUNCTION public.prepare_checkout(jsonb) FROM PUBLIC

REVOKE EXECUTE ON FUNCTION public.prepare_checkout(jsonb) FROM anon

GRANT EXECUTE ON FUNCTION public.prepare_checkout(jsonb) TO authenticated

REVOKE ALL ON FUNCTION public.finalize_checkout(uuid, text) FROM PUBLIC

REVOKE EXECUTE ON FUNCTION public.finalize_checkout(uuid, text) FROM anon, authenticated

GRANT EXECUTE ON FUNCTION public.finalize_checkout(uuid, text) TO service_role

REVOKE ALL ON FUNCTION public.expire_checkout_batches() FROM PUBLIC

REVOKE EXECUTE ON FUNCTION public.expire_checkout_batches() FROM anon, authenticated

GRANT EXECUTE ON FUNCTION public.expire_checkout_batches() TO service_role

REVOKE ALL ON FUNCTION public.cancel_checkout(uuid) FROM PUBLIC

REVOKE EXECUTE ON FUNCTION public.cancel_checkout(uuid) FROM anon

GRANT EXECUTE ON FUNCTION public.cancel_checkout(uuid) TO authenticated
