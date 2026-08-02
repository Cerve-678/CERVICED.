-- ============================================================
-- CERVICED — Fix: released bookings show the provider's general/approximate
-- location instead of their real street address.
-- Run this in the Supabase SQL editor. Safe to re-run.
--
-- Root cause: address_release_enforcement.sql correctly gates
-- bookings.provider_address_snapshot behind is_address_released() in the
-- client_bookings view — but nothing was ever writing the REAL address into
-- that column. At checkout, BookingContext.tsx stamps
-- provider_address_snapshot from getProviderLocationsByIds(), which reads
-- providers.location_text — the public, provider-chosen approximate text
-- used for browse/search ("North West London"), never the private,
-- release-gated providers_private_details.full_address.
--
-- That's not an oversight in the client code — it's the RLS boundary working
-- as designed: "provider_private_details_owner_all" only lets the OWNING
-- provider read their own full_address, so a client booking a *different*
-- provider can never read it directly (restrict_provider_full_address.sql).
-- The address-release policy the provider sets (on_confirmation, day_before,
-- etc.) therefore had nothing correct to reveal — clients got the same
-- general area before AND after release, never the real address.
--
-- Fix: stamp the real address onto the booking from inside the database,
-- where RLS doesn't apply, at INSERT time — mirroring how
-- address_release_policy.sql's auto_release_address() trigger already owns
-- release timing server-side rather than trusting the client.
--
-- Deliberately NOT touched: provider_coordinates. The public lat/lng is a
-- geocode of the vague location_text by design (providerRegistrationService.
-- ts), and provider_private_details has no separate real coordinates to draw
-- from — adding those means geocoding the real address, a separate piece of
-- work. "Open in Maps" will keep dropping an approximate pin even once the
-- exact address text is released; that's an existing, now-more-visible
-- limitation, not something this migration introduces.
-- ============================================================

-- 1. Stamp the real address at booking creation ────────────────────────────
CREATE OR REPLACE FUNCTION public.stamp_booking_address_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_address TEXT;
BEGIN
  SELECT d.full_address INTO v_full_address
  FROM public.provider_private_details d
  WHERE d.provider_id = NEW.provider_id;

  -- Only override when the provider actually has a real address on file —
  -- otherwise leave whatever the app sent (the pending placeholder or, for
  -- providers who skipped it, the approximate location) so a missing address
  -- still reads as missing rather than silently becoming NULL.
  IF v_full_address IS NOT NULL AND btrim(v_full_address) <> '' THEN
    NEW.provider_address_snapshot := v_full_address;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_booking_address_snapshot ON public.bookings;
CREATE TRIGGER trg_stamp_booking_address_snapshot
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.stamp_booking_address_snapshot();

-- 2. Backfill bookings already sitting on the wrong (general) address ──────
-- Scoped to bookings that still matter to a client (not completed/cancelled)
-- and only where the provider has since set a real address that differs from
-- what was snapshotted — a completed/cancelled booking's address is history,
-- not something a client still needs to act on.
UPDATE public.bookings b
SET provider_address_snapshot = d.full_address
FROM public.provider_private_details d
WHERE d.provider_id = b.provider_id
  AND d.full_address IS NOT NULL
  AND btrim(d.full_address) <> ''
  AND b.provider_address_snapshot IS DISTINCT FROM d.full_address
  AND b.status NOT IN ('completed', 'cancelled');

-- VERIFY
--   -- as a client with a released, upcoming booking:
--   select provider_address_snapshot from client_bookings where id = '<booking id>';
--     → expect the provider's real full_address, not their general area text
-- ============================================================
