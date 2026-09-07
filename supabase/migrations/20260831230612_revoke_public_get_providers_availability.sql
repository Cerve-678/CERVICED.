-- The DROP+CREATE in get_providers_availability_hair_match re-created the
-- function with Postgres's default PUBLIC EXECUTE grant, which anon inherits
-- from -- silently undoing the 2026-08-20 anon-execute hardening pass for
-- this one function (previously authenticated + service_role only). Revoke
-- PUBLIC explicitly; the prior migration's GRANT to authenticated/service_role
-- stays intact since REVOKE PUBLIC does not touch role-specific grants.
REVOKE EXECUTE ON FUNCTION public.get_providers_availability(text[], text) FROM PUBLIC;
