-- Marketing Studio: a weekly AI planner drafts social posts (TikTok first,
-- then Instagram, YouTube Shorts, Pinterest, ad concepts) into a review queue
-- that only CERVICED admins see. Nothing is posted by the system: an admin
-- approves, posts it themselves, then logs the post's numbers so the next
-- week's plan learns from what actually worked.
--
-- Three admin-only tables (RLS on, no policies: the app reaches them only
-- through the SECURITY DEFINER admin_marketing_* functions below, which check
-- is_cerviced_admin(); the edge function uses the service role):
--   marketing_posts      one drafted idea and everything that happened to it
--   marketing_learnings  what the planner has learned (trends, what works,
--                        what flops, platform rules), retired when disproved
--   marketing_runs       one row per planner run, so the screen can show
--                        "drafting…" and a failure reason
--
-- marketing_app_snapshot() hands the planner aggregate facts only (counts by
-- category and area, booked categories). No provider or client is named:
-- featuring a real provider's work needs their permission, which doesn't
-- exist as a setting yet.
--
-- Cron 'marketing-weekly' (Mondays 06:00 UTC) posts to the marketing-studio
-- edge function with the vault service key, same shape as
-- process_money_daily_summary().
--
-- Lock: supabase/MIGRATION_OWNER.md on feat/marketing-studio. Frontier when
-- written: live max 20261109200000, no higher migration on any open PR.

BEGIN;

-- ── 1. tables ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketing_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  status        text NOT NULL DEFAULT 'running'
                CONSTRAINT marketing_runs_status_check CHECK (status IN ('running', 'done', 'failed')),
  trigger       text NOT NULL DEFAULT 'schedule'
                CONSTRAINT marketing_runs_trigger_check CHECK (trigger IN ('schedule', 'admin')),
  week_theme    text,
  posts_drafted integer NOT NULL DEFAULT 0,
  error         text,
  usage         jsonb
);

CREATE TABLE IF NOT EXISTS public.marketing_posts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  run_id          uuid REFERENCES public.marketing_runs(id) ON DELETE SET NULL,
  platform        text NOT NULL
                  CONSTRAINT marketing_posts_platform_check
                  CHECK (platform IN ('tiktok', 'instagram', 'youtube_shorts', 'pinterest', 'paid_ad')),
  format          text NOT NULL
                  CONSTRAINT marketing_posts_format_check
                  CHECK (format IN ('video', 'carousel', 'photo', 'story', 'ad')),
  pillar          text NOT NULL,
  title           text NOT NULL,
  hook            text NOT NULL,
  concept         text NOT NULL,
  shots           text[] NOT NULL DEFAULT '{}',
  on_screen_text  text NOT NULL DEFAULT '',
  caption         text NOT NULL DEFAULT '',
  hashtags        text[] NOT NULL DEFAULT '{}',
  sound_idea      text NOT NULL DEFAULT '',
  also_post_to    text[] NOT NULL DEFAULT '{}',
  why_now         text NOT NULL DEFAULT '',
  sources         text[] NOT NULL DEFAULT '{}',
  ai_use          text NOT NULL DEFAULT 'none'
                  CONSTRAINT marketing_posts_ai_use_check
                  CHECK (ai_use IN ('none', 'ideas_only', 'ai_visuals_labelled')),
  needs           text NOT NULL DEFAULT '',
  best_time       text NOT NULL DEFAULT '',
  ad_budget_note  text NOT NULL DEFAULT '',
  status          text NOT NULL DEFAULT 'draft'
                  CONSTRAINT marketing_posts_status_check
                  CHECK (status IN ('draft', 'approved', 'rejected', 'posted')),
  review_note     text,
  reviewed_at     timestamptz,
  posted_at       timestamptz,
  post_url        text,
  views           integer CONSTRAINT marketing_posts_views_check    CHECK (views    IS NULL OR views    >= 0),
  likes           integer CONSTRAINT marketing_posts_likes_check    CHECK (likes    IS NULL OR likes    >= 0),
  comments        integer CONSTRAINT marketing_posts_comments_check CHECK (comments IS NULL OR comments >= 0),
  shares          integer CONSTRAINT marketing_posts_shares_check   CHECK (shares   IS NULL OR shares   >= 0),
  saves           integer CONSTRAINT marketing_posts_saves_check    CHECK (saves    IS NULL OR saves    >= 0),
  follows         integer CONSTRAINT marketing_posts_follows_check  CHECK (follows  IS NULL OR follows  >= 0),
  results_note    text,
  results_at      timestamptz
);
CREATE INDEX IF NOT EXISTS marketing_posts_status_created_idx
  ON public.marketing_posts (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.marketing_learnings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  run_id      uuid REFERENCES public.marketing_runs(id) ON DELETE SET NULL,
  kind        text NOT NULL
              CONSTRAINT marketing_learnings_kind_check
              CHECK (kind IN ('trend', 'what_works', 'what_flops', 'platform_rule', 'brand_rule')),
  insight     text NOT NULL,
  evidence    text NOT NULL DEFAULT '',
  active      boolean NOT NULL DEFAULT true,
  retired_at  timestamptz,
  retired_by  text CONSTRAINT marketing_learnings_retired_by_check
              CHECK (retired_by IS NULL OR retired_by IN ('planner', 'admin'))
);
CREATE INDEX IF NOT EXISTS marketing_learnings_active_idx
  ON public.marketing_learnings (active, created_at DESC);

