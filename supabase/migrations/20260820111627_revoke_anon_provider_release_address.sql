-- Manual address release is an authenticated provider action.
REVOKE ALL ON FUNCTION public.provider_release_booking_address(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provider_release_booking_address(uuid) TO authenticated;
