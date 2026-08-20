-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260816174755
-- Remote name: reapply_booking_bookability_trigger_lockdown
-- Do not edit this recovery archive; create a new tracked migration for changes.

-- The preceding migration (manual_booking_working_hours_bypass) did
-- CREATE OR REPLACE FUNCTION public.enforce_booking_bookability(), which
-- resets a function's ACL to the Postgres default (PUBLIC has EXECUTE) --
-- silently undoing 20260812114517_revoke_public_booking_bookability_trigger
-- .sql, which had deliberately locked this down because the Supabase
-- security linter flags any SECURITY DEFINER function reachable by
-- anon/authenticated via PostgREST RPC as a risk, and this function has
-- no reason to ever be called directly -- it only ever needs to run as a
-- BEFORE INSERT/UPDATE trigger on public.bookings, which Postgres invokes
-- internally regardless of EXECUTE grants. Reapplying immediately.
REVOKE ALL ON FUNCTION public.enforce_booking_bookability() FROM PUBLIC, anon, authenticated;
