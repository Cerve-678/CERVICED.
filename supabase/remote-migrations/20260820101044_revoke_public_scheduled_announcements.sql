-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260820101044
-- Remote name: revoke_public_scheduled_announcements
-- Do not edit this recovery archive; create a new tracked migration for changes.

REVOKE ALL ON FUNCTION public.process_scheduled_announcements() FROM PUBLIC, anon, authenticated;
ALTER FUNCTION public.process_scheduled_announcements() SET search_path = public, pg_temp;
