-- Follow-up: REVOKE ... FROM PUBLIC only removes the PUBLIC pseudo-role grant.
-- This Supabase project's schema-level default privileges separately grant
-- EXECUTE on new functions to anon/authenticated/service_role by name, so
-- those explicit grants survive a PUBLIC-only revoke (confirmed by reading
-- pg_proc.proacl directly — the same is true of every other function in this
-- codebase that uses the "REVOKE ALL ... FROM public" pattern, e.g.
-- dev_reset_provider(), delete_client_profile(), replace_provider_services()
-- — flagging that separately, out of scope for this fix).
--
-- notify_address_released() has no internal ownership/authorization check at
-- all (it's meant to be called only from already-authorized trigger/RPC
-- code), so anon AND authenticated both need to lose direct EXECUTE — not
-- just anon.
REVOKE EXECUTE ON FUNCTION public.notify_address_released(uuid) FROM anon, authenticated;
;
