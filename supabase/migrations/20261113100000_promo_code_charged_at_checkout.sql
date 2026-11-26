-- A promo code the cart shows is now what the card is charged.
--
-- The cart validates a provider's promo code, shows "Promo Discount −£x" and
-- a lower total, but never sent the code to prepare_checkout(), which priced
-- every item from services.price. Since the payment sheet shows the server's
-- amount, a client who tapped a promotion's "Book Now" saw the discount in
-- the cart and was then charged full price.
--
-- prepare_checkout() now takes promo_code per item and re-validates it from
-- the database (provider's own code, case-insensitive, active, valid today
-- in UK time). An invalid or ended code is refused by name rather than
-- silently charged at full price; the cart re-checks codes before Confirm &
-- Pay and drops ended ones, so a retry goes through without it.
-- The discount follows the cart's own rule (itemPromoDiscounts in
-- CartScreen.tsx): percentage of service + add-ons, or a fixed amount,
-- capped at the service price, nothing outside the code's services/category.
--
-- Who pays for it: the provider, whose promotion it is. base_price is stored
-- discounted, so the platform fee, deposit, payout, late/no-show caps and
-- cancellation refunds all follow what was actually charged. The undiscounted
-- price is base_price + promo_discount; promotion_id records which code.
--
-- Redefined from live (20261113090000) with an md5 guard.

BEGIN;

DO $$
BEGIN
  IF md5(pg_get_functiondef('public.prepare_checkout(jsonb)'::regprocedure)) <> 'ca918dae9b6af9ddeb5b631e95a4eb56' THEN
    RAISE EXCEPTION 'prepare_checkout changed live since this migration was written; redo it from live';
  END IF;
END $$;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS promotion_id uuid REFERENCES public.promotions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS promo_discount numeric(10,2) NOT NULL DEFAULT 0
    CONSTRAINT bookings_promo_discount_not_negative CHECK (promo_discount >= 0);

COMMENT ON COLUMN public.bookings.promo_discount IS
  'Promo discount taken off base_price at checkout (base_price is stored after it). Set by prepare_checkout().';
COMMENT ON COLUMN public.bookings.promotion_id IS
  'The promotion whose code was redeemed on this booking, if any.';

-- Providers write promotions directly (promotions_owner_write). A negative
-- or over-100% value was ignored or capped at checkout, but it's never
-- meaningful; refuse it at the source. 0 rows broke these on 2026-11-13.
ALTER TABLE public.promotions
  ADD CONSTRAINT promotions_discount_percent_range CHECK (discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100)),
  ADD CONSTRAINT promotions_discount_amount_not_negative CHECK (discount_amount IS NULL OR discount_amount >= 0);

CREATE INDEX IF NOT EXISTS bookings_promotion_id_idx ON public.bookings (promotion_id) WHERE promotion_id IS NOT NULL;

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
  -- The provider's promo code, priced here (20261113100000).
  v_promo_code text;
  v_promo public.promotions%ROWTYPE;
  v_discount numeric(10,2);
  v_uk_today date := (now() AT TIME ZONE 'Europe/London')::date;
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

    -- Promo code. The cart shows the discount and used to send nothing, so the
    -- card was charged full price. Validated and priced here, never from the
    -- app: same rule as the cart's itemPromoDiscounts (CartScreen.tsx), a
    -- percentage of service + add-ons or a fixed amount, capped at the
    -- service price, and nothing for a service or category outside the
    -- code's scope. The provider funds it: base_price is stored discounted, so
    -- the fee, payout, deposit and refund maths all follow what was charged.
    v_discount := 0;
    v_promo := NULL;
    v_promo_code := NULLIF(btrim(v_item->>'promo_code'), '');
    IF v_promo_code IS NOT NULL THEN
      SELECT pr.* INTO v_promo
        FROM public.promotions pr
       WHERE pr.provider_id = v_provider.id
         AND lower(btrim(pr.promo_code)) = lower(v_promo_code)
         AND pr.is_active
         AND pr.valid_from <= v_uk_today
         AND pr.valid_until >= v_uk_today
       ORDER BY pr.created_at DESC
       LIMIT 1;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'The code % has ended or isn''t valid for %. Go back to your cart to see the price without it.',
          upper(v_promo_code), v_provider.display_name;
      END IF;
      IF (COALESCE(cardinality(v_promo.service_ids), 0) = 0 OR v_service.id = ANY (v_promo.service_ids))
         AND (NULLIF(btrim(v_promo.service_category), '') IS NULL
              OR upper(v_promo.service_category) = upper(COALESCE(v_provider.service_category, 'General'))) THEN
        v_discount := CASE
          WHEN COALESCE(v_promo.discount_percent, 0) > 0
            THEN round((v_service.price + v_add_ons_total) * v_promo.discount_percent / 100, 2)
          WHEN COALESCE(v_promo.discount_amount, 0) > 0 THEN round(v_promo.discount_amount, 2)
          ELSE 0 END;
        v_discount := GREATEST(0, LEAST(v_discount, v_service.price));
      END IF;
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

    v_subtotal := v_service.price - v_discount + v_add_ons_total;
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
      policy_snapshot, policy_accepted_at, promotion_id, promo_discount
    ) VALUES (
      auth.uid(), v_provider.id, v_service.id, 'on_hold', (v_item->>'booking_date')::date,
      (v_item->>'booking_time')::time, v_end_time, NULLIF(btrim(v_item->>'notes'), ''),
      CASE WHEN v_use_deposit THEN 'deposit' ELSE 'full' END, v_service.price - v_discount, v_add_ons_total, 0,
      v_deposit, CASE WHEN v_use_deposit THEN v_deposit ELSE v_subtotal END,
      CASE WHEN v_use_deposit THEN v_subtotal - v_deposit ELSE 0 END,
      CASE WHEN v_use_deposit THEN 'deposit_paid' ELSE 'fully_paid' END,
      v_provider.display_name, v_service.name, v_provider.service_category, v_provider.logo_url,
      v_user.name, v_user.email, v_user.phone, v_batch_id, v_expiry,
      v_safety_required, CASE WHEN v_safety_required THEN now() ELSE NULL END,
      v_emergency, CASE WHEN v_emergency THEN now() ELSE NULL END,
      CASE WHEN v_provider.business_type = 'mobile' THEN NULLIF(btrim(v_item->>'client_address'), '') ELSE NULL END,
      CASE WHEN v_provider.business_type = 'mobile' THEN NULLIF(btrim(v_item->>'client_area'), '') ELSE NULL END,
      v_policy_snapshot, now(),
      CASE WHEN v_discount > 0 THEN v_promo.id END, v_discount
    ) RETURNING id INTO v_booking_id;
    INSERT INTO public.checkout_batch_items (checkout_batch_id, booking_id, add_on_ids)
    VALUES (v_batch_id, v_booking_id, v_add_on_ids);
  END LOOP;

  -- A 100%-off code can leave nothing to charge, and Stripe can't take £0
  -- (create-payment-intent answers "Invalid amount"). Say so plainly instead.
  IF v_due <= 0 THEN
    RAISE EXCEPTION 'This comes to £0 after the promo code, so there''s nothing to pay by card. Ask the provider to add the booking for you.';
  END IF;

  UPDATE public.checkout_batches SET amount_due = v_due WHERE id = v_batch_id;
  RETURN QUERY SELECT v_batch_id, v_due, v_expiry;
END;
$function$
;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261113100000', 'promo_code_charged_at_checkout')
ON CONFLICT (version) DO NOTHING;

COMMIT;
