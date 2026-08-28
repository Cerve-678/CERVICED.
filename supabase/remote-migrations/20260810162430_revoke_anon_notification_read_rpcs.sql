-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260810162430
-- Remote name: revoke_anon_notification_read_rpcs
-- Do not edit this recovery archive; create a new tracked migration for changes.

-- Notification read-state changes are self-service actions for signed-in users.
REVOKE ALL ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC, anon

REVOKE ALL ON FUNCTION public.mark_notification_read(uuid) FROM PUBLIC, anon

GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated

GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated
