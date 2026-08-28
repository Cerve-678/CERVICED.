-- This go-live check is invoked by provider data triggers, not by clients.
REVOKE ALL ON FUNCTION public.check_and_set_provider_live(uuid) FROM PUBLIC, anon, authenticated;
