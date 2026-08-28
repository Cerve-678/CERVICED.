-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260820102006
-- Remote name: revoke_anon_trending_providers
-- Do not edit this recovery archive; create a new tracked migration for changes.

REVOKE ALL ON FUNCTION public.get_trending_providers(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_trending_providers(integer) TO authenticated;
