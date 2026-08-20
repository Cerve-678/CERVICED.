-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260820095542
-- Remote name: revoke_public_booking_bookability_trigger
-- Do not edit this recovery archive; create a new tracked migration for changes.

-- Appointment availability is enforced by a booking trigger, never via RPC.
REVOKE ALL ON FUNCTION public.enforce_booking_bookability() FROM PUBLIC, anon, authenticated;
