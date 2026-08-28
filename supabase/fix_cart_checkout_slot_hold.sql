-- Recovered 2026-08-08 from the active Cerviced Supabase project.
--
-- The original deployed migration was absent from this repository *and* is
-- not represented in the linked project's Supabase migration-history table.
-- Its active contract was recovered by querying the linked project's columns,
-- status constraint, pg_cron job and pg_get_functiondef() for all cart-hold
-- functions. This is deliberately the active final contract, not a guessed
-- reconstruction of an untraceable historical first draft.
--
-- The two later follow-up files remain safe to run after this file:
-- - fix_hold_cart_booking_slots_missing_snapshots.sql
-- - fix_claim_cart_booking_slots_ambiguous_column.sql

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS hold_batch_id UUID,
  ADD COLUMN IF NOT EXISTS hold_expires_at TIMESTAMPTZ;

-- Cart checkout holds use the same temporary `on_hold` state as waitlist
-- holds. Make this base requirement explicit so a fresh schema accepts a hold
-- before either workflow writes one.
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_status_check CHECK (status IN (
    'pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show', 'on_hold'
  ));

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
      'Reserving…', 'Reserving…',
      p_hold_batch_id, NOW() + INTERVAL '10 minutes'
    );
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_cart_booking_slots(p_hold_batch_id uuid, p_items jsonb)
RETURNS TABLE(provider_id uuid, booking_date date, booking_time time without time zone, booking_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item JSONB;
  v_provider_id UUID;
  v_booking_date DATE;
  v_booking_time TIME;
  v_claimed_id UUID;
  v_auto_accept BOOLEAN;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_provider_id := (v_item->>'provider_id')::UUID;
    v_booking_date := (v_item->>'booking_date')::DATE;
    v_booking_time := (v_item->>'booking_time')::TIME;

    SELECT COALESCE(auto_accept_bookings, FALSE) INTO v_auto_accept
      FROM public.providers WHERE id = v_provider_id;

    UPDATE public.bookings SET
      status = CASE WHEN v_auto_accept THEN 'confirmed' ELSE 'pending' END,
      hold_expires_at = NULL,
      hold_batch_id = NULL,
      service_id = NULLIF(v_item->>'service_id', '')::UUID,
      end_time = (v_item->>'end_time')::TIME,
      notes = v_item->>'notes',
      booking_instructions = NULL,
      payment_type = v_item->>'payment_type',
      base_price = (v_item->>'base_price')::NUMERIC,
      add_ons_total = (v_item->>'add_ons_total')::NUMERIC,
      service_charge = (v_item->>'service_charge')::NUMERIC,
      deposit_amount = (v_item->>'deposit_amount')::NUMERIC,
      amount_paid = (v_item->>'amount_paid')::NUMERIC,
      remaining_balance = (v_item->>'remaining_balance')::NUMERIC,
      payment_status = v_item->>'payment_status',
      payment_method = v_item->>'payment_method',
      payment_intent_id = v_item->>'payment_intent_id',
      is_group_booking = COALESCE((v_item->>'is_group_booking')::BOOLEAN, FALSE),
      group_booking_id = NULLIF(v_item->>'group_booking_id', '')::UUID,
      group_booking_count = COALESCE((v_item->>'group_booking_count')::INTEGER, 1),
      provider_name_snapshot = v_item->>'provider_name_snapshot',
      service_name_snapshot = v_item->>'service_name_snapshot',
      service_category_snapshot = v_item->>'service_category_snapshot',
      provider_logo_snapshot = v_item->>'provider_logo_snapshot',
      provider_address_snapshot = v_item->>'provider_address_snapshot',
      provider_phone_snapshot = v_item->>'provider_phone_snapshot',
      provider_coordinates = CASE WHEN v_item ? 'provider_coordinates'
        THEN v_item->'provider_coordinates' ELSE NULL END,
      customer_name = v_item->>'customer_name',
      customer_email = v_item->>'customer_email',
      customer_phone = v_item->>'customer_phone',
      client_address = v_item->>'client_address',
      confirmed_at = CASE WHEN v_auto_accept THEN NOW() ELSE NULL END
    WHERE public.bookings.hold_batch_id = p_hold_batch_id
      AND public.bookings.provider_id = v_provider_id
      AND public.bookings.booking_date = v_booking_date
      AND public.bookings.booking_time = v_booking_time
      AND public.bookings.status = 'on_hold'
      AND public.bookings.hold_expires_at > NOW()
      AND public.bookings.user_id = auth.uid()
    RETURNING id INTO v_claimed_id;

    IF v_claimed_id IS NOT NULL THEN
      provider_id := v_provider_id;
      booking_date := v_booking_date;
      booking_time := v_booking_time;
      booking_id := v_claimed_id;
      RETURN NEXT;
      v_claimed_id := NULL;
    END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.release_cart_booking_slots(p_hold_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.bookings
     SET status = 'cancelled', hold_expires_at = NULL, hold_batch_id = NULL
   WHERE hold_batch_id = p_hold_batch_id
     AND status = 'on_hold'
     AND user_id = auth.uid();
END;
$function$;

CREATE OR REPLACE FUNCTION public.expire_cart_holds()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.bookings
     SET status = 'cancelled', hold_expires_at = NULL, hold_batch_id = NULL
   WHERE status = 'on_hold'
     AND hold_batch_id IS NOT NULL
     AND hold_expires_at < NOW();
END;
$function$;

GRANT EXECUTE ON FUNCTION public.hold_cart_booking_slots(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_cart_booking_slots(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_cart_booking_slots(uuid) TO authenticated;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'expire-cart-holds';
SELECT cron.schedule('expire-cart-holds', '*/5 * * * *', $$SELECT public.expire_cart_holds();$$);
