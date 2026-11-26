-- A client can leave a review anonymously. When they do, nobody can tell who
-- wrote it: not other clients, and not the provider it is about.
--
-- Product decision (2026-11-08): "anonymous" hides the reviewer from EVERYONE,
-- including the provider. The public profile shows "Anonymous", and the
-- provider's own views (My Profile, Analytics, Becca, the New Review notice)
-- carry nothing that leads back to the client.
--
-- Hiding the name in the app is not enough, because the provider can read the
-- table directly. Before this migration:
--   * reviews_public_read let anyone read every column of a live provider's
--     reviews, including user_id and booking_id;
--   * reviews_owner_read let the provider read every column of their own;
--   * get_user_public_profiles turns any user_id into a name and avatar;
--   * the New Review notification carried booking_id, and the provider can
--     read that booking, which names the client.
--
-- What this does:
--   1. reviews.is_anonymous, default FALSE. Older app builds never send it,
--      so their reviews stay named exactly as before.
--   2. Both broad SELECT policies now skip anonymous rows. An anonymous row is
--      readable directly only by the client who wrote it (new
--      reviews_reviewer_read), which the app needs to know a booking is
--      already rated. Older app builds that still read the table directly
--      keep working for every named review and simply never see an
--      anonymous one: they leak nothing.
--   3. Two SECURITY DEFINER readers the app uses instead, which return
--      anonymous rows with the reviewer, booking, service and tip blanked:
--        get_provider_reviews(provider, limit)  - a profile's review list
--        get_my_provider_reviews(limit)         - the provider's own list
--   4. handle_review_received() leaves booking_id off the notification for an
--      anonymous review and says "an anonymous review", so neither the notice
--      nor its push payload points at the booking.
--
-- What is NOT hidden, and can't be by the database alone: inference. A
-- provider with one appointment that day can still guess from timing; named
-- reviews keep their booking link, so "completed bookings minus named
-- reviews" narrows who wrote an anonymous one; a tip (booking_tips, which the
-- provider sees per booking) paid around the same time points at its author;
-- the comment text itself may give it away; and with very few reviews the
-- rating aggregates (update_provider_rating, get_my_provider_achievements)
-- move by exactly that review. Those are left alone: this migration removes
-- every direct link, not every possible guess.
--
-- Turning is_anonymous on with an UPDATE after the fact hides the review from
-- here on, but a notification already sent for it keeps its booking link. The
-- app offers the choice only at submit time.

BEGIN;

-- Guard: handle_review_received is redefined below. Refuse if live has moved
-- on from the definition this file was written against (2026-11-08).
DO $$
BEGIN
  IF md5(pg_get_functiondef('public.handle_review_received'::regproc))
       <> '2184a1179a0606d66d4cd36e6754469a' THEN
    RAISE EXCEPTION 'handle_review_received changed live since this migration was written; redefine from live first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'reviews' AND policyname = 'reviews_public_read')
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'reviews' AND policyname = 'reviews_owner_read') THEN
    RAISE EXCEPTION 'reviews read policies are not as expected; check live before applying';
  END IF;
END $$;

-- 1. The choice itself ─────────────────────────────────────────────────────
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.reviews.is_anonymous IS
  'TRUE hides the reviewer from everyone, including the provider. Anonymous rows are readable directly only by their author; everyone else reads them through get_provider_reviews / get_my_provider_reviews, which blank user_id, booking_id, service_id and tip_amount.';

-- 2. Direct reads skip anonymous rows ──────────────────────────────────────
-- Same predicates as live, plus NOT is_anonymous.
DROP POLICY reviews_public_read ON public.reviews;
CREATE POLICY reviews_public_read ON public.reviews
  FOR SELECT
  USING (
    NOT is_anonymous
    AND EXISTS (
      SELECT 1 FROM public.providers p
       WHERE p.id = reviews.provider_id
         AND p.has_gone_live = TRUE
         AND p.is_active = TRUE
    )
  );

DROP POLICY reviews_owner_read ON public.reviews;
CREATE POLICY reviews_owner_read ON public.reviews
  FOR SELECT
  USING (
    NOT is_anonymous
    AND provider_id IN (
      SELECT providers.id FROM public.providers WHERE providers.user_id = auth.uid()
    )
  );

