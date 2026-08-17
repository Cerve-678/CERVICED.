-- notify_address_released() has no ownership check by design (it's an
-- internal helper called only from other already-authorized SECURITY
-- DEFINER functions), but Postgres grants EXECUTE to PUBLIC by default on
-- function creation, and PostgREST exposes every public-schema function as
-- an RPC endpoint. That combination meant any anonymous caller could hit
-- /rest/v1/rpc/notify_address_released directly with an arbitrary booking
-- id and force-send the "Address Now Available" notification for it.
-- Lock it down to internal-only, matching the pattern already used by
-- cancel_account_deletion() etc.
REVOKE ALL ON FUNCTION public.notify_address_released(uuid) FROM PUBLIC;
;
