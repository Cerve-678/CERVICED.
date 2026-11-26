-- "Mark All Read" clears only the hat you're looking at.
--
-- mark_all_notifications_read() marked every unread row for the account, but
-- the Notifications screen only shows the active hat (recipient_role). A
-- two-hat account tapping it in client mode silently cleared provider
-- notifications they had never seen — the provider bell went to 0 over new
-- bookings and cancellations.
--
-- Now it takes the hat. p_role NULL keeps the old "everything" behaviour, so
-- app builds already on phones (which call it with no arguments) keep working
-- unchanged until they update. One function, not an overload: PostgREST can't
-- choose between a zero-arg function and one whose only argument has a default.

BEGIN;

-- Guard: rebuilt from the live definition as of 2026-11-19.
DO $$
BEGIN
  IF md5(pg_get_functiondef('public.mark_all_notifications_read()'::regprocedure))
     <> '6abdd8cfe40b22b1a030b1fd6477a3c1' THEN
    RAISE EXCEPTION 'mark_all_notifications_read changed since this migration was written; rebuild it from live';
  END IF;
END $$;

DROP FUNCTION public.mark_all_notifications_read();

CREATE FUNCTION public.mark_all_notifications_read(p_role text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_role IS NOT NULL AND p_role NOT IN ('client', 'provider') THEN
    RAISE EXCEPTION 'Unknown notification role: %', p_role;
  END IF;

  UPDATE public.notifications
  SET is_read = true
  WHERE user_id = auth.uid()
    AND is_read = false
    AND (p_role IS NULL OR recipient_role = p_role);
END;
$function$;

-- Same reach as before: signed-in users only.
REVOKE ALL ON FUNCTION public.mark_all_notifications_read(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read(text) TO authenticated, service_role;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261119100000', 'mark_all_read_per_hat')
ON CONFLICT (version) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
