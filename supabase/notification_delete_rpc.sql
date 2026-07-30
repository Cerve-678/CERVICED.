-- Notifications have SELECT/UPDATE RLS policies (phase1_schema.sql) but no
-- DELETE policy, so a plain `.delete()` from the client silently matches zero
-- rows — the notification reappears on next load even though the UI already
-- removed it. Same pattern as dev_reset_provider(): a SECURITY DEFINER RPC
-- that checks ownership itself, so it doesn't need a broad DELETE policy.
-- Safe to re-run.

CREATE OR REPLACE FUNCTION public.delete_own_notification(p_notification_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.notifications
   WHERE id = p_notification_id
     AND user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_own_notification(UUID) TO authenticated;
