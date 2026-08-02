-- ============================================================
-- CERVICED — Have stamp_booking_address_snapshot() fall back to the
-- provider's public location_text itself, instead of relying on the client
-- to precompute and send that same fallback value.
-- Run AFTER fix_booking_address_snapshot_uses_real_address.sql. Safe to re-run.
--
-- BEFORE: the trigger only overrode NEW.provider_address_snapshot when a real
-- full_address existed; otherwise it left whatever BookingContext.tsx sent,
-- which is itself p.location_text (or ADDRESS_PENDING_PLACEHOLDER) fetched via
-- getProviderLocationsByIds/getProviderLocationsByDisplayNames. Two different
-- systems — one in the app, one in the DB — had to independently agree on the
-- same fallback value.
--
-- AFTER: the trigger fetches BOTH full_address and location_text and picks
-- full_address → location_text → whatever the app sent, in that order. The
-- app no longer needs to be the source of truth for the location_text
-- fallback (it can keep sending it — this is additive, not a contract break).
--
-- BEHAVIOR CHANGE (flagged, not hidden): getProviderLocationsByIds and
-- getProviderLocationsByDisplayNames both skip a provider entirely when
-- latitude/longitude are null (they need coordinates for the map pin), even
-- if location_text is set — so today, a provider with a location_text but no
-- coordinates yet gets NO address sent by the app at all for that field. This
-- trigger change rescues that case: the DB now finds location_text directly
-- off the providers row regardless of whether coordinates exist. Every other
-- case (real address on file; neither address nor location_text) is
-- unchanged.
--
-- Deliberately NOT touched: provider_coordinates — see
-- fix_booking_address_snapshot_uses_real_address.sql's header for why.
--
-- VERIFY
--   -- provider with a real address on file: unaffected, still gets full_address
--   -- provider with only location_text set (even with null lat/lng): a new
--   --   booking's provider_address_snapshot now equals that location_text
--   --   instead of the placeholder/NULL the app would have sent
--   -- provider with neither: still gets whatever the app sent (the
--   --   ADDRESS_PENDING_PLACEHOLDER), unchanged
-- ============================================================

CREATE OR REPLACE FUNCTION public.stamp_booking_address_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_address   TEXT;
  v_location_text  TEXT;
BEGIN
  SELECT d.full_address INTO v_full_address
  FROM public.provider_private_details d
  WHERE d.provider_id = NEW.provider_id;

  SELECT p.location_text INTO v_location_text
  FROM public.providers p
  WHERE p.id = NEW.provider_id;

  -- full_address wins when the provider has a real one on file; otherwise
  -- fall back to their public approximate location_text; otherwise leave
  -- whatever the app sent (the pending placeholder, typically) so a missing
  -- address still reads as missing rather than silently becoming NULL.
  NEW.provider_address_snapshot := COALESCE(
    NULLIF(btrim(v_full_address), ''),
    NULLIF(btrim(v_location_text), ''),
    NEW.provider_address_snapshot
  );

  RETURN NEW;
END;
$$;

-- Trigger definition is unchanged (still BEFORE INSERT), so no need to
-- DROP/CREATE it — CREATE OR REPLACE on the function is enough.
