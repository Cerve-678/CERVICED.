-- Defensive hardening: the table's default grants gave `authenticated`
-- INSERT/UPDATE/DELETE/TRUNCATE in addition to the SELECT this app
-- actually needs. RLS (enabled, SELECT-only policy) already blocks those
-- since there is no policy authorizing them, but this repo's convention
-- elsewhere is to be explicit about grants rather than rely on RLS alone
-- as the only line of defense — matches the REVOKE/GRANT pattern used on
-- every RPC in this file family. All writes go through the SECURITY
-- DEFINER RPCs (cancel_own_booking / provider_update_booking_status),
-- which bypass RLS as the function owner, so this doesn't affect them.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.client_provider_reliability FROM authenticated;
GRANT SELECT ON public.client_provider_reliability TO authenticated;
REVOKE ALL ON public.client_provider_reliability FROM anon;
