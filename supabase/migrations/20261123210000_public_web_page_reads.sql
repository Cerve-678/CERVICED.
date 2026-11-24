-- The public web page (cerviced.co/@handle) is read by signed-out visitors,
-- so the three reads the app's profile makes as a signed-in user have to
-- work for anon too:
--
--   get_provider_reviews        reviews with reviewer names, as in the app
--                               (user, 2026-11-23: "Reviews with names").
--                               Anonymous reviews stay nameless. A signed-out
--                               visitor gets no reviewer id or avatar: the
--                               page shows neither, so they aren't handed out.
--   get_public_provider_address the full address, only for a live salon or
--                               studio that chose "Always visible" (unchanged).
--   provider_is_taking_bookings yes/no for the closed-schedule notice.
--
-- get_provider_reviews is redefined from live (md5 guard); the other two
-- only gain an EXECUTE grant.

BEGIN;

DO $$
BEGIN
  IF (SELECT md5(pg_get_functiondef('public.get_provider_reviews(uuid, integer)'::regprocedure)))
     <> '60b2b861a8039cdf7095f59e12b618a3' THEN
    RAISE EXCEPTION 'get_provider_reviews changed live since this migration was written';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_provider_reviews(p_provider_id uuid, p_limit integer DEFAULT 200)
 RETURNS TABLE(id uuid, provider_id uuid, rating smallint, comment text, created_at timestamp with time zone, is_anonymous boolean, reviewer_id uuid, reviewer_name text, reviewer_avatar_url text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Signed-out visitors read reviews on the public web page. Names show as
  -- they do in the app; the reviewer's id and avatar are for signed-in
  -- viewers only.
  RETURN QUERY
    SELECT r.id,
           r.provider_id,
           r.rating,
           r.comment,
           r.created_at,
           r.is_anonymous,
           CASE WHEN r.is_anonymous OR auth.uid() IS NULL THEN NULL ELSE r.user_id END,
           CASE WHEN r.is_anonymous THEN NULL ELSE u.name END,
           CASE WHEN r.is_anonymous OR auth.uid() IS NULL THEN NULL ELSE u.avatar_url END
      FROM public.reviews r
      JOIN public.providers p ON p.id = r.provider_id
      LEFT JOIN public.users u ON u.id = r.user_id
     WHERE r.provider_id = p_provider_id
       AND (
         (p.has_gone_live = TRUE AND p.is_active = TRUE)
         OR p.user_id = auth.uid()
       )
     ORDER BY r.created_at DESC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 200);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_provider_reviews(uuid, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_provider_address(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.provider_is_taking_bookings(uuid) TO anon;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261123210000', 'public_web_page_reads')
ON CONFLICT (version) DO NOTHING;

COMMIT;
