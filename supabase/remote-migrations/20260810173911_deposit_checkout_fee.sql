-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260810173911
-- Remote name: deposit_checkout_fee
-- Do not edit this recovery archive; create a new tracked migration for changes.

-- A £0.99 Cerviced fee applies to an all-deposit checkout. It is added on
-- top of the provider's deposit and is never deducted from provider money.

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
  v_platform_fee := CASE WHEN v_deposit_only_checkout THEN 0.99
                         ELSE public.calculate_platform_fee(v_full_payment_subtotal) END;
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
$function$
