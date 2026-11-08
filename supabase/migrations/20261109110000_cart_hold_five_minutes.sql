-- A cart checkout now holds the client's slots for 5 minutes, not 10.
--
-- The hold is the on_hold booking row (bookings.hold_expires_at) plus the
-- checkout_batches row (expires_at) that prepare_checkout() writes when the
-- client taps Confirm & Pay. While it lasts, nobody else can book those times
-- (get_provider_busy_spans() counts a live hold as busy). After it, the slot is
-- free again and finalize_checkout() refuses the batch, so a payment that
-- finishes later is not turned into a booking (the app then says "Checkout has
-- expired. Please review your booking and try again.").
--
-- What changes:
--   1. prepare_checkout(): v_expiry is now + 5 minutes.
--   2. hold_cart_booking_slots(): the older hold path, + 5 minutes too.
--   3. checkout_batches.expires_at defaults to + 5 minutes.
--   4. The expire-cart-holds cron runs every minute instead of every 5, so a
--      5-minute hold is tidied up within a minute of running out rather than
--      sitting around for up to twice its own length. (Busy-time checks
--      already ignore an expired hold, so this is housekeeping, not the guard.)
--
-- Both functions are copied from live (pg_get_functiondef, 2026-11-08) with
-- only the interval changed. The md5 guards stop this from overwriting a newer
-- live version silently.

BEGIN;

DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.prepare_checkout(jsonb)'::regprocedure)) <> '31bcc5e005fb7996af178628791e1e76' THEN
    RAISE EXCEPTION 'prepare_checkout changed live since this migration was written; redo it from live';
  END IF;
  IF md5(pg_get_functiondef('public.hold_cart_booking_slots(uuid, jsonb)'::regprocedure)) <> '2e5b099f18ff86687a51de76acdbc166' THEN
    RAISE EXCEPTION 'hold_cart_booking_slots changed live since this migration was written; redo it from live';
  END IF;
END
$guard$;

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
  v_add_on_minutes integer;
  v_subtotal numeric(10,2);
  v_deposit numeric(10,2);
  v_due numeric(10,2) := 0;
  v_use_deposit boolean;
  v_deposit_type text;
  v_deposit_amount numeric(10,2);
  v_end_time time;
  v_user public.users%ROWTYPE;
  v_expiry timestamptz := now() + interval '5 minutes';
  v_daily_booking_cap integer;
  v_active_booking_count integer;
  v_safety_required boolean;
  v_safety_ack boolean;
  v_emergency boolean;
  v_emergency_ack boolean;
  v_stale_batch_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in is required'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one booking is required';
  END IF;
  IF jsonb_array_length(p_items) > 20 THEN RAISE EXCEPTION 'Too many bookings in one checkout'; END IF;

  SELECT u.* INTO v_user FROM public.users u WHERE u.id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Client profile was not found'; END IF;

  -- NEW: release the caller's own abandoned, unpaid checkouts that hold a
  -- slot with a provider on a date this checkout books (see header).
  FOR v_stale_batch_id IN
    SELECT DISTINCT cb.id
      FROM public.checkout_batches cb
      JOIN public.bookings b ON b.hold_batch_id = cb.id
     WHERE cb.user_id = auth.uid()
       AND cb.status = 'prepared'
       AND cb.payment_intent_id IS NULL
       AND b.status = 'on_hold'
       AND EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_items) AS i(value)
          WHERE NULLIF(i.value->>'provider_id', '')::uuid = b.provider_id
            AND NULLIF(i.value->>'booking_date', '')::date = b.booking_date
       )
  LOOP
    PERFORM public.cancel_checkout(v_stale_batch_id);
  END LOOP;

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
    -- Universal add-ons: an add-on can make the appointment longer, so its
    -- extra time is summed from the same rows that price it.
    SELECT COALESCE(sum(a.price), 0), COALESCE(sum(a.extra_minutes), 0)
      INTO v_add_ons_total, v_add_on_minutes
      FROM public.service_add_ons a
     WHERE a.service_id = v_service.id AND a.is_active = true
       AND a.id IN (SELECT e.value::uuid FROM jsonb_array_elements_text(v_add_on_ids) AS e(value));
    IF (SELECT count(*) FROM jsonb_array_elements_text(v_add_on_ids)) <>
       (SELECT count(*) FROM public.service_add_ons a WHERE a.service_id = v_service.id AND a.is_active = true
          AND a.id IN (SELECT e.value::uuid FROM jsonb_array_elements_text(v_add_on_ids) AS e(value))) THEN
      RAISE EXCEPTION 'One or more add-ons are unavailable';
    END IF;

    v_safety_required := COALESCE(v_service.patch_test_required, false)
      OR v_service.is_pregnancy_safe = false;
    v_safety_ack := COALESCE((v_item->>'safety_ack')::boolean, false);
    IF v_safety_required AND NOT v_safety_ack THEN
      RAISE EXCEPTION 'Please confirm you have seen this treatment''s safety information before continuing';
    END IF;

    v_emergency := COALESCE((v_item->>'emergency')::boolean, false);
    v_emergency_ack := COALESCE((v_item->>'emergency_ack')::boolean, false);
    IF v_emergency AND NOT v_emergency_ack THEN
      RAISE EXCEPTION 'Please confirm you have read this provider''s policy before requesting a time outside their availability';
    END IF;

    -- Mobile-address gate: a mobile provider travels TO the client, so a mobile
    -- booking with no client address is a provider sent nowhere. Fail closed
    -- here -- same shape as the two gates above. business_type is read from the
    -- provider row, never trusted from the client payload.
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
    v_end_time := (v_item->>'booking_time')::time + make_interval(mins => v_service.duration_minutes + v_add_on_minutes);

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
  v_booking_date DATE;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_provider_id := (v_item->>'provider_id')::UUID;
    v_service_id  := NULLIF(v_item->>'service_id', '')::UUID;
    v_booking_date := (v_item->>'booking_date')::DATE;

    IF EXISTS (
      SELECT 1 FROM public.providers p
       WHERE p.id = v_provider_id AND p.user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'You can''t book your own provider profile.';
    END IF;

    -- Clear this caller's OWN stranded cart holds on this provider and day
    -- before taking the slot. A client runs one checkout at a time, so any
    -- hold of theirs still sitting on this day from an earlier batch is an
    -- abandoned attempt — and bookings_no_overlap counts it, so without this
    -- a client retrying the time they just abandoned is rejected by their own
    -- leftover row (23P01, surfaced as "We couldn't reserve that time").
    --
    -- Same guards release_cart_booking_slots() uses: never touch a row that
    -- has money or a review attached. Scoped to hold_batch_id IS NOT NULL so
    -- reschedule holds (which carry none) survive, and to a DIFFERENT batch
    -- so the rows this very call is inserting are never candidates. Bounded
    -- to one provider and one date so a concurrent checkout of theirs
    -- elsewhere is left alone.
    DELETE FROM public.notifications n
     USING public.bookings b
     WHERE n.booking_id = b.id
       AND b.user_id = auth.uid()
       AND b.status = 'on_hold'
       AND b.hold_batch_id IS NOT NULL
       AND b.hold_batch_id <> p_hold_batch_id
       AND b.provider_id = v_provider_id
       AND b.booking_date = v_booking_date
       AND NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.booking_id = b.id)
       AND NOT EXISTS (SELECT 1 FROM public.reviews r WHERE r.booking_id = b.id);

    DELETE FROM public.bookings b
     WHERE b.user_id = auth.uid()
       AND b.status = 'on_hold'
       AND b.hold_batch_id IS NOT NULL
       AND b.hold_batch_id <> p_hold_batch_id
       AND b.provider_id = v_provider_id
       AND b.booking_date = v_booking_date
       AND NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.booking_id = b.id)
       AND NOT EXISTS (SELECT 1 FROM public.reviews r WHERE r.booking_id = b.id);

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
      v_booking_date,
      (v_item->>'booking_time')::TIME,
      (v_item->>'end_time')::TIME,
      'full', 0, 0, 0, 0, 0, 0, 'pending',
      'Reserving…', 'Reserving…',
      p_hold_batch_id, NOW() + INTERVAL '5 minutes',
      v_emergency, CASE WHEN v_emergency THEN now() ELSE NULL END,
      v_safety_required, CASE WHEN v_safety_required THEN now() ELSE NULL END,
      now()
    );
  END LOOP;
END;
$function$;

ALTER TABLE public.checkout_batches
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '5 minutes');

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'expire-cart-holds'),
  schedule := '* * * * *'
);

COMMIT;
