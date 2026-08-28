-- Restore the intended 30-day reactivation window before permanent deletion.
CREATE OR REPLACE FUNCTION public.process_scheduled_account_deletions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_processed INT := 0;
BEGIN
  FOR r IN
    SELECT id FROM public.users
     WHERE deletion_requested_at IS NOT NULL
       AND deletion_requested_at <= NOW() - INTERVAL '30 days'
  LOOP
    DELETE FROM public.reviews  WHERE provider_id IN (SELECT id FROM public.providers WHERE user_id = r.id);
    DELETE FROM public.bookings WHERE provider_id IN (SELECT id FROM public.providers WHERE user_id = r.id);
    DELETE FROM public.providers WHERE user_id = r.id;
    DELETE FROM public.reviews  WHERE user_id = r.id;
    DELETE FROM public.bookings WHERE user_id = r.id;
    DELETE FROM public.users WHERE id = r.id;
    DELETE FROM auth.users   WHERE id = r.id;

    v_processed := v_processed + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'processed', v_processed);
END;
$$;
-- This is a cron-only SECURITY DEFINER function. It must never be callable
-- through the public Data API by anonymous or authenticated users.
REVOKE EXECUTE ON FUNCTION public.process_scheduled_account_deletions() FROM PUBLIC, anon, authenticated;
