-- This self-scoped developer RPC requires a signed-in user. Keeping it out of
-- the anonymous API surface removes an unnecessary SECURITY DEFINER exposure.
REVOKE ALL ON FUNCTION public.dev_reset_client() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dev_reset_client() FROM anon;
GRANT EXECUTE ON FUNCTION public.dev_reset_client() TO authenticated;
