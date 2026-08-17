-- Effective booking ranges are calculated by a database trigger, not clients.
REVOKE ALL ON FUNCTION public.compute_booking_effective_range() FROM PUBLIC, anon, authenticated;