-- The author can always read their own review, named or not.
DROP POLICY IF EXISTS reviews_reviewer_read ON public.reviews;
CREATE POLICY reviews_reviewer_read ON public.reviews
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 3. Readers that blank the reviewer on anonymous rows ─────────────────────

-- A provider's review list as any signed-in viewer sees it: a live, active
-- provider's, or your own provider profile's before it goes live (the owner
-- exception the old reviews_owner_read policy gave My Profile).
CREATE OR REPLACE FUNCTION public.get_provider_reviews(
  p_provider_id UUID,
  p_limit INTEGER DEFAULT 200
)
RETURNS TABLE (
  id UUID,
  provider_id UUID,
  rating SMALLINT,
  comment TEXT,
  created_at TIMESTAMPTZ,
  is_anonymous BOOLEAN,
  reviewer_id UUID,
  reviewer_name TEXT,
  reviewer_avatar_url TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Same requirement as get_user_public_profiles, which this replaces for
  -- reviews: reviewer names are for signed-in viewers.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  RETURN QUERY
    SELECT r.id,
           r.provider_id,
           r.rating,
           r.comment,
           r.created_at,
           r.is_anonymous,
           CASE WHEN r.is_anonymous THEN NULL ELSE r.user_id END,
           CASE WHEN r.is_anonymous THEN NULL ELSE u.name END,
           CASE WHEN r.is_anonymous THEN NULL ELSE u.avatar_url END
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
$$;

-- The signed-in provider's own reviews, with the booking/service link that
-- Analytics uses for per-service ratings. All of it is blanked on an
-- anonymous row: the booking names the client.
CREATE OR REPLACE FUNCTION public.get_my_provider_reviews(
  p_limit INTEGER DEFAULT 200
)
RETURNS TABLE (
  id UUID,
  booking_id UUID,
  provider_id UUID,
  service_id UUID,
  rating SMALLINT,
  comment TEXT,
  tip_amount NUMERIC,
  created_at TIMESTAMPTZ,
  is_anonymous BOOLEAN,
  reviewer_id UUID,
  reviewer_name TEXT,
  reviewer_avatar_url TEXT
)
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
    SELECT r.id,
           CASE WHEN r.is_anonymous THEN NULL ELSE r.booking_id END,
           r.provider_id,
           CASE WHEN r.is_anonymous THEN NULL ELSE r.service_id END,
           r.rating,
           r.comment,
           CASE WHEN r.is_anonymous THEN NULL ELSE r.tip_amount END,
           r.created_at,
           r.is_anonymous,
           CASE WHEN r.is_anonymous THEN NULL ELSE r.user_id END,
           CASE WHEN r.is_anonymous THEN NULL ELSE u.name END,
           CASE WHEN r.is_anonymous THEN NULL ELSE u.avatar_url END
      FROM public.reviews r
      JOIN public.providers p ON p.id = r.provider_id
      LEFT JOIN public.users u ON u.id = r.user_id
     WHERE p.user_id = auth.uid()
     ORDER BY r.created_at DESC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 200);
END;
$$;

REVOKE ALL ON FUNCTION public.get_provider_reviews(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_provider_reviews(UUID, INTEGER) TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_provider_reviews(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_provider_reviews(INTEGER) TO authenticated;

-- 4. The New Review notice doesn't point at the booking ────────────────────
-- Redefined from live (md5 guarded above). Only change: an anonymous review
-- gets no booking_id and says so in the message.
CREATE OR REPLACE FUNCTION public.handle_review_received()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
  SELECT
    p.user_id, 'review_received', 'New Review Received ⭐',
    'You received a' ||
      CASE WHEN NEW.is_anonymous THEN 'n anonymous ' ELSE ' ' END ||
      ROUND(NEW.rating::numeric, 1) || '-star review' ||
      CASE
        WHEN NEW.comment IS NOT NULL AND LENGTH(TRIM(NEW.comment)) > 0
          THEN ': "' || LEFT(NEW.comment, 80) ||
               CASE WHEN LENGTH(NEW.comment) > 80 THEN '…"' ELSE '"' END
        ELSE '.'
      END,
    'medium', TRUE,
    CASE WHEN NEW.is_anonymous THEN NULL ELSE NEW.booking_id END,
    NEW.provider_id, 'provider'
  FROM public.providers p WHERE p.id = NEW.provider_id;
  RETURN NEW;
END;
$function$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261108230000', 'anonymous_reviews')
ON CONFLICT (version) DO NOTHING;

COMMIT;
