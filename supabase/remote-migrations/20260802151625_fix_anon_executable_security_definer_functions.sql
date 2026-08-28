-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260802151625
-- Remote name: fix_anon_executable_security_definer_functions
-- Do not edit this recovery archive; create a new tracked migration for changes.

REVOKE EXECUTE ON FUNCTION public.cancel_account_deletion() FROM anon;
REVOKE EXECUTE ON FUNCTION public.dev_reset_provider() FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_client_profile() FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_provider_profile() FROM anon;
REVOKE EXECUTE ON FUNCTION public.replace_provider_services(uuid, jsonb) FROM anon;
