-- Trigger functions are invoked by the database, never through the public
-- Data API. Remove the unnecessary executable surface.
REVOKE ALL ON FUNCTION public.apply_provider_booking_instructions() FROM PUBLIC, anon, authenticated;
