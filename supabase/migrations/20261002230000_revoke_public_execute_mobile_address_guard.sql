-- 20261002030000 left enforce_mobile_booking_has_client_address() with Postgres's
-- default PUBLIC EXECUTE grant (its comment said "not granted to anon" but no
-- REVOKE was written). It is a SECURITY DEFINER trigger function: the trigger
-- mechanism invokes it, nothing should call it directly. Same shape as
-- 20260820095951_revoke_public_scheduled_process_functions.
REVOKE ALL ON FUNCTION public.enforce_mobile_booking_has_client_address() FROM PUBLIC, anon, authenticated;
