-- hold_cart_booking_slots() was inserting into bookings without
-- provider_name_snapshot/service_name_snapshot, both NOT NULL with no
-- default — every cart-checkout hold attempt failed with 23502, regardless
-- of date/time. Found live 2026-08-04 testing multi-provider cart checkout.
--
-- Fix: give the hold row placeholder values for these two columns.
-- claim_cart_booking_slots() already overwrites both with the real names on
-- payment success (see its UPDATE ... provider_name_snapshot = v_item->>...);
-- expire_cart_holds() cancels the row if it's never claimed. Either way the
-- placeholder is never shown to a user — this matches the original design
-- where hold rows are minimal/throwaway, not a new snapshot-resolution path.
--
-- Safe to re-run.

CREATE OR REPLACE FUNCTION public.hold_cart_booking_slots(p_hold_batch_id uuid, p_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item JSONB;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.bookings (
      user_id, provider_id, service_id, status,
      booking_date, booking_time, end_time,
      payment_type, base_price, add_ons_total, service_charge,
      deposit_amount, amount_paid, remaining_balance, payment_status,
      provider_name_snapshot, service_name_snapshot,
      hold_batch_id, hold_expires_at
    ) VALUES (
      auth.uid(),
      (v_item->>'provider_id')::UUID,
      NULLIF(v_item->>'service_id', '')::UUID,
      'on_hold',
      (v_item->>'booking_date')::DATE,
      (v_item->>'booking_time')::TIME,
      (v_item->>'end_time')::TIME,
      'full', 0, 0, 0, 0, 0, 0, 'pending',
      -- Placeholder — claim_cart_booking_slots() overwrites this with the
      -- real name on payment success; expire_cart_holds() cancels the row
      -- if it never gets claimed. Never shown to a user in either case.
      'Reserving…', 'Reserving…',
      p_hold_batch_id, NOW() + INTERVAL '10 minutes'
    );
  END LOOP;
END;
$function$
