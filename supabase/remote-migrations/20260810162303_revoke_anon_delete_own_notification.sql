-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260810162303
-- Remote name: revoke_anon_delete_own_notification
-- Do not edit this recovery archive; create a new tracked migration for changes.

-- Notification deletion is self-service and must require a signed-in user.
REVOKE ALL ON FUNCTION public.delete_own_notification(uuid) FROM PUBLIC, anon

GRANT EXECUTE ON FUNCTION public.delete_own_notification(uuid) TO authenticated
