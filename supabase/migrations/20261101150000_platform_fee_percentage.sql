-- The platform fee becomes 5% of what the card is charged + 40p, at least
-- £1.99 and at most £24.99 (user, 2026-11-01). Replaces the £1.99 / £3.99 /
-- £5.99 tiers from 20261002140000_platform_fee_three_tier.
--
-- Why: the flat tiers lost money on larger bookings once Stripe's card fee
-- (~1.5% + 20p), PayPal through Stripe (~3.1% + 40p, not returned on a
-- refund) and the per-provider payout cost (0.25% + 10p) are counted. Today's
-- £5.99 on a £400 card booking loses about £1.40; on PayPal, about £8.10.
--
-- What changes:
--   1. calculate_platform_fee(amount) is the new formula. Its argument is now
--      what the card is charged before the fee. The parameter keeps its old
--      name because CREATE OR REPLACE can't rename one.
--   2. apply_checkout_platform_fee bases the fee on the whole in-app charge:
--      full prices for services paid in full PLUS deposits for deposit
--      services. Before, a deposit-only checkout was tiered on the FULL
--      service price, and in a mixed basket the deposit part counted for
--      nothing and its booking got no share of the fee.
--   3. The fee is shared across EVERY booking in the checkout by what that
--      booking is charged (the last booking, by id, takes the rounding
--      remainder), so each booking's service_charge is its own share.
--
-- Unchanged: deposits stay exactly the provider's amount (the fee sits on
-- top); payouts are still amount_paid - service_charge
-- (create_held_payout_on_finalize), so a deposit booking still pays out its
-- deposit; refunds still read the stored service_charge, so the existing rules
-- already work Uber-style (fee back on an early cancel or a provider
-- cancel/decline, kept on a late cancel or no-show).
--
-- Only checkouts prepared after this runs are affected: the trigger acts on a
-- 'prepared' batch whose fee is still 0. Existing bookings keep what they paid.
--
-- Redefined from the LIVE definitions (pg_get_functiondef, 2026-11-01), with
-- md5 guards that refuse to run if either has changed since.
-- Frontier at authoring: 20261101140000 (provider_public_directions); no
-- unapplied migration on any open PR branch or local worktree.
-- The file records its own version.

BEGIN;

DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.calculate_platform_fee(numeric)'::regprocedure))
       <> '933d066a764e585dbe5fef5100560074' THEN
    RAISE EXCEPTION 'calculate_platform_fee changed since this migration was written; re-derive it from live';
  END IF;
  IF md5(pg_get_functiondef('public.apply_checkout_platform_fee()'::regprocedure))
       <> 'ac15168df30d947a4ee3825989dff670' THEN
    RAISE EXCEPTION 'apply_checkout_platform_fee changed since this migration was written; re-derive it from live';
  END IF;
END
$guard$;

-- ── 1. the formula ─────────────────────────────────────────────────────────
-- Mirrors calculatePlatformFee in src/features/cart/platformFee.ts.
CREATE OR REPLACE FUNCTION public.calculate_platform_fee(p_full_payment_subtotal numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- p_full_payment_subtotal is what the card is charged before the fee
  -- (the old name is kept: CREATE OR REPLACE can't rename a parameter).
  SELECT CASE
    WHEN COALESCE(p_full_payment_subtotal, 0) <= 0 THEN 0
    ELSE LEAST(24.99, GREATEST(1.99, round(p_full_payment_subtotal * 0.05 + 0.40, 2)))
  END::numeric(10,2);
$function$;

-- ── 2. pricing a checkout ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_checkout_platform_fee()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_charged_subtotal numeric(10,2);
  v_platform_fee numeric(10,2);
  v_allocated numeric(10,2) := 0;
  v_booking public.bookings%ROWTYPE;
  v_charged numeric(10,2);
  v_item_fee numeric(10,2);
  v_remaining_count integer;
BEGIN
  IF NEW.status <> 'prepared' OR NEW.platform_fee <> 0 OR NEW.amount_due <= 0 THEN
    RETURN NEW;
  END IF;

  -- What the card is charged before the fee: the full price for a booking paid
  -- in full, the deposit for a deposit booking. Same sum prepare_checkout
  -- writes into amount_due.
  SELECT COALESCE(sum(CASE WHEN b.payment_type = 'deposit' THEN b.deposit_amount
                           ELSE b.base_price + b.add_ons_total END), 0),
         count(*)
    INTO v_charged_subtotal, v_remaining_count
    FROM public.bookings b
   WHERE b.hold_batch_id = NEW.id
     AND b.status = 'on_hold';

  v_platform_fee := public.calculate_platform_fee(v_charged_subtotal);
  IF v_platform_fee = 0 OR v_charged_subtotal <= 0 THEN RETURN NEW; END IF;

  FOR v_booking IN
    SELECT b.* FROM public.bookings b
     WHERE b.hold_batch_id = NEW.id
       AND b.status = 'on_hold'
     ORDER BY b.id FOR UPDATE
  LOOP
    v_remaining_count := v_remaining_count - 1;
    v_charged := CASE WHEN v_booking.payment_type = 'deposit' THEN v_booking.deposit_amount
                      ELSE v_booking.base_price + v_booking.add_ons_total END;
    v_item_fee := CASE WHEN v_remaining_count = 0 THEN v_platform_fee - v_allocated
      ELSE round(v_platform_fee * (v_charged / v_charged_subtotal), 2) END;
    v_allocated := v_allocated + v_item_fee;
    UPDATE public.bookings
       SET service_charge = v_item_fee,
           amount_paid = v_charged + v_item_fee,
           remaining_balance = CASE WHEN v_booking.payment_type = 'deposit'
                                    THEN (v_booking.base_price + v_booking.add_ons_total) - v_booking.deposit_amount
                                    ELSE 0 END
     WHERE id = v_booking.id;
  END LOOP;

  UPDATE public.checkout_batches
     SET platform_fee = v_platform_fee,
         amount_due = NEW.amount_due + v_platform_fee
   WHERE id = NEW.id;
  RETURN NEW;
END;
$function$;

-- Trigger function only; nothing should call it directly.
REVOKE EXECUTE ON FUNCTION public.apply_checkout_platform_fee() FROM PUBLIC, anon, authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261101150000', 'platform_fee_percentage')
ON CONFLICT (version) DO NOTHING;

COMMIT;
