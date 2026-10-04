-- Platform fee restructure (user decision, 2026-10-03). Two coordinated changes:
--
--  1. calculate_platform_fee: simplify the pay-in-full scale to three tiers:
--       under £100      -> £1.99
--       £100 to £300    -> £3.99   (inclusive of £300)
--       above £300      -> £5.99
--     (replaces the old 1.99 / 3.99 / 5.99 / 9.99 at 50 / 100 / 200 thresholds).
--
--  2. apply_checkout_platform_fee: deposit-only checkouts no longer pay a flat
--     £0.99. They now use the SAME tiers, based on the FULL service price of the
--     deposit bookings (base_price + add_ons), not the deposit amount. The fee is
--     still added on top of the deposit and allocated across the deposit bookings.
--
-- Both functions reproduced from their committed definitions
-- (20260810174528 and 20260810173911); the only changes are the CASE bands and
-- the deposit fee basis. SECURITY DEFINER, IMMUTABLE, search_path and the REVOKEs
-- are preserved.
--
-- CAVEAT: written while the Supabase MCP connection was down, so this is based on
-- the function FILES, not a live pg_get_functiondef. Before applying, confirm the
-- live bodies match these (only the noted lines should differ), and number this
-- above max(version) in supabase_migrations.schema_migrations, per
-- supabase/MIGRATION_OWNER.md.

-- 1) Three-tier scale --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_platform_fee(p_full_payment_subtotal numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $function$
  SELECT CASE
    WHEN COALESCE(p_full_payment_subtotal, 0) <= 0 THEN 0
    WHEN p_full_payment_subtotal < 100 THEN 1.99
    WHEN p_full_payment_subtotal <= 300 THEN 3.99
    ELSE 5.99
  END::numeric(10,2);
$function$;

REVOKE ALL ON FUNCTION public.calculate_platform_fee(numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_platform_fee(numeric) FROM anon, authenticated;

-- 2) Deposit-only checkouts use the tiers, based on full service price --------
CREATE OR REPLACE FUNCTION public.apply_checkout_platform_fee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_full_payment_subtotal numeric(10,2);
  v_fee_allocation_subtotal numeric(10,2);
  v_platform_fee numeric(10,2);
  v_allocated numeric(10,2) := 0;
  v_booking public.bookings%ROWTYPE;
  v_item_fee numeric(10,2);
  v_remaining_count integer;
  v_deposit_only_checkout boolean;
  v_tier_basis numeric(10,2);
BEGIN
  IF NEW.status <> 'prepared' OR NEW.platform_fee <> 0 OR NEW.amount_due <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(sum(b.base_price + b.add_ons_total), 0)
    INTO v_full_payment_subtotal
    FROM public.bookings b
   WHERE b.hold_batch_id = NEW.id
     AND b.status = 'on_hold'
     AND b.payment_type = 'full';
  v_deposit_only_checkout := v_full_payment_subtotal = 0 AND EXISTS (
    SELECT 1 FROM public.bookings b
     WHERE b.hold_batch_id = NEW.id AND b.status = 'on_hold' AND b.payment_type = 'deposit'
  );

  -- Fee tier basis: full-payment subtotal normally; for a deposit-only checkout,
  -- the full service price of the deposit bookings (so deposits are tiered too).
  IF v_deposit_only_checkout THEN
    SELECT COALESCE(sum(b.base_price + b.add_ons_total), 0)
      INTO v_tier_basis
      FROM public.bookings b
     WHERE b.hold_batch_id = NEW.id
       AND b.status = 'on_hold'
       AND b.payment_type = 'deposit';
  ELSE
    v_tier_basis := v_full_payment_subtotal;
  END IF;
  v_platform_fee := public.calculate_platform_fee(v_tier_basis);
  IF v_platform_fee = 0 THEN RETURN NEW; END IF;

  SELECT COALESCE(sum(b.base_price + b.add_ons_total), 0)
    INTO v_fee_allocation_subtotal
    FROM public.bookings b
   WHERE b.hold_batch_id = NEW.id
     AND b.status = 'on_hold'
     AND (b.payment_type = 'full' OR v_deposit_only_checkout);
  SELECT count(*) INTO v_remaining_count
    FROM public.bookings b
   WHERE b.hold_batch_id = NEW.id
     AND b.status = 'on_hold'
     AND (b.payment_type = 'full' OR v_deposit_only_checkout);

  FOR v_booking IN
    SELECT b.* FROM public.bookings b
     WHERE b.hold_batch_id = NEW.id
       AND b.status = 'on_hold'
       AND (b.payment_type = 'full' OR v_deposit_only_checkout)
     ORDER BY b.id FOR UPDATE
  LOOP
    v_remaining_count := v_remaining_count - 1;
    v_item_fee := CASE WHEN v_remaining_count = 0 THEN v_platform_fee - v_allocated
      ELSE round(v_platform_fee * ((v_booking.base_price + v_booking.add_ons_total) / v_fee_allocation_subtotal), 2) END;
    v_allocated := v_allocated + v_item_fee;
    UPDATE public.bookings
       SET service_charge = v_item_fee,
           amount_paid = CASE WHEN v_deposit_only_checkout THEN v_booking.deposit_amount + v_item_fee
                              ELSE v_booking.base_price + v_booking.add_ons_total + v_item_fee END,
           remaining_balance = CASE WHEN v_deposit_only_checkout THEN (v_booking.base_price + v_booking.add_ons_total) - v_booking.deposit_amount
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
