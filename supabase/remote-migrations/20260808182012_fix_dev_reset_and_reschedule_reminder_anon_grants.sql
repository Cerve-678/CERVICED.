-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260808182012
-- Remote name: fix_dev_reset_and_reschedule_reminder_anon_grants
-- Do not edit this recovery archive; create a new tracked migration for changes.

REVOKE EXECUTE ON FUNCTION public.dev_reset_provider_bookings_only() FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_provider_stale_reschedule_reminders() FROM anon;
