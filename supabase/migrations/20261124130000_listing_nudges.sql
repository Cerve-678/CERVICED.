-- Join nudges for "Not on CERVICED yet" listings (2026-11-24).
--
-- A client on a directory listing's page (an imported business that hasn't
-- joined: providers.is_claimed = false AND source = 'scraped') gets the same
-- "Want them on CERVICED? [Nudge]" bar a link-only provider's page already has.
-- The CERVICED team messages the most-nudged businesses on Instagram by hand;
-- nothing here contacts anyone.
--
-- This reuses the existing join nudge rather than adding a second system:
--
--   1. record_provider_stat: 'join_nudge' is also accepted for an active
--      directory listing. Every other stat kind still needs has_gone_live, and
--      the one-per-client-per-day rule (provider_stat_viewers) is unchanged.
--      Because the counts live in provider_daily_stats, they carry over when
--      the owner claims the listing and opens their Analytics.
--   2. listing_nudge_count(id): how many people nudged a listing. The claim
--      screen shows it to the owner, who may not be signed in yet.
--   3. admin_listing_nudges(): admins only, the outreach list, most people first.
--
-- record_provider_stat is redefined from the live definition, with an md5 guard
-- so a newer live version is never silently overwritten.
--
-- Numbered above live max (20261123220000); no open PR has an unapplied
-- migration above that.

BEGIN;

DO $$
BEGIN
  IF md5(pg_get_functiondef('public.record_provider_stat(uuid[], text)'::regprocedure))
     <> '33e29c0b6fafe424e61212b7ee916b88' THEN
    RAISE EXCEPTION 'record_provider_stat changed on live since this migration was written; redefine it from the live version.';
  END IF;
END $$;

-- ── 1. accept join nudges for directory listings ─────────────────────────────
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
      AND p.is_active = true
      AND p.user_id IS DISTINCT FROM v_uid
      AND (
        p.has_gone_live = true
        -- A directory listing can never go live (nobody owns it), but clients
        -- can nudge it to join. Only nudges: it has no bookings or views to count.
        OR (p_kind = 'join_nudge' AND p.is_claimed = false AND p.source = 'scraped')
      )
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

-- Grants unchanged from live: authenticated only.
REVOKE EXECUTE ON FUNCTION public.record_provider_stat(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_provider_stat(uuid[], text) TO authenticated;

-- ── 2. how many people nudged a listing ─────────────────────────────────────
-- A count only, never who. Callable signed out because the claim screen is part
-- of sign-up. Directory listings only, so it can't be used to read a live
-- provider's Analytics.
CREATE OR REPLACE FUNCTION public.listing_nudge_count(p_provider_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(DISTINCT v.viewer_id)::integer
  FROM public.provider_stat_viewers v
  JOIN public.providers p ON p.id = v.provider_id
  WHERE v.provider_id = p_provider_id
    AND v.kind = 'join_nudge'
    AND p.is_claimed = false
    AND p.source = 'scraped';
$$;

REVOKE EXECUTE ON FUNCTION public.listing_nudge_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listing_nudge_count(uuid) TO anon, authenticated;

-- ── 3. the admin outreach list ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_listing_nudges(p_limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
  v_rows jsonb;
BEGIN
  IF NOT public.is_cerviced_admin() THEN
    RAISE EXCEPTION 'Only CERVICED admins can do this.';
  END IF;

  SELECT COALESCE(jsonb_agg(ranked.row_data ORDER BY ranked.people DESC, ranked.last_day DESC), '[]'::jsonb)
    INTO v_rows
  FROM (
    SELECT
      count(DISTINCT v.viewer_id) AS people,
      max(v.day) AS last_day,
      jsonb_build_object(
        'provider_id',      p.id,
        'display_name',     p.display_name,
        'instagram',        p.instagram,
        'service_category', p.service_category,
        'location_text',    p.location_text,
        'people',           count(DISTINCT v.viewer_id),
        'nudges',           count(*),
        'last_nudged_on',   max(v.day)
      ) AS row_data
    FROM public.provider_stat_viewers v
    JOIN public.providers p ON p.id = v.provider_id
    WHERE v.kind = 'join_nudge'
      AND p.is_claimed = false
      AND p.source = 'scraped'
      AND p.is_active = true
    GROUP BY p.id
    ORDER BY count(DISTINCT v.viewer_id) DESC, max(v.day) DESC
    LIMIT v_limit
  ) ranked;

  RETURN v_rows;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_listing_nudges(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_listing_nudges(integer) TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261124130000', 'listing_nudges')
ON CONFLICT (version) DO NOTHING;

COMMIT;
