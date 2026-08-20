-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260810161558
-- Remote name: revoke_public_booking_effective_range_trigger
-- Do not edit this recovery archive; create a new tracked migration for changes.

-- Effective booking ranges are calculated by a database trigger, not clients.
REVOKE ALL ON FUNCTION public.compute_booking_effective_range() FROM PUBLIC, anon, authenticated
