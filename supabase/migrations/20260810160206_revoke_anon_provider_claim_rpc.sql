-- Claiming a provider profile requires the signed-in user and its
-- server-validated claim token; remove only the anonymous API surface.
REVOKE ALL ON FUNCTION public.claim_provider_profile(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_provider_profile(uuid, text) TO authenticated;
