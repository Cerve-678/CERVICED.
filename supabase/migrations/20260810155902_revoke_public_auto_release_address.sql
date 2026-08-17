-- Trigger-only address-release automation must not be callable through the
-- public Data API.
REVOKE ALL ON FUNCTION public.auto_release_address() FROM PUBLIC, anon, authenticated;
