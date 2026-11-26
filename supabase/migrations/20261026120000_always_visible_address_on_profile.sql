-- "Always visible" now means what it says: a salon or studio on
-- address_release_policy = 'always' shows its full address on its public
-- profile (Contact → Location), not only to booked clients.
--
-- provider_private_details stays owner-only under RLS. This function is the
-- single, narrow way a client reads another provider's address, and it only
-- answers when every one of these holds:
--   • the provider is live and active (same gate as every client-facing read),
--   • the provider chose 'always',
--   • the provider is a salon or studio. The app only offers 'always' to those
--     two types (ADDRESS_RELEASE_BY_BUSINESS_TYPE), but a stale row (a type
--     changed without reconciling the policy) must not publish a home address,
--     so the server checks the type itself rather than trusting the app,
--   • there is a real address on file.
-- Anything else returns no row, which the app treats as "show the area only".
--
-- Booking-level release is untouched: is_address_released() already returns
-- TRUE for 'always', so booked clients keep seeing the address on the booking.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_public_provider_address(p_provider_id uuid)
RETURNS TABLE (full_address text, latitude numeric, longitude numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT btrim(d.full_address), d.latitude, d.longitude
    FROM public.providers p
    JOIN public.provider_private_details d ON d.provider_id = p.id
   WHERE p.id = p_provider_id
     AND p.has_gone_live = TRUE
     AND p.is_active = TRUE
     AND p.address_release_policy = 'always'
     AND p.business_type IN ('salon', 'studio')
     AND NULLIF(btrim(d.full_address), '') IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_public_provider_address(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_public_provider_address(uuid) TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261026120000', 'always_visible_address_on_profile')
ON CONFLICT (version) DO NOTHING;

COMMIT;
