-- 20261109130000_follow_people_visits_from_notice_and_blocked_list.sql
--
-- Two follow-people changes the user decided on 2026-11-08 (PR on
-- feat/follow-people-decisions, after #358's 20261108220000):
--
-- 1. get_circle_for_providers: a completed booking only counts as a visit if
--    the appointment ended AFTER the client saw the one-time "Show where I
--    go" notice (or turned the switch on, which also marks it seen). Before,
--    seeing the notice shared the client's whole booking history.
--    Recommends are unchanged: they're a deliberate tap and always show while
--    the master switch is on.
--
-- 2. get_my_people: a new 'blocked' list (people I've blocked), so the app
--    can show a Blocked list with Unblock. unblock_person already exists.
--
-- Both are CREATE OR REPLACE of #358's functions, rebuilt from their applied
-- source with only these lines changed. The md5 guards refuse to run if
-- either live definition has moved on since 2026-11-08, so this can't revert
-- someone else's later change. Grants are kept by CREATE OR REPLACE.

BEGIN;

DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.get_circle_for_providers(uuid[])'::regprocedure)) <> 'f93b00e98b5f84c6d888ed1d366f5549' THEN
    RAISE EXCEPTION 'get_circle_for_providers changed since this was written; rebuild it from the live definition';
  END IF;
  IF md5(pg_get_functiondef('public.get_my_people(text)'::regprocedure)) <> 'cdcd89d853268adaf59c23f6ba6150fd' THEN
    RAISE EXCEPTION 'get_my_people changed since this was written; rebuild it from the live definition';
  END IF;
END
$guard$;

-- p_kind: 'followers' | 'following' | 'requests' (incoming, pending) | 'blocked'.
CREATE OR REPLACE FUNCTION public.get_my_people(p_kind text)
RETURNS TABLE (
  user_id uuid,
  name text,
  avatar_url text,
  status text,
  since timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
  IF p_kind = 'following' THEN
    RETURN QUERY
    SELECT u.id, u.name, u.avatar_url,
           CASE WHEN f.status = 'declined' THEN 'pending' ELSE f.status END, f.created_at
    FROM public.client_follows f JOIN public.users u ON u.id = f.followee_id
    WHERE f.follower_id = v_uid AND u.deletion_requested_at IS NULL
    ORDER BY f.created_at DESC LIMIT 500;
  ELSIF p_kind = 'followers' THEN
    RETURN QUERY
    SELECT u.id, u.name, u.avatar_url, f.status, f.created_at
    FROM public.client_follows f JOIN public.users u ON u.id = f.follower_id
    WHERE f.followee_id = v_uid AND f.status = 'accepted' AND u.deletion_requested_at IS NULL
    ORDER BY f.created_at DESC LIMIT 500;
  ELSIF p_kind = 'requests' THEN
    RETURN QUERY
    SELECT u.id, u.name, u.avatar_url, f.status, f.created_at
    FROM public.client_follows f JOIN public.users u ON u.id = f.follower_id
    WHERE f.followee_id = v_uid AND f.status = 'pending' AND u.deletion_requested_at IS NULL
    ORDER BY f.created_at DESC LIMIT 500;
  ELSIF p_kind = 'blocked' THEN
    -- People I've blocked, so a block can be undone (unblock_person).
    RETURN QUERY
    SELECT u.id, u.name, u.avatar_url, 'blocked'::text, b.created_at
    FROM public.client_blocks b JOIN public.users u ON u.id = b.blocked_id
    WHERE b.blocker_id = v_uid AND u.deletion_requested_at IS NULL
    ORDER BY b.created_at DESC LIMIT 500;
  ELSE
    RAISE EXCEPTION 'Unknown list.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_circle_for_providers(p_provider_ids uuid[])
RETURNS TABLE (
  provider_id uuid,
  person_id uuid,
  name text,
  avatar_url text,
  recommends boolean,
  visits integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
  IF NOT public.social_is_active_client(v_uid) THEN RETURN; END IF;
  IF p_provider_ids IS NULL OR cardinality(p_provider_ids) = 0 THEN RETURN; END IF;
  IF cardinality(p_provider_ids) > 300 THEN
    RAISE EXCEPTION 'Too many providers to check at once.';
  END IF;

  RETURN QUERY
  WITH people AS (
    SELECT u.id AS pid, u.name AS pname, u.avatar_url AS pavatar,
           s.where_i_go_notice_seen_at AS notice_seen_at
    FROM public.client_follows f
    JOIN public.users u ON u.id = f.followee_id
    LEFT JOIN public.client_social_settings s ON s.user_id = u.id
    WHERE f.follower_id = v_uid
      AND f.status = 'accepted'
      AND u.has_client_profile
      AND u.deletion_requested_at IS NULL
      AND coalesce(s.show_where_i_go, public.social_default_show_where_i_go(u.id))
      AND NOT public.social_blocked_either_way(v_uid, u.id)
  ),
  live AS (
    -- Client-facing: only live, active providers.
    SELECT p.id AS lid,
           EXISTS (
             SELECT 1 FROM unnest(
               CASE WHEN cardinality(coalesce(p.service_categories, '{}')) > 0
                    THEN p.service_categories ELSE ARRAY[p.service_category] END) AS c(cat)
             WHERE upper(btrim(c.cat)) = 'AESTHETICS') AS sensitive
    FROM public.providers p
    WHERE p.id = ANY (p_provider_ids) AND p.has_gone_live = true AND p.is_active = true
  ),
  recs AS (
    SELECT r.client_id AS pid, r.provider_id AS lid
    FROM public.provider_recommendations r
    JOIN people pe ON pe.pid = r.client_id
    JOIN live l ON l.lid = r.provider_id
  ),
  visits AS (
    SELECT b.user_id AS pid, b.provider_id AS lid, count(*)::int AS n
    FROM public.bookings b
    JOIN people pe ON pe.pid = b.user_id AND pe.notice_seen_at IS NOT NULL
    JOIN live l ON l.lid = b.provider_id
    WHERE b.status = 'completed'
      -- Only appointments that ended after the notice was seen (decided
      -- 2026-11-08): seeing it shares visits from then on, not the past.
      AND ((b.booking_date + coalesce(b.end_time, b.booking_time, time '00:00'))
             AT TIME ZONE 'Europe/London') >= pe.notice_seen_at
    GROUP BY b.user_id, b.provider_id
  ),
  combined AS (
    SELECT coalesce(r.pid, v.pid) AS pid, coalesce(r.lid, v.lid) AS lid,
           (r.pid IS NOT NULL) AS rec, coalesce(v.n, 0) AS n
    FROM recs r FULL OUTER JOIN visits v ON v.pid = r.pid AND v.lid = r.lid
  )
  SELECT c.lid, c.pid, pe.pname, pe.pavatar, c.rec, c.n
  FROM combined c
  JOIN people pe ON pe.pid = c.pid
  JOIN live l ON l.lid = c.lid
  WHERE NOT EXISTS (
          SELECT 1 FROM public.client_hidden_providers h
          WHERE h.client_id = c.pid AND h.provider_id = c.lid)
    AND (c.rec OR NOT l.sensitive)
  ORDER BY c.lid, c.rec DESC, c.n DESC, pe.pname;
END;
$$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261109130000', 'follow_people_visits_from_notice_and_blocked_list')
ON CONFLICT (version) DO NOTHING;

COMMIT;
