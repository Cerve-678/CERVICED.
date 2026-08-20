-- get_user_public_profiles() is the SECURITY DEFINER replacement for the
-- embedded users join removed in fix_users_table_pii_leak.sql. It stayed
-- anon-callable with no auth check, leaving an unauthenticated bulk
-- enumeration path over public.users (id/name/avatar for any uuid guessed
-- or harvested) -- a narrower version of the same leak it was written to fix.
--
-- Both call sites (getProviderConversations, getProviderReviews) run only on
-- authenticated screens; RootNavigation gates all non-auth screens behind
-- isLoggedIn, so the app has no logged-out browse path to break.
CREATE OR REPLACE FUNCTION public.get_user_public_profiles(p_user_ids uuid[])
RETURNS TABLE(id uuid, name text, avatar_url text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  RETURN QUERY
    SELECT u.id, u.name, u.avatar_url
    FROM public.users u
    WHERE u.id = ANY(p_user_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_public_profiles(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_public_profiles(uuid[]) TO authenticated;
