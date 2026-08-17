-- A platform fee is a transparent checkout charge for services paid in full.
-- A provider's deposit is never used to pay it.

ALTER TABLE public.checkout_batches
  ADD COLUMN IF NOT EXISTS platform_fee numeric(10,2) NOT NULL DEFAULT 0
  CHECK (platform_fee >= 0);

CREATE OR REPLACE FUNCTION public.calculate_platform_fee(p_full_payment_subtotal numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $function$
  SELECT CASE
    WHEN COALESCE(p_full_payment_subtotal, 0) <= 0 THEN 0
    WHEN p_full_payment_subtotal < 50 THEN 1.99
    WHEN p_full_payment_subtotal < 100 THEN 3.99
    WHEN p_full_payment_subtotal < 200 THEN 5.99
    ELSE 9.99
  END::numeric(10,2);
$function$;

CREATE OR REPLACE FUNCTION public.apply_checkout_platform_fee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_eligible_subtotal numeric(10,2);
  v_platform_fee numeric(10,2);
  v_allocated numeric(10,2) := 0;
  v_booking public.bookings%ROWTYPE;
  v_item_fee numeric(10,2);
  v_remaining_count integer;
BEGIN
  -- Only act once, after prepare_checkout has written its canonical subtotal.
  IF NEW.status <> 'prepared' OR NEW.platform_fee <> 0 OR NEW.amount_due <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(sum(b.base_price + b.add_ons_total), 0)
    INTO v_eligible_subtotal
    FROM public.bookings b
   WHERE b.hold_batch_id = NEW.id
     AND b.status = 'on_hold'
     AND b.payment_type = 'full';
  v_platform_fee := public.calculate_platform_fee(v_eligible_subtotal);
  IF v_platform_fee = 0 THEN RETURN NEW; END IF;

  SELECT count(*) INTO v_remaining_count
    FROM public.bookings b
   WHERE b.hold_batch_id = NEW.id AND b.status = 'on_hold' AND b.payment_type = 'full';
  FOR v_booking IN
    SELECT b.* FROM public.bookings b
     WHERE b.hold_batch_id = NEW.id AND b.status = 'on_hold' AND b.payment_type = 'full'
     ORDER BY b.id
     FOR UPDATE
  LOOP
    v_remaining_count := v_remaining_count - 1;
    v_item_fee := CASE WHEN v_remaining_count = 0 THEN v_platform_fee - v_allocated
      ELSE round(v_platform_fee * ((v_booking.base_price + v_booking.add_ons_total) / v_eligible_subtotal), 2) END;
    v_allocated := v_allocated + v_item_fee;
    UPDATE public.bookings
       SET service_charge = v_item_fee,
           amount_paid = v_booking.base_price + v_booking.add_ons_total + v_item_fee,
           remaining_balance = 0
     WHERE id = v_booking.id;
  END LOOP;

  UPDATE public.checkout_batches
     SET platform_fee = v_platform_fee,
         amount_due = NEW.amount_due + v_platform_fee
   WHERE id = NEW.id;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS after_checkout_batch_price_platform_fee ON public.checkout_batches;
CREATE TRIGGER after_checkout_batch_price_platform_fee
  AFTER UPDATE OF amount_due ON public.checkout_batches
  FOR EACH ROW EXECUTE FUNCTION public.apply_checkout_platform_fee();

REVOKE ALL ON FUNCTION public.calculate_platform_fee(numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_platform_fee(numeric) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_checkout_platform_fee() FROM PUBLIC;
