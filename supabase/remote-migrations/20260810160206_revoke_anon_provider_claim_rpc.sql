-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260810160206
-- Remote name: revoke_anon_provider_claim_rpc
-- Do not edit this recovery archive; create a new tracked migration for changes.

-- Claiming a provider profile requires the signed-in user and its
-- server-validated claim token; remove only the anonymous API surface.
REVOKE ALL ON FUNCTION public.claim_provider_profile(uuid, text) FROM PUBLIC, anon

GRANT EXECUTE ON FUNCTION public.claim_provider_profile(uuid, text) TO authenticated
