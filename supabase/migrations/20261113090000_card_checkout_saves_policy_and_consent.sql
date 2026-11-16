-- Card checkouts record the policy the client agreed to, and when.
--
-- prepare_checkout() (the Stripe route, USE_STRIPE_PAYMENTS) never wrote
-- bookings.policy_snapshot or bookings.policy_accepted_at: 0 of 94 card-paid
-- bookings had either on 2026-11-13. apply-cancellation-refund falls back to
-- the provider's CURRENT policy when the snapshot is missing, so a provider
-- who tightened their cancellation penalty after a booking was made could
-- keep more of that client's money than the client agreed to.
--
-- Now, per item:
--   * consent: refuses without policy_accepted, like hold_cart_booking_slots()
--     (older builds send the same checkbox as safety_ack, which stands in),
--     and stamps policy_accepted_at from the database clock;
--   * policy: freezes the provider's LIVE booking_policies (never the app's
--     copy) into policy_snapshot, plus their written terms when the client's
--     own copy shows they agreed to them in the booking sheet;
--   * drift: when the app sends the copy the cart showed and a money term
--     (cancel window/penalty/fee, deposit settings, late/no-show fee) or the
--     written terms differ from live, refuses with the provider's and
--     service's names, so nobody is charged under terms they never saw.
--
-- Known gap: the cancel window a booking is frozen with comes from
-- cancel_notice_hours(providers.cancellation_notice_hours, booking_policies),
-- which prefers the column; the app's copy only carries cancelNotice, so a
-- change to the column alone isn't caught here. On 2026-11-13 four live
-- providers' column and cancelNotice disagreed; that's tracked separately.
--
-- Existing bookings are not backfilled: today's policy isn't what they
-- agreed to, and the refund function already falls back to it.
--
-- Redefined from live with an md5 guard. feat/waitlist-pay-at-confirm
-- (#474) also redefines prepare_checkout; whichever applies second rebuilds
-- on the other's live version.

BEGIN;

DO $$
BEGIN
  IF md5(pg_get_functiondef('public.prepare_checkout(jsonb)'::regprocedure)) <> 'b781dde02286e477413e34e2313c562d' THEN
    RAISE EXCEPTION 'prepare_checkout changed live since this migration was written; redo it from live';
  END IF;
  IF md5(pg_get_functiondef('public.get_provider_terms(uuid)'::regprocedure)) <> '9700032904eb71572a5f2ecad1146ba5' THEN
    RAISE EXCEPTION 'get_provider_terms changed live since this migration was written; recheck the terms comparison';
  END IF;
END $$;

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
  -- Consent and the policy it was given to (20261113090000).
  v_policy_accepted boolean;
  v_policies jsonb;
  v_client_snapshot jsonb;
  v_terms_title text;
  v_terms_body text;
  v_agreed_terms boolean;
  v_policy_snapshot jsonb;
  v_key text;
  v_seen jsonb;
  v_live jsonb;
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

    -- Agreement to CERVICED's Terms and the provider's cancellation policy:
    -- the Confirm & Pay checkbox gates the button that gets here. Builds from
    -- before 20261113090000 send that same checkbox only as safety_ack (the
    -- cart sets safety_ack := agreedToPolicy), so it stands in when
    -- policy_accepted is absent. Same refusal as hold_cart_booking_slots().
    v_policy_accepted := COALESCE((v_item->>'policy_accepted')::boolean,
                                  (v_item->>'safety_ack')::boolean, false);
    IF NOT v_policy_accepted THEN
      RAISE EXCEPTION 'Please agree to the booking terms before continuing';
    END IF;

    -- The policy this booking is judged by is the provider's live one, read
    -- here, never the app's copy: apply-cancellation-refund reads
    -- cancelPenalty / cancelCustomFee / depositNonRefundable from it. The cart
    -- shows the client the copy frozen when the item was added (e.g. the
    -- non-refundable deposit notice), so when the app sends that copy and any
    -- money term differs from live, the client never saw the terms they would
    -- be charged under: refuse rather than bind them to it.
    v_policies := CASE WHEN jsonb_typeof(v_provider.booking_policies) = 'object'
                       THEN v_provider.booking_policies END;
    v_client_snapshot := CASE WHEN jsonb_typeof(v_item->'policy_snapshot') = 'object'
                              THEN v_item->'policy_snapshot' END;
    SELECT t.title, t.body INTO v_terms_title, v_terms_body
      FROM public.get_provider_terms(v_provider.id) AS t;
    IF v_client_snapshot IS NOT NULL THEN
      FOREACH v_key IN ARRAY ARRAY['cancelNotice', 'cancelPenalty', 'cancelCustomFee',
          'depositNonRefundable', 'depositMode', 'depositRequired', 'depositOnly',
          'depositType', 'depositAmount', 'lateFee', 'noShowFee']
      LOOP
        -- Absent, JSON null and "" all mean "not set", so a copy that
        -- dropped an empty key isn't mistaken for a changed policy.
        v_seen := v_client_snapshot->v_key;
        v_live := v_policies->v_key;
        IF v_seen IN ('null'::jsonb, '""'::jsonb) THEN v_seen := NULL; END IF;
        IF v_live IN ('null'::jsonb, '""'::jsonb) THEN v_live := NULL; END IF;
        IF v_seen IS DISTINCT FROM v_live THEN
          RAISE EXCEPTION '% changed their booking policy after you added %. Remove it from your cart and add it again to see the new policy.',
            v_provider.display_name, v_service.name;
        END IF;
      END LOOP;
      -- The provider's own written terms, agreed to in the booking sheet.
      IF v_client_snapshot ? 'providerTerms'
         AND (v_client_snapshot->'providerTerms'->>'body') IS DISTINCT FROM v_terms_body THEN
        RAISE EXCEPTION '% changed their terms after you added %. Remove it from your cart and add it again to see the new terms.',
          v_provider.display_name, v_service.name;
      END IF;
    END IF;
    -- Terms are recorded only when the client's own copy shows they agreed to
    -- them (Quick Book and older builds never showed them).
    v_agreed_terms := v_client_snapshot IS NOT NULL
      AND v_client_snapshot ? 'providerTerms' AND v_terms_body IS NOT NULL;
    -- Same shape buildPolicySnapshot() (src/utils/policyDisplay.ts) writes.
    v_policy_snapshot := CASE
      WHEN v_policies IS NULL AND NOT v_agreed_terms THEN NULL
      ELSE COALESCE(v_policies, '{}'::jsonb)
        || CASE WHEN v_agreed_terms
                THEN jsonb_build_object('providerTerms', jsonb_build_object(
                       'title', COALESCE(v_terms_title, 'Terms & Conditions'), 'body', v_terms_body))
                ELSE '{}'::jsonb END
    END;

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
      is_emergency_request, emergency_ack_at, client_address, client_area,
      policy_snapshot, policy_accepted_at
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
      CASE WHEN v_provider.business_type = 'mobile' THEN NULLIF(btrim(v_item->>'client_area'), '') ELSE NULL END,
      v_policy_snapshot, now()
    ) RETURNING id INTO v_booking_id;
    INSERT INTO public.checkout_batch_items (checkout_batch_id, booking_id, add_on_ids)
    VALUES (v_batch_id, v_booking_id, v_add_on_ids);
  END LOOP;

  UPDATE public.checkout_batches SET amount_due = v_due WHERE id = v_batch_id;
  RETURN QUERY SELECT v_batch_id, v_due, v_expiry;
END;
$function$
;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261113090000', 'card_checkout_saves_policy_and_consent')
ON CONFLICT (version) DO NOTHING;

COMMIT;
