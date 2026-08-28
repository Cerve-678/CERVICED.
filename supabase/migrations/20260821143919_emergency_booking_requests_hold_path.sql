-- Emergency booking requests, part 3 of 5: the legacy (non-Stripe) hold path.
-- Introduced by 20260821143821_emergency_booking_requests.sql.
-- hold_cart_booking_slots() is what inserts the on_hold row on the pre-Stripe
-- checkout path, so it — not claim_cart_booking_slots() — is where
-- enforce_booking_bookability() actually fires. Without the flag here an
-- emergency request is rejected on that path with the very message the
-- opt-in exists to get past. Everything else is reproduced verbatim.
CREATE OR REPLACE FUNCTION public.hold_cart_booking_slots(p_hold_batch_id uuid, p_items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item JSONB;
  v_provider_id UUID;
  v_emergency BOOLEAN;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_provider_id := (v_item->>'provider_id')::UUID;

    IF EXISTS (
      SELECT 1 FROM public.providers p
       WHERE p.id = v_provider_id AND p.user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'You can''t book your own provider profile.';
    END IF;

    v_emergency := COALESCE((v_item->>'is_emergency_request')::boolean, false);

    INSERT INTO public.bookings (
      user_id, provider_id, service_id, status,
      booking_date, booking_time, end_time,
      payment_type, base_price, add_ons_total, service_charge,
      deposit_amount, amount_paid, remaining_balance, payment_status,
      provider_name_snapshot, service_name_snapshot,
      hold_batch_id, hold_expires_at, is_emergency_request, emergency_ack_at
    ) VALUES (
      auth.uid(),
      v_provider_id,
      NULLIF(v_item->>'service_id', '')::UUID,
      'on_hold',
      (v_item->>'booking_date')::DATE,
      (v_item->>'booking_time')::TIME,
      (v_item->>'end_time')::TIME,
      'full', 0, 0, 0, 0, 0, 0, 'pending',
      'Reserving…', 'Reserving…',
      p_hold_batch_id, NOW() + INTERVAL '10 minutes',
      v_emergency, CASE WHEN v_emergency THEN now() ELSE NULL END
    );
  END LOOP;
END;
$function$;
