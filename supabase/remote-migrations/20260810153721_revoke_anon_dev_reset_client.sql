-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260810153721
-- Remote name: revoke_anon_dev_reset_client
-- Do not edit this recovery archive; create a new tracked migration for changes.

-- This self-scoped developer RPC requires a signed-in user. Keeping it out of
-- the anonymous API surface removes an unnecessary SECURITY DEFINER exposure.
REVOKE ALL ON FUNCTION public.dev_reset_client() FROM PUBLIC

REVOKE ALL ON FUNCTION public.dev_reset_client() FROM anon

GRANT EXECUTE ON FUNCTION public.dev_reset_client() TO authenticated
