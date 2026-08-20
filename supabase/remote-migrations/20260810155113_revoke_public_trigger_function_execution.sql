-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260810155113
-- Remote name: revoke_public_trigger_function_execution
-- Do not edit this recovery archive; create a new tracked migration for changes.

-- Trigger functions are invoked by the database, never through the public
-- Data API. Remove the unnecessary executable surface.
REVOKE ALL ON FUNCTION public.apply_provider_booking_instructions() FROM PUBLIC, anon, authenticated
