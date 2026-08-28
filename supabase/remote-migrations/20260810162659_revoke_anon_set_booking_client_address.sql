-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260810162659
-- Remote name: revoke_anon_set_booking_client_address
-- Do not edit this recovery archive; create a new tracked migration for changes.

-- A client address may only be updated by the signed-in booking owner.
REVOKE ALL ON FUNCTION public.set_booking_client_address(uuid, text) FROM PUBLIC, anon

GRANT EXECUTE ON FUNCTION public.set_booking_client_address(uuid, text) TO authenticated
