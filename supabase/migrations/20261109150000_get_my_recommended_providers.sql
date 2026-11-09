-- 20261109150000_get_my_recommended_providers.sql
--
-- Your own face in the ring (decided 2026-11-09): on providers you recommend,
-- your face with a heart comes first in the stack on their cards, on your own
-- screen only. get_circle_for_providers only returns people you follow, so
-- this is a separate, read-only call the app makes once per session.
--
-- Returns the caller's own name and picture plus the live providers they
-- recommend. Nothing about anyone else. New function only; nothing existing
-- is redefined.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_recommended_providers()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
  v_avatar text;
  v_ids uuid[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
  IF NOT public.social_is_active_client(v_uid) THEN
    RETURN jsonb_build_object('name', NULL, 'avatar_url', NULL, 'provider_ids', '[]'::jsonb);
  END IF;

  SELECT u.name, u.avatar_url INTO v_name, v_avatar FROM public.users u WHERE u.id = v_uid;

  -- Client-facing: only live, active providers. Capped; nobody recommends this many.
  SELECT coalesce(array_agg(x.provider_id), '{}') INTO v_ids
  FROM (
    SELECT r.provider_id
    FROM public.provider_recommendations r
    JOIN public.providers p ON p.id = r.provider_id
    WHERE r.client_id = v_uid AND p.has_gone_live = true AND p.is_active = true
      -- Hidden beats Recommend, as it does for followers.
      AND NOT EXISTS (
        SELECT 1 FROM public.client_hidden_providers h
        WHERE h.client_id = v_uid AND h.provider_id = r.provider_id
      )
    LIMIT 500
  ) x;

  RETURN jsonb_build_object('name', v_name, 'avatar_url', v_avatar, 'provider_ids', to_jsonb(v_ids));
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_recommended_providers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_recommended_providers() TO authenticated;

COMMIT;
