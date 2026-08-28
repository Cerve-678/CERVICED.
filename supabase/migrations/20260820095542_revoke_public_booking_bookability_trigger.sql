-- Appointment availability is enforced by a booking trigger, never via RPC.
REVOKE ALL ON FUNCTION public.enforce_booking_bookability() FROM PUBLIC, anon, authenticated;
