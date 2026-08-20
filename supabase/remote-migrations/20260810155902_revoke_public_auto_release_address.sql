-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260810155902
-- Remote name: revoke_public_auto_release_address
-- Do not edit this recovery archive; create a new tracked migration for changes.

-- Trigger-only address-release automation must not be callable through the
-- public Data API.
REVOKE ALL ON FUNCTION public.auto_release_address() FROM PUBLIC, anon, authenticated