ALTER TABLE public.marketing_runs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_posts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_learnings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketing_runs, public.marketing_posts, public.marketing_learnings FROM anon, authenticated;

-- ── 2. what the planner may know about the app (aggregates only) ───────────
CREATE OR REPLACE FUNCTION public.marketing_app_snapshot()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'live_providers', (SELECT count(*) FROM public.providers WHERE has_gone_live = true AND is_active = true),
    'new_live_providers_30d', (SELECT count(*) FROM public.providers
                                WHERE has_gone_live = true AND is_active = true AND created_at > now() - interval '30 days'),
    'link_only_providers', (SELECT count(*) FROM public.providers
                             WHERE has_gone_live = true AND is_active = true AND booking_mode = 'external'),
    'live_by_category', COALESCE((SELECT jsonb_object_agg(cat, n) FROM (
        SELECT COALESCE(service_category, 'OTHER') AS cat, count(*) AS n
          FROM public.providers WHERE has_gone_live = true AND is_active = true
         GROUP BY 1) c), '{}'::jsonb),
    'live_by_area', COALESCE((SELECT jsonb_agg(jsonb_build_object('area', area, 'providers', n) ORDER BY n DESC) FROM (
        SELECT location_text AS area, count(*) AS n
          FROM public.providers
         WHERE has_gone_live = true AND is_active = true AND COALESCE(location_text, '') <> ''
         GROUP BY 1 ORDER BY 2 DESC LIMIT 10) a), '[]'::jsonb),
    'booked_categories_30d', COALESCE((SELECT jsonb_object_agg(cat, n) FROM (
        SELECT COALESCE(service_category_snapshot, 'OTHER') AS cat, count(*) AS n
          FROM public.bookings
         WHERE created_at > now() - interval '30 days'
         GROUP BY 1) b), '{}'::jsonb),
    'bookings_30d', (SELECT count(*) FROM public.bookings WHERE created_at > now() - interval '30 days')
  );
$function$;
REVOKE EXECUTE ON FUNCTION public.marketing_app_snapshot() FROM PUBLIC, anon, authenticated;

-- ── 3. what an admin sees and does ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_marketing_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_cerviced_admin() THEN
    RAISE EXCEPTION 'Only CERVICED admins can see marketing.' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'generated_at', now(),
    'posts', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC) FROM (
        SELECT * FROM public.marketing_posts
         WHERE status IN ('draft', 'approved')
            OR (status = 'posted' AND posted_at > now() - interval '90 days')
            OR (status = 'rejected' AND reviewed_at > now() - interval '14 days')
         ORDER BY created_at DESC
         LIMIT 200) p), '[]'::jsonb),
    'learnings', COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.created_at DESC) FROM (
        SELECT id, created_at, kind, insight, evidence FROM public.marketing_learnings
         WHERE active ORDER BY created_at DESC LIMIT 100) l), '[]'::jsonb),
    'last_run', (SELECT to_jsonb(r) FROM (
        SELECT id, started_at, finished_at, status, trigger, week_theme, posts_drafted, error
          FROM public.marketing_runs ORDER BY started_at DESC LIMIT 1) r)
  );
END;
$function$;

