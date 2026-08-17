-- CERVICED — claim_cart_booking_slots() 42702 regression (live-blocking).
--
-- fix_claim_cart_booking_slots_ambiguous_column.sql (2026-08-04) fixed the
-- original ambiguity: the function's UPDATE ... WHERE clause referenced bare
-- "provider_id", which collided with the function's own
-- RETURNS TABLE(provider_id uuid, ...) OUT-parameter variable of the same
-- name. That fix fully qualified every WHERE-clause column with
-- public.bookings. and was correct.
--
-- fix_claim_cart_booking_slots_uses_real_address.sql (2026-08-09) then added
-- a NEW query to the same function body to snapshot the provider's real
-- address:
--
--   SELECT full_address, latitude, longitude
--     INTO v_full_address, v_latitude, v_longitude
--     FROM public.provider_private_details
--    WHERE provider_id = v_provider_id;
--
-- provider_private_details also has its own provider_id column, so this bare
-- reference reintroduced the exact same ambiguity class against the same
-- OUT-parameter — just against a different table. Every claim call has
-- failed with 42702 ("column reference \"provider_id\" is ambiguous") since
-- that fix went live, which BookingContext.tsx's createBookingsFromCart
-- catches as non-fatal and falls back to a direct insert — but that fallback
-- then commonly loses the race against enforce_booking_bookability()'s
-- overlap check (the slot the hold was reserving is still on_hold, not
-- converted, so a genuinely-available slot can read as taken), surfacing the
-- unrelated, misleading P0001 "That time is no longer available".
-- fix_claim_cart_booking_slots_policy_snapshot.sql (2026-08-10) rebuilt the
-- function from that same broken baseline and carried the bug forward
-- unchanged.
--
-- Reproduced live 2026-08-10 via direct RPC call:
--   ERROR: 42702: column reference "provider_id" is ambiguous
--   DETAIL: It could refer to either a PL/pgSQL variable or a table column.
--   QUERY: SELECT full_address, latitude, longitude
--            FROM public.provider_private_details
--           WHERE provider_id = v_provider_id
--   CONTEXT: PL/pgSQL function claim_cart_booking_slots(uuid,jsonb) line 24
--            at SQL statement
--
-- Fix: qualify that WHERE clause with the table name, same pattern as the
-- 2026-08-04 fix. No logic changed — same column, same condition, just
-- qualified. Rebuilt from the current live/policy_snapshot definition so
-- nothing else in the function regresses.
--
-- Safe to re-run.

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
  v_full_address TEXT;
  v_latitude NUMERIC(10,7);
  v_longitude NUMERIC(10,7);
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_provider_id := (v_item->>'provider_id')::UUID;
    v_booking_date := (v_item->>'booking_date')::DATE;
    v_booking_time := (v_item->>'booking_time')::TIME;

    SELECT COALESCE(auto_accept_bookings, FALSE) INTO v_auto_accept
      FROM public.providers WHERE id = v_provider_id;

    -- This table is owner-only to clients, but this controlled server function
    -- may snapshot it for the booked client. Never use location_text here.
    -- FIX: qualify provider_id with the table — it was bare here, ambiguous
    -- against the RETURNS TABLE provider_id OUT-parameter (42702).
    SELECT full_address, latitude, longitude
      INTO v_full_address, v_latitude, v_longitude
      FROM public.provider_private_details
     WHERE public.provider_private_details.provider_id = v_provider_id;

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
      provider_address_snapshot = COALESCE(NULLIF(btrim(v_full_address), ''), v_item->>'provider_address_snapshot'),
      provider_phone_snapshot = v_item->>'provider_phone_snapshot',
      provider_coordinates = CASE
        WHEN v_latitude IS NOT NULL AND v_longitude IS NOT NULL
          THEN jsonb_build_object('lat', v_latitude, 'lng', v_longitude)
        WHEN v_item ? 'provider_coordinates' THEN v_item->'provider_coordinates'
        ELSE NULL
      END,
      customer_name = v_item->>'customer_name',
      customer_email = v_item->>'customer_email',
      customer_phone = v_item->>'customer_phone',
      client_address = v_item->>'client_address',
      confirmed_at = CASE WHEN v_auto_accept THEN NOW() ELSE NULL END,
      policy_accepted_at = (v_item->>'policy_accepted_at')::TIMESTAMPTZ,
      policy_snapshot = v_item->'policy_snapshot'
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

-- Existing on_hold rows are not touched — they'll be claimed correctly (or
-- fall through to expire_cart_holds() as before) on the next checkout
-- attempt against them. No data backfill needed.
