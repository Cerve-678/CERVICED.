-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260820111627
-- Remote name: revoke_anon_provider_release_address
-- Do not edit this recovery archive; create a new tracked migration for changes.

-- Manual address release is an authenticated provider action.
--
-- This migration existed at supabase/migrations/20260810163355_revoke_anon_
-- provider_release_address.sql since 2026-08-10 but was never applied — found
-- during the 2026-08-20 migration-record reconciliation. Not exploitable on
-- its own (the function's own guard resolves auth.uid() to NULL for anon and
-- raises 'Booking not found or not owned by caller'), but it left the last
-- anon-EXECUTE-able SECURITY DEFINER function on the project, undoing part of
-- the 2026-08-20 anon hardening pass.
REVOKE ALL ON FUNCTION public.provider_release_booking_address(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provider_release_booking_address(uuid) TO authenticated;
