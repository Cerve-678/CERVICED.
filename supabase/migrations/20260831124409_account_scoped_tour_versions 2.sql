-- Coach-mark walkthroughs, recorded per ACCOUNT and per VERSION.
--
-- Before this, "has this person seen the walkthrough" lived only in a device
-- AsyncStorage boolean. Three consequences, all reported as "the walkthrough
-- shows every time I log in":
--
--   * a reinstall, a second device, or a fresh dev build replayed every tour,
--     because nothing about the account remembered;
--   * the flag was written only when the tour was finished or skipped, so
--     abandoning it part-way replayed it forever;
--   * there was no way to show an existing user a step about something new
--     without renaming the key, which replays the whole tour for everyone.
--
-- Purely additive: a new column and a new function. Redefines nothing.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS seen_tours JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.users.seen_tours IS
  'Coach-mark tours this account has been shown, as {tour_key: version}. '
  'Written only by mark_tour_seen(); see src/utils/coachMarkTours.ts for the '
  'keys and what a version means. An absent key means never shown.';

-- Merges one tour into the map rather than rewriting it. Two tours can finish
-- moments apart (Home and Explore are adjacent tabs), and a read-modify-write
-- of the whole object from the client would lose one of them.
--
-- GREATEST is the other half of that: a version never moves backwards, so an
-- older app build still on version 1 cannot un-see version 3 for someone who
-- has already been shown it on a current build. Stale installs are a live
-- caller here, not a hypothetical — see the booking-notes health prefix.
CREATE OR REPLACE FUNCTION public.mark_tour_seen(p_key TEXT, p_version INT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  UPDATE public.users
     SET seen_tours = seen_tours || jsonb_build_object(
           p_key,
           GREATEST(
             p_version,
             -- Anything non-numeric already in the map is treated as 0 rather
             -- than raising: this runs on the app's first screen, and a
             -- malformed entry must not be able to break sign-in.
             CASE WHEN jsonb_typeof(seen_tours -> p_key) = 'number'
                  THEN (seen_tours ->> p_key)::INT
                  ELSE 0 END
           )
         )
   WHERE id = auth.uid()
     AND p_key IS NOT NULL
     AND length(p_key) BETWEEN 1 AND 64
     AND p_version >= 1;
$$;

-- Same anon lockdown every RPC here gets (see the 2026-08-20 hardening pass):
-- signed-in accounts only, and never PUBLIC.
REVOKE ALL ON FUNCTION public.mark_tour_seen(TEXT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_tour_seen(TEXT, INT) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_tour_seen(TEXT, INT) TO authenticated;
