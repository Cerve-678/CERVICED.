-- A client address may only be updated by the signed-in booking owner.
REVOKE ALL ON FUNCTION public.set_booking_client_address(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_booking_client_address(uuid, text) TO authenticated;
