REVOKE EXECUTE ON FUNCTION public.cancel_account_deletion() FROM anon;
REVOKE EXECUTE ON FUNCTION public.dev_reset_provider() FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_client_profile() FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_provider_profile() FROM anon;
REVOKE EXECUTE ON FUNCTION public.replace_provider_services(uuid, jsonb) FROM anon;;
