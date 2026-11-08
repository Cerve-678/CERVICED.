-- Follow people, Recommend, and "Show where I go" (2026-11-08).
--
-- Clients follow other clients. A follower whose follow is ACCEPTED sees the
-- followed person's face on the cards of providers that person has
-- recommended or (after they've seen the one-time notice) completed a booking
-- with. Every read and write goes through the SECURITY DEFINER functions
-- below; the tables have RLS on and no policies, so nothing is readable or
-- writable directly — in particular `users` stays owner-only.
--
-- Product decisions (user, 2026-11-08), each enforced here, not in the app:
--   * Follow requests need approval by default (is_private defaults true);
--     an OPEN account accepts every follow at once, and its followers see
--     where it goes like any other approved follower.
--   * "Show where I go" is ONE master switch. NULL means "the default":
--     on for adults, OFF for under-18s. Off hides recommends too.
--   * Under-18s are always private and never findable by phone number,
--     whatever they set.
--   * Visits (completed bookings) only show once the person has seen the
--     one-time notice (where_i_go_notice_seen_at). Recommends are a
--     deliberate tap and show regardless.
--   * A client can hide any provider. AESTHETICS providers' visits never
--     show unless the client recommends them.
--   * Cards never name a service: this returns provider + person only.
--   * Joined under 18 (or age unknown): Show where I go stays OFF until
--     switched on, even after turning 18; under-18s can't be found by name
--     search unless already connected.
--   * Contact matching, name search and follow requests are rate limited
--     per account (social_take_budget), and a number shared by two accounts
--     matches neither.
--   * Contacts match on users.phone as typed — it is NOT verified (user's
--     explicit decision; see LEGAL-COMPLIANCE-NOTES). Hashes sent by the app
--     are compared in-query and never stored.

BEGIN;

-- ── Helpers ──────────────────────────────────────────────

-- UK-first E.164 digits (no '+'): "07700 900123" and "+44 7700 900123" both
-- become "447700900123". Mirrored by normalisePhoneForMatching() in
-- src/utils/phoneMatching.ts — keep the two in step (parity-tested).
CREATE OR REPLACE FUNCTION public.social_normalise_phone(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  WITH d AS (SELECT regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') AS digits),
  e AS (
    SELECT CASE
      WHEN digits LIKE '00%' THEN substr(digits, 3)
      -- "+44 (0)7700 900123" keeps a stray trunk 0 after the country code.
      WHEN digits LIKE '440%' AND length(digits) = 13 THEN '44' || substr(digits, 4)
      WHEN digits LIKE '0%' AND length(digits) = 11 THEN '44' || substr(digits, 2)
      ELSE digits
    END AS digits
    FROM d
  )
  SELECT CASE WHEN length(digits) BETWEEN 9 AND 15 THEN digits ELSE NULL END FROM e;
$$;

CREATE OR REPLACE FUNCTION public.social_phone_hash(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN public.social_normalise_phone(p_phone) IS NULL THEN NULL
    ELSE encode(sha256(convert_to(public.social_normalise_phone(p_phone), 'UTF8')), 'hex')
  END;
$$;

-- Under 18 on a given day, by date of birth (or birth year when that's all
-- we have; a birth year counts as under 18 for the whole of the 18th year).
-- Unknown age fails CLOSED and counts as under 18.
CREATE OR REPLACE FUNCTION public.social_is_minor_on(p_user uuid, p_day date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(
    (SELECT CASE
       WHEN u.dob IS NOT NULL THEN u.dob > (p_day - interval '18 years')::date
       WHEN u.birth_year IS NOT NULL THEN u.birth_year >= extract(year FROM p_day)::int - 18
       ELSE true
     END
     FROM public.users u WHERE u.id = p_user),
    true);
$$;

CREATE OR REPLACE FUNCTION public.social_is_minor(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.social_is_minor_on(p_user, current_date);
$$;

-- What a NULL "Show where I go" means: on only for someone who was an adult
-- when they joined, so a 17-year-old's default doesn't flip on at 18.
CREATE OR REPLACE FUNCTION public.social_default_show_where_i_go(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT NOT public.social_is_minor(p_user)
     AND NOT public.social_is_minor_on(
           p_user,
           coalesce((SELECT u.created_at::date FROM public.users u WHERE u.id = p_user), current_date));
$$;

-- ── Tables ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_social_settings (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  is_private boolean NOT NULL DEFAULT true,
  -- NULL = default (on for adults, off for under-18s).
  show_where_i_go boolean,
  findable_by_phone boolean NOT NULL DEFAULT true,
  where_i_go_notice_seen_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.client_follows (
  follower_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  followee_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- 'declined' looks like 'pending' to the requester (a decline is never
  -- announced) and stops re-requests for 30 days.
  status text NOT NULL CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);
CREATE INDEX IF NOT EXISTS client_follows_followee_idx ON public.client_follows (followee_id, status);

CREATE TABLE IF NOT EXISTS public.client_blocks (
  blocker_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS client_blocks_blocked_idx ON public.client_blocks (blocked_id);

CREATE TABLE IF NOT EXISTS public.provider_recommendations (
  client_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, provider_id)
);
CREATE INDEX IF NOT EXISTS provider_recommendations_provider_idx ON public.provider_recommendations (provider_id);

CREATE TABLE IF NOT EXISTS public.client_hidden_providers (
  client_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, provider_id)
);

-- Lookup index for contact matching: one hash per account, kept in step
-- with users.phone by trigger. The number itself is never copied here.
CREATE TABLE IF NOT EXISTS public.client_phone_index (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  phone_hash text NOT NULL
);
CREATE INDEX IF NOT EXISTS client_phone_index_hash_idx ON public.client_phone_index (phone_hash);

-- Per-account budgets for the calls that could be scripted to enumerate
-- people (contact matching, name search, follow requests).
CREATE TABLE IF NOT EXISTS public.social_rate_limits (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  bucket text NOT NULL,
  window_start timestamptz NOT NULL,
  used integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, bucket, window_start)
);

-- Name search: ILIKE '%q%' on users.name uses this rather than a full scan.
CREATE INDEX IF NOT EXISTS users_client_name_trgm_idx
  ON public.users USING gin (name extensions.gin_trgm_ops)
  WHERE has_client_profile;

ALTER TABLE public.client_social_settings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_follows           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_blocks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_hidden_providers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_phone_index       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_rate_limits       ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.client_social_settings, public.client_follows, public.client_blocks,
              public.provider_recommendations, public.client_hidden_providers,
              public.client_phone_index, public.social_rate_limits
  FROM PUBLIC, anon, authenticated;

-- ── Triggers ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_client_phone_index()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hash text := public.social_phone_hash(NEW.phone);
BEGIN
  IF v_hash IS NULL THEN
    DELETE FROM public.client_phone_index WHERE user_id = NEW.id;
  ELSE
    INSERT INTO public.client_phone_index (user_id, phone_hash)
    VALUES (NEW.id, v_hash)
    ON CONFLICT (user_id) DO UPDATE SET phone_hash = EXCLUDED.phone_hash;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_client_phone_index() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS users_sync_client_phone_index ON public.users;
CREATE TRIGGER users_sync_client_phone_index
  AFTER INSERT OR UPDATE OF phone ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_client_phone_index();

-- Removing the client hat (delete_client_profile sets has_client_profile =
-- false) removes everything social, both directions. Full account deletion
-- is covered by ON DELETE CASCADE.
CREATE OR REPLACE FUNCTION public.clear_client_social_on_hat_removed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF coalesce(OLD.has_client_profile, false) AND NOT coalesce(NEW.has_client_profile, false) THEN
    DELETE FROM public.client_follows WHERE follower_id = NEW.id OR followee_id = NEW.id;
    DELETE FROM public.client_blocks WHERE blocker_id = NEW.id OR blocked_id = NEW.id;
    DELETE FROM public.provider_recommendations WHERE client_id = NEW.id;
    DELETE FROM public.client_hidden_providers WHERE client_id = NEW.id;
    DELETE FROM public.client_social_settings WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.clear_client_social_on_hat_removed() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS users_clear_client_social ON public.users;
CREATE TRIGGER users_clear_client_social
  AFTER UPDATE OF has_client_profile ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.clear_client_social_on_hat_removed();

-- Backfill the phone index for existing accounts.
INSERT INTO public.client_phone_index (user_id, phone_hash)
SELECT id, public.social_phone_hash(phone)
FROM public.users
WHERE public.social_phone_hash(phone) IS NOT NULL
ON CONFLICT (user_id) DO UPDATE SET phone_hash = EXCLUDED.phone_hash;

-- ── Internal predicates ──────────────────────────────────

-- Someone who can take part at all: client hat on, not mid-deletion.
CREATE OR REPLACE FUNCTION public.social_is_active_client(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = p_user AND u.has_client_profile AND u.deletion_requested_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.social_blocked_either_way(p_a uuid, p_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.client_blocks
    WHERE (blocker_id = p_a AND blocked_id = p_b) OR (blocker_id = p_b AND blocked_id = p_a)
  );
$$;

CREATE OR REPLACE FUNCTION public.social_effective_private(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.social_is_minor(p_user)
      OR coalesce((SELECT is_private FROM public.client_social_settings WHERE user_id = p_user), true);
$$;

CREATE OR REPLACE FUNCTION public.social_effective_show_where_i_go(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(
    (SELECT show_where_i_go FROM public.client_social_settings WHERE user_id = p_user),
    public.social_default_show_where_i_go(p_user));
$$;

REVOKE ALL ON FUNCTION public.social_is_minor(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.social_is_minor_on(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.social_default_show_where_i_go(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.social_is_active_client(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.social_blocked_either_way(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.social_effective_private(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.social_effective_show_where_i_go(uuid) FROM PUBLIC, anon, authenticated;

-- Spend p_cost from a per-account budget of p_limit per p_window. Raises
-- (and so rolls the spend back) once the budget is used up.
CREATE OR REPLACE FUNCTION public.social_take_budget(
  p_user uuid, p_bucket text, p_window interval, p_cost integer, p_limit integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_start timestamptz := date_bin(p_window, now(), timestamptz '2000-01-01');
  v_used integer;
BEGIN
  INSERT INTO public.social_rate_limits AS r (user_id, bucket, window_start, used)
  VALUES (p_user, p_bucket, v_start, p_cost)
  ON CONFLICT (user_id, bucket, window_start) DO UPDATE SET used = r.used + EXCLUDED.used
  RETURNING r.used INTO v_used;
  IF v_used > p_limit THEN
    RAISE EXCEPTION 'You''ve done that a lot just now. Please try again later.';
  END IF;
  DELETE FROM public.social_rate_limits
  WHERE user_id = p_user AND window_start < now() - interval '2 days';
END;
$$;
REVOKE ALL ON FUNCTION public.social_take_budget(uuid, text, interval, integer, integer) FROM PUBLIC, anon, authenticated;

-- ── My settings ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_social_settings()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_minor boolean;
  s public.client_social_settings%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
  v_minor := public.social_is_minor(v_uid);
  SELECT * INTO s FROM public.client_social_settings WHERE user_id = v_uid;
  RETURN jsonb_build_object(
    'is_minor', v_minor,
    'is_private', v_minor OR coalesce(s.is_private, true),
    'show_where_i_go', coalesce(s.show_where_i_go, public.social_default_show_where_i_go(v_uid)),
    'findable_by_phone', (NOT v_minor) AND coalesce(s.findable_by_phone, true),
    'where_i_go_notice_seen', s.where_i_go_notice_seen_at IS NOT NULL,
    'followers', (SELECT count(*) FROM public.client_follows WHERE followee_id = v_uid AND status = 'accepted'),
    'following', (SELECT count(*) FROM public.client_follows WHERE follower_id = v_uid AND status = 'accepted'),
    'requests', (SELECT count(*) FROM public.client_follows WHERE followee_id = v_uid AND status = 'pending')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_my_social_settings(
  p_is_private boolean DEFAULT NULL,
  p_show_where_i_go boolean DEFAULT NULL,
  p_findable_by_phone boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_minor boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
  v_minor := public.social_is_minor(v_uid);
  INSERT INTO public.client_social_settings (user_id) VALUES (v_uid) ON CONFLICT (user_id) DO NOTHING;
  -- Under-18s are stored private and unfindable too, so nothing they set
  -- quietly takes effect on their 18th birthday.
  UPDATE public.client_social_settings SET
    is_private = CASE WHEN v_minor THEN true ELSE coalesce(p_is_private, is_private) END,
    show_where_i_go = coalesce(p_show_where_i_go, show_where_i_go),
    findable_by_phone = CASE WHEN v_minor THEN false ELSE coalesce(p_findable_by_phone, findable_by_phone) END,
    updated_at = now()
  WHERE user_id = v_uid;
  -- Going open accepts everyone already waiting (under-18s can't go open).
  IF p_is_private = false AND NOT public.social_is_minor(v_uid) THEN
    UPDATE public.client_follows SET status = 'accepted', responded_at = now()
    WHERE followee_id = v_uid AND status = 'pending';
  END IF;
  RETURN public.get_my_social_settings();
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_where_i_go_notice_seen()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
  INSERT INTO public.client_social_settings (user_id, where_i_go_notice_seen_at, findable_by_phone)
  VALUES (auth.uid(), now(), NOT public.social_is_minor(auth.uid()))
  ON CONFLICT (user_id) DO UPDATE
    SET where_i_go_notice_seen_at = coalesce(public.client_social_settings.where_i_go_notice_seen_at, now());
END;
$$;

-- ── Following ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.request_follow(p_target uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_status text;
  v_responded timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
  IF p_target = v_uid THEN RAISE EXCEPTION 'You can''t follow yourself.'; END IF;
  IF NOT public.social_is_active_client(v_uid) THEN
    RAISE EXCEPTION 'Set up your client profile to follow people.';
  END IF;
  -- A block looks the same as a missing account, so it never reveals itself.
  IF NOT public.social_is_active_client(p_target) OR public.social_blocked_either_way(v_uid, p_target) THEN
    RAISE EXCEPTION 'This person isn''t available to follow.';
  END IF;

  SELECT f.status, f.responded_at INTO v_status, v_responded FROM public.client_follows f
  WHERE f.follower_id = v_uid AND f.followee_id = p_target;
  IF v_status IN ('pending', 'accepted') THEN RETURN v_status; END IF;
  -- Declined in the last 30 days: say "requested" and change nothing.
  IF v_status = 'declined' AND v_responded > now() - interval '30 days' THEN RETURN 'pending'; END IF;

  PERFORM public.social_take_budget(v_uid, 'follow_request', interval '1 day', 1, 100);
  v_status := CASE WHEN public.social_effective_private(p_target) THEN 'pending' ELSE 'accepted' END;
  INSERT INTO public.client_follows (follower_id, followee_id, status, responded_at)
  VALUES (v_uid, p_target, v_status, CASE WHEN v_status = 'accepted' THEN now() END)
  ON CONFLICT (follower_id, followee_id) DO UPDATE
    SET status = EXCLUDED.status, created_at = now(), responded_at = EXCLUDED.responded_at;
  RETURN v_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_follow_request(p_follower uuid, p_accept boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
  IF p_accept THEN
    UPDATE public.client_follows SET status = 'accepted', responded_at = now()
    WHERE follower_id = p_follower AND followee_id = auth.uid() AND status = 'pending';
  ELSE
    UPDATE public.client_follows SET status = 'declined', responded_at = now()
    WHERE follower_id = p_follower AND followee_id = auth.uid() AND status = 'pending';
  END IF;
END;
$$;

-- Unfollow, or cancel a request I sent.
CREATE OR REPLACE FUNCTION public.unfollow_person(p_target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
  DELETE FROM public.client_follows WHERE follower_id = auth.uid() AND followee_id = p_target;
END;
$$;

-- Remove someone who follows me. They aren't told.
CREATE OR REPLACE FUNCTION public.remove_follower(p_follower uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
  DELETE FROM public.client_follows WHERE follower_id = p_follower AND followee_id = auth.uid();
END;
$$;

-- Block: removes follows both ways and hides each from the other in search,
-- contact matching and card stacks. The blocked person isn't told.
CREATE OR REPLACE FUNCTION public.block_person(p_target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
  IF p_target = v_uid THEN RAISE EXCEPTION 'You can''t block yourself.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_target) THEN RETURN; END IF;
  INSERT INTO public.client_blocks (blocker_id, blocked_id) VALUES (v_uid, p_target)
  ON CONFLICT DO NOTHING;
  DELETE FROM public.client_follows
  WHERE (follower_id = v_uid AND followee_id = p_target)
     OR (follower_id = p_target AND followee_id = v_uid);
END;
$$;

CREATE OR REPLACE FUNCTION public.unblock_person(p_target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
  DELETE FROM public.client_blocks WHERE blocker_id = auth.uid() AND blocked_id = p_target;
END;
$$;

-- ── Finding people ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.search_people(p_query text, p_limit integer DEFAULT 25)
RETURNS TABLE (
  user_id uuid,
  name text,
  avatar_url text,
  my_status text,
  follows_me text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_q text := btrim(coalesce(p_query, ''));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
  IF NOT public.social_is_active_client(v_uid) THEN
    RAISE EXCEPTION 'Set up your client profile to find people.';
  END IF;
  IF length(v_q) < 2 THEN RETURN; END IF;
  PERFORM public.social_take_budget(v_uid, 'people_search', interval '1 hour', 1, 120);
  RETURN QUERY
  SELECT u.id, u.name, u.avatar_url,
         (SELECT CASE WHEN f.status = 'declined' THEN 'pending' ELSE f.status END FROM public.client_follows f WHERE f.follower_id = v_uid AND f.followee_id = u.id),
         (SELECT f.status FROM public.client_follows f WHERE f.follower_id = u.id AND f.followee_id = v_uid AND f.status <> 'declined')
  FROM public.users u
  WHERE u.id <> v_uid
    AND u.has_client_profile
    AND u.deletion_requested_at IS NULL
    AND u.name ILIKE '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    AND NOT public.social_blocked_either_way(v_uid, u.id)
    -- Under-18s only appear to people they're already connected with.
    AND (NOT public.social_is_minor(u.id) OR EXISTS (
          SELECT 1 FROM public.client_follows c
          WHERE (c.follower_id = v_uid AND c.followee_id = u.id AND c.status = 'accepted')
             OR (c.follower_id = u.id AND c.followee_id = v_uid AND c.status = 'accepted')))
  ORDER BY (u.name ILIKE replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%') DESC, u.name
  LIMIT least(greatest(coalesce(p_limit, 25), 1), 50);
END;
$$;

-- p_hashes: sha256 hex of each contact number, normalised exactly as
-- social_normalise_phone does. Compared in-query and never stored; unmatched
-- hashes are simply not returned.
CREATE OR REPLACE FUNCTION public.match_contact_hashes(p_hashes text[])
RETURNS TABLE (
  user_id uuid,
  phone_hash text,
  name text,
  avatar_url text,
  my_status text,
  follows_me text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
  IF NOT public.social_is_active_client(v_uid) THEN
    RAISE EXCEPTION 'Set up your client profile to find people.';
  END IF;
  IF p_hashes IS NULL OR cardinality(p_hashes) = 0 THEN RETURN; END IF;
  IF cardinality(p_hashes) > 1000 THEN
    RAISE EXCEPTION 'Too many contacts to check at once.';
  END IF;
  -- A phone book is a few hundred numbers; a sweep of the number space is
  -- millions. 3000 numbers a day and 20 checks an hour per account.
  PERFORM public.social_take_budget(v_uid, 'contact_hashes', interval '1 day', cardinality(p_hashes), 3000);
  PERFORM public.social_take_budget(v_uid, 'contact_calls', interval '1 hour', 1, 20);
  RETURN QUERY
  SELECT u.id, pi.phone_hash, u.name, u.avatar_url,
         (SELECT CASE WHEN f.status = 'declined' THEN 'pending' ELSE f.status END FROM public.client_follows f WHERE f.follower_id = v_uid AND f.followee_id = u.id),
         (SELECT f.status FROM public.client_follows f WHERE f.follower_id = u.id AND f.followee_id = v_uid AND f.status <> 'declined')
  FROM public.client_phone_index pi
  JOIN public.users u ON u.id = pi.user_id
  LEFT JOIN public.client_social_settings s ON s.user_id = u.id
  WHERE pi.phone_hash = ANY (p_hashes)
    AND u.id <> v_uid
    AND u.has_client_profile
    AND u.deletion_requested_at IS NULL
    AND coalesce(s.findable_by_phone, true)
    AND NOT public.social_is_minor(u.id)
    AND NOT public.social_blocked_either_way(v_uid, u.id)
    -- A number typed into two accounts is unreliable: match neither.
    AND (SELECT count(*) FROM public.client_phone_index x WHERE x.phone_hash = pi.phone_hash) = 1
  ORDER BY u.name
  LIMIT 500;
END;
$$;

-- p_kind: 'followers' | 'following' | 'requests' (incoming, pending).
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
  ELSE
    RAISE EXCEPTION 'Unknown list.';
  END IF;
END;
$$;

-- ── Recommend + hide ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_provider_sharing(p_provider uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
  RETURN jsonb_build_object(
    'can_recommend', EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.user_id = v_uid AND b.provider_id = p_provider AND b.status = 'completed'),
    'recommended', EXISTS (
      SELECT 1 FROM public.provider_recommendations r
      WHERE r.client_id = v_uid AND r.provider_id = p_provider),
    'hidden', EXISTS (
      SELECT 1 FROM public.client_hidden_providers h
      WHERE h.client_id = v_uid AND h.provider_id = p_provider)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_provider_recommendation(p_provider uuid, p_on boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
  IF p_on THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.user_id = v_uid AND b.provider_id = p_provider AND b.status = 'completed'
    ) THEN
      RAISE EXCEPTION 'You can recommend someone once you''ve had an appointment with them.';
    END IF;
    INSERT INTO public.provider_recommendations (client_id, provider_id)
    VALUES (v_uid, p_provider) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.provider_recommendations WHERE client_id = v_uid AND provider_id = p_provider;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_provider_hidden(p_provider uuid, p_hidden boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
  IF p_hidden THEN
    IF NOT EXISTS (SELECT 1 FROM public.providers WHERE id = p_provider) THEN RETURN; END IF;
    INSERT INTO public.client_hidden_providers (client_id, provider_id)
    VALUES (auth.uid(), p_provider) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.client_hidden_providers WHERE client_id = auth.uid() AND provider_id = p_provider;
  END IF;
END;
$$;

-- ── The card stack ───────────────────────────────────────

-- For each of the given providers, the people I follow (accepted) who
-- recommend it or have been. One batched call per list of cards.
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
           s.where_i_go_notice_seen_at IS NOT NULL AS notice_seen
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
    JOIN people pe ON pe.pid = b.user_id AND pe.notice_seen
    JOIN live l ON l.lid = b.provider_id
    WHERE b.status = 'completed'
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

-- ── Grants ───────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.social_normalise_phone(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.social_phone_hash(text) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.get_my_social_settings()',
    'public.update_my_social_settings(boolean, boolean, boolean)',
    'public.mark_where_i_go_notice_seen()',
    'public.request_follow(uuid)',
    'public.respond_follow_request(uuid, boolean)',
    'public.unfollow_person(uuid)',
    'public.remove_follower(uuid)',
    'public.block_person(uuid)',
    'public.unblock_person(uuid)',
    'public.search_people(text, integer)',
    'public.match_contact_hashes(text[])',
    'public.get_my_people(text)',
    'public.get_my_provider_sharing(uuid)',
    'public.set_provider_recommendation(uuid, boolean)',
    'public.set_provider_hidden(uuid, boolean)',
    'public.get_circle_for_providers(uuid[])'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END;
$$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261108190000', 'follow_people_and_recommend')
ON CONFLICT (version) DO NOTHING;

COMMIT;
