-- Clients can ask a link-only provider to take bookings on CERVICED. A nudge
-- is a daily, deduplicated demand signal for that provider only; it is never
-- exposed to other clients and cannot be forged for the caller's own profile.
ALTER TABLE public.provider_daily_stats
  ADD COLUMN IF NOT EXISTS join_nudges integer NOT NULL DEFAULT 0;

-- Extends the existing, client-callable counter RPC. This deliberately keeps
-- the existing auth.uid(), visibility, ownership and per-day dedupe checks;
-- `join_nudge` is only one more permitted counter kind.
CREATE OR REPLACE FUNCTION public.record_provider_stat(p_provider_ids uuid[], p_kind text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_day date := (now() AT TIME ZONE 'Europe/London')::date;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;
  IF p_kind NOT IN ('profile_view', 'book_tap', 'search_appearance', 'instagram_tap', 'join_nudge') THEN
    RAISE EXCEPTION 'Unknown stat kind: %', p_kind USING errcode = '22023';
  END IF;
  IF p_provider_ids IS NULL OR cardinality(p_provider_ids) = 0 THEN
    RETURN;
  END IF;
  IF cardinality(p_provider_ids) > 200 THEN
    RAISE EXCEPTION 'Too many providers in one stat call' USING errcode = '22023';
  END IF;

  WITH first_today AS (
    INSERT INTO public.provider_stat_viewers (viewer_id, provider_id, day, kind)
    SELECT v_uid, p.id, v_day, p_kind
    FROM public.providers p
    WHERE p.id = ANY (p_provider_ids)
      AND p.has_gone_live = true
      AND p.is_active = true
      AND p.user_id IS DISTINCT FROM v_uid
    ORDER BY p.id
    ON CONFLICT DO NOTHING
    RETURNING provider_id
  )
  INSERT INTO public.provider_daily_stats AS s
    (provider_id, day, profile_views, book_taps, search_appearances, instagram_taps, join_nudges)
  SELECT f.provider_id, v_day,
         (p_kind = 'profile_view')::int,
         (p_kind = 'book_tap')::int,
         (p_kind = 'search_appearance')::int,
         (p_kind = 'instagram_tap')::int,
         (p_kind = 'join_nudge')::int
  FROM first_today f
  ORDER BY f.provider_id
  ON CONFLICT (provider_id, day) DO UPDATE SET
    profile_views      = s.profile_views      + EXCLUDED.profile_views,
    book_taps          = s.book_taps          + EXCLUDED.book_taps,
    search_appearances = s.search_appearances + EXCLUDED.search_appearances,
    instagram_taps     = s.instagram_taps     + EXCLUDED.instagram_taps,
    join_nudges        = s.join_nudges        + EXCLUDED.join_nudges;
END;
$function$;

-- PostgreSQL does not permit CREATE OR REPLACE to add a RETURNS TABLE column,
-- so replace the read RPC with the compatible five-counter shape. It returns
-- only the calling provider's own rows.
DROP FUNCTION IF EXISTS public.get_my_provider_daily_stats(integer);
CREATE FUNCTION public.get_my_provider_daily_stats(p_days integer)
 RETURNS TABLE(
   day date,
   profile_views integer,
   book_taps integer,
   search_appearances integer,
   instagram_taps integer,
   join_nudges integer
 )
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT s.day, s.profile_views, s.book_taps, s.search_appearances,
         s.instagram_taps, s.join_nudges
  FROM public.provider_daily_stats s
  JOIN public.providers p ON p.id = s.provider_id
  WHERE p.user_id = auth.uid()
    AND s.day > (now() AT TIME ZONE 'Europe/London')::date
      - least(greatest(coalesce(p_days, 7), 1), 3650)
  ORDER BY s.day;
$function$;

REVOKE ALL ON FUNCTION public.record_provider_stat(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_provider_stat(uuid[], text) TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_provider_daily_stats(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_provider_daily_stats(integer) TO authenticated;