-- Approve, turn down (with a note the planner reads), or put back to draft.
CREATE OR REPLACE FUNCTION public.admin_marketing_review(p_post_id uuid, p_decision text, p_note text DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_status text;
BEGIN
  IF NOT public.is_cerviced_admin() THEN
    RAISE EXCEPTION 'Only CERVICED admins can review marketing.' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('approved', 'rejected', 'draft') THEN
    RAISE EXCEPTION 'That isn''t a review decision.';
  END IF;
  SELECT status INTO v_status FROM public.marketing_posts WHERE id = p_post_id FOR UPDATE;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'That idea no longer exists.';
  END IF;
  IF v_status = 'posted' THEN
    RAISE EXCEPTION 'That one is already posted.';
  END IF;
  UPDATE public.marketing_posts
     SET status = p_decision,
         review_note = NULLIF(btrim(COALESCE(p_note, '')), ''),
         reviewed_at = CASE WHEN p_decision = 'draft' THEN NULL ELSE now() END
   WHERE id = p_post_id;
END;
$function$;

-- The caption is the one field an admin rewrites before posting.
CREATE OR REPLACE FUNCTION public.admin_marketing_edit_caption(p_post_id uuid, p_caption text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_cerviced_admin() THEN
    RAISE EXCEPTION 'Only CERVICED admins can edit marketing.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.marketing_posts SET caption = COALESCE(p_caption, '') WHERE id = p_post_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That idea no longer exists.';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_marketing_mark_posted(p_post_id uuid, p_url text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_status text;
BEGIN
  IF NOT public.is_cerviced_admin() THEN
    RAISE EXCEPTION 'Only CERVICED admins can update marketing.' USING ERRCODE = '42501';
  END IF;
  SELECT status INTO v_status FROM public.marketing_posts WHERE id = p_post_id FOR UPDATE;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'That idea no longer exists.';
  END IF;
  IF v_status NOT IN ('approved', 'posted') THEN
    RAISE EXCEPTION 'Approve it before marking it posted.';
  END IF;
  UPDATE public.marketing_posts
     SET status = 'posted',
         posted_at = COALESCE(posted_at, now()),
         post_url = NULLIF(btrim(COALESCE(p_url, '')), '')
   WHERE id = p_post_id;
END;
$function$;

-- The numbers from the platform's own analytics, typed in by an admin.
CREATE OR REPLACE FUNCTION public.admin_marketing_record_results(
  p_post_id uuid, p_views integer, p_likes integer, p_comments integer,
  p_shares integer, p_saves integer, p_follows integer, p_note text DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_cerviced_admin() THEN
    RAISE EXCEPTION 'Only CERVICED admins can update marketing.' USING ERRCODE = '42501';
  END IF;
  IF LEAST(COALESCE(p_views, 0), COALESCE(p_likes, 0), COALESCE(p_comments, 0),
           COALESCE(p_shares, 0), COALESCE(p_saves, 0), COALESCE(p_follows, 0)) < 0 THEN
    RAISE EXCEPTION 'Results can''t be negative.';
  END IF;
  UPDATE public.marketing_posts
     SET views = p_views, likes = p_likes, comments = p_comments,
         shares = p_shares, saves = p_saves, follows = p_follows,
         results_note = NULLIF(btrim(COALESCE(p_note, '')), ''),
         results_at = now()
   WHERE id = p_post_id AND status = 'posted';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mark it posted before adding results.';
  END IF;
END;
$function$;

-- An admin disagrees with something the planner learned.
CREATE OR REPLACE FUNCTION public.admin_marketing_retire_learning(p_learning_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_cerviced_admin() THEN
    RAISE EXCEPTION 'Only CERVICED admins can update marketing.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.marketing_learnings
     SET active = false, retired_at = now(), retired_by = 'admin'
   WHERE id = p_learning_id AND active;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_marketing_overview() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_marketing_review(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_marketing_edit_caption(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_marketing_mark_posted(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_marketing_record_results(uuid, integer, integer, integer, integer, integer, integer, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_marketing_retire_learning(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_marketing_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_marketing_review(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_marketing_edit_caption(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_marketing_mark_posted(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_marketing_record_results(uuid, integer, integer, integer, integer, integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_marketing_retire_learning(uuid) TO authenticated;

-- ── 4. the weekly run ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_marketing_weekly()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_key text;
BEGIN
  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
   WHERE name = 'service_role_key'
   LIMIT 1;
  IF v_key IS NULL OR v_key = '' OR v_key LIKE '<%' THEN
    RETURN false;
  END IF;

  PERFORM net.http_post(
    url     := 'https://ztrfpfvvejzaysrelmfm.supabase.co/functions/v1/marketing-studio',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := jsonb_build_object('trigger', 'schedule'),
    timeout_milliseconds := 10000
  );
  RETURN true;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.process_marketing_weekly() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('marketing-weekly') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'marketing-weekly');
SELECT cron.schedule('marketing-weekly', '0 6 * * 1', 'SELECT public.process_marketing_weekly();');

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261109210000', 'marketing_studio')
ON CONFLICT (version) DO NOTHING;

COMMIT;
