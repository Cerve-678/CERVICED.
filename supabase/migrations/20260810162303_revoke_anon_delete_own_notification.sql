-- Notification deletion is self-service and must require a signed-in user.
REVOKE ALL ON FUNCTION public.delete_own_notification(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_own_notification(uuid) TO authenticated;
