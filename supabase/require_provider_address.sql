-- ============================================================
-- CERVICED — Require a real, geocoded address from every provider,
-- regardless of business_type, and finally let a released booking's map pin
-- reflect the REAL address instead of the approximate location_text geocode.
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- CONTEXT
-- provider_private_details.full_address (the real street address) has never
-- been required at registration — freeform text, validated by nothing, and
-- not even collected at all for business_type = 'mobile'. Go-live only ever
-- checked schedule + services (require_services_for_go_live.sql), never
-- address. One real production row shows the cost of zero validation: a
-- provider's public location_text is literally "New York".
--
-- The app now geocodes and UK-bounds-checks the real address at registration
-- time (providerRegistrationService.ts's geocodeAndValidateUkAddress) before
-- ever calling setMyProviderFullAddress — this migration is the DB side:
-- store the resulting coordinates, use them for the map pin once released,
-- and gate go-live on a real address existing, matching the existing
-- services/schedule gate rather than trusting the app alone (same
-- DB-is-the-enforcement-point principle as address release itself).
--
-- 1. Real coordinates, stored next to the real address (same owner-only RLS,
--    same sensitivity) ─────────────────────────────────────────────────────
ALTER TABLE public.provider_private_details
  ADD COLUMN IF NOT EXISTS latitude  NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7);

-- 2. stamp_booking_address_snapshot() — also prefer the real coordinates for
--    provider_coordinates, not just provider_address_snapshot. Same
--    full_address → location_text → whatever-the-app-sent fallback order,
--    now applied to coordinates too. { lat, lng } matches the shape the app
--    already writes (see BookingContext.tsx's createBooking payload) ───────
CREATE OR REPLACE FUNCTION public.stamp_booking_address_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_address   TEXT;
  v_latitude       NUMERIC(10,7);
  v_longitude      NUMERIC(10,7);
  v_location_text  TEXT;
BEGIN
  SELECT d.full_address, d.latitude, d.longitude
    INTO v_full_address, v_latitude, v_longitude
  FROM public.provider_private_details d
  WHERE d.provider_id = NEW.provider_id;

  SELECT p.location_text INTO v_location_text
  FROM public.providers p
  WHERE p.id = NEW.provider_id;

  NEW.provider_address_snapshot := COALESCE(
    NULLIF(btrim(v_full_address), ''),
    NULLIF(btrim(v_location_text), ''),
    NEW.provider_address_snapshot
  );

  IF v_latitude IS NOT NULL AND v_longitude IS NOT NULL THEN
    NEW.provider_coordinates := jsonb_build_object('lat', v_latitude, 'lng', v_longitude);
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Extend go-live gating with a real, geocoded address ────────────────────
-- Same one-way design as require_services_for_go_live.sql: only tightens the
-- condition for the FIRST flip to TRUE. Never un-flips an already-live
-- provider, even one that went live before this migration with no address
-- on file at all.
CREATE OR REPLACE FUNCTION public.check_and_set_provider_live(p_provider_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.providers p
  SET has_gone_live = TRUE
  WHERE p.id = p_provider_id
    AND p.has_gone_live = FALSE
    AND EXISTS (
      SELECT 1 FROM public.provider_availability a
      WHERE a.provider_id = p_provider_id AND a.is_closed = FALSE
    )
    AND EXISTS (
      SELECT 1 FROM public.services s
      WHERE s.provider_id = p_provider_id
    )
    AND EXISTS (
      SELECT 1 FROM public.provider_private_details d
      WHERE d.provider_id = p_provider_id
        AND btrim(COALESCE(d.full_address, '')) <> ''
        AND d.latitude IS NOT NULL
        AND d.longitude IS NOT NULL
    );
END;
$$;

-- 4. Setting the address can now be the "last piece" that completes go-live,
--    same pattern as the existing on_provider_service_insert trigger ───────
CREATE OR REPLACE FUNCTION public.handle_provider_address_change()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.check_and_set_provider_live(NEW.provider_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_provider_address_change ON public.provider_private_details;
CREATE TRIGGER on_provider_address_change
  AFTER INSERT OR UPDATE ON public.provider_private_details
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_provider_address_change();

-- VERIFY
--   -- schema:
--   select column_name from information_schema.columns
--   where table_name = 'provider_private_details' and column_name in ('latitude','longitude');
--
--   -- go-live gate (use a rolled-back transaction against a scratch provider
--   -- with services + open schedule but no address — see this session's
--   -- earlier transaction-test technique):
--   select public.check_and_set_provider_live('<scratch provider id>');
--   select has_gone_live from public.providers where id = '<scratch provider id>';
--     → expect still FALSE with no address; TRUE once a real lat/lng exists
--
--   -- coordinate fallback: insert a scratch booking for a provider with a
--   -- real address+coords on file, confirm provider_coordinates = the real
--   -- {lat,lng}, not the approximate one the app would have sent.
-- ============================================================
