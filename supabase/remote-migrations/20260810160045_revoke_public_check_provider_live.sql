-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260810160045
-- Remote name: revoke_public_check_provider_live
-- Do not edit this recovery archive; create a new tracked migration for changes.

-- This go-live check is invoked by provider data triggers, not by clients.
REVOKE ALL ON FUNCTION public.check_and_set_provider_live(uuid) FROM PUBLIC, anon, authenticated
