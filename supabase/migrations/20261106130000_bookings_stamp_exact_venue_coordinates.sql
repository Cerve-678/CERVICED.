-- Bookings carry the provider's exact venue coordinates again.
--
-- The map pin and route on the client's Bookings screen read
-- bookings.provider_coordinates (through client_bookings, which hides it until
-- the address is released). Only claim_cart_booking_slots ever copied the
-- provider's exact private coordinates onto a booking. Card checkout goes
-- through prepare_checkout, which never wrote them, so every card-paid venue
-- booking has a released address and no pin. Checked live 2026-11-06: all 4
-- active salon / studio / home-studio bookings were card-paid with NULL
-- coordinates, and all 4 providers have exact coordinates saved.
--
-- Fix it in the one place every insert path already passes through:
-- stamp_booking_address_snapshot(), BEFORE INSERT on bookings. It already
-- stamps the private address and directions, so the coordinates that belong
-- to that address are stamped alongside them. Exact private coordinates win
-- over anything the app sent (the app only has the public area pin), the same
-- precedence claim_cart_booking_slots uses.
--
-- Mobile providers are skipped: they travel to the client, so their saved
-- location is their private base and never the appointment's location.
--
-- Nothing is exposed earlier than before: client_bookings still returns
-- provider_coordinates only once is_address_released() is true.
--
-- Redefined from the live definition (pg_get_functiondef, 2026-11-06) with an
-- md5 guard, so this refuses to apply over a newer version.

BEGIN;

DO $$
BEGIN
  IF md5(pg_get_functiondef('public.stamp_booking_address_snapshot()'::regprocedure)) <> '2143cc34448d4f524ff6dc31d92acf70' THEN
    RAISE EXCEPTION 'stamp_booking_address_snapshot changed live since this migration was written. Rebuild it from the live definition.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.stamp_booking_address_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_full_address text;
  v_location_text text;
  v_directions text;
  v_latitude numeric;
  v_longitude numeric;
  v_business_type text;
BEGIN
  SELECT d.full_address, d.how_to_get_there, d.latitude, d.longitude
    INTO v_full_address, v_directions, v_latitude, v_longitude
  FROM public.provider_private_details d
  WHERE d.provider_id = NEW.provider_id;

  SELECT p.location_text, p.business_type
    INTO v_location_text, v_business_type
  FROM public.providers p
  WHERE p.id = NEW.provider_id;

  NEW.provider_address_snapshot := COALESCE(NULLIF(btrim(v_full_address), ''), NULLIF(btrim(v_location_text), ''), NEW.provider_address_snapshot);
  NEW.provider_directions_snapshot := COALESCE(NULLIF(btrim(v_directions), ''), NEW.provider_directions_snapshot);

  -- Same { lat, lng } shape claim_cart_booking_slots writes.
  IF v_business_type IS DISTINCT FROM 'mobile'
     AND v_latitude IS NOT NULL AND v_longitude IS NOT NULL THEN
    NEW.provider_coordinates := jsonb_build_object('lat', v_latitude, 'lng', v_longitude);
  END IF;

  RETURN NEW;
END; $function$;

-- Backfill bookings a client can still travel to. A completed or cancelled
-- booking's location is history. Only rows with no coordinates are touched,
-- and only provider_coordinates changes, so no booking trigger fires (they
-- are all scoped to other columns).
UPDATE public.bookings b
SET provider_coordinates = jsonb_build_object('lat', d.latitude, 'lng', d.longitude)
FROM public.provider_private_details d, public.providers p
WHERE d.provider_id = b.provider_id
  AND p.id = b.provider_id
  AND p.business_type IS DISTINCT FROM 'mobile'
  AND d.latitude IS NOT NULL
  AND d.longitude IS NOT NULL
  AND b.provider_coordinates IS NULL
  AND b.status NOT IN ('completed', 'cancelled');

-- CREATE OR REPLACE keeps the existing grants: the function stays revoked from
-- PUBLIC, anon and authenticated (20260820100037).

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261106130000', 'bookings_stamp_exact_venue_coordinates')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- VERIFY
--   select count(*) from bookings b join providers p on p.id = b.provider_id
--   where p.business_type <> 'mobile' and b.provider_coordinates is null
--     and b.status not in ('completed','cancelled','on_hold');
--   → 0 for any provider with exact coordinates saved
--   A new card-paid salon booking gets provider_coordinates = { lat, lng }
--   matching provider_private_details; a mobile booking stays NULL.
