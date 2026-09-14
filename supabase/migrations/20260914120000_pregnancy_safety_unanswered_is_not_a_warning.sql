-- "Nothing switched on" must not read as a safety warning.
--
-- services.is_pregnancy_safe has had its default flipped twice, and both
-- flips were reasonable on the day:
--
--   20260817084930  false -> true   No screen let a provider set the field at
--                                   all, so every false was default noise and
--                                   nearly every service warned.
--   20260902141600  true  -> false  InfoRegScreen had gained a real toggle and
--                                   providers were using it, so a true default
--                                   was fail-open on health data: an
--                                   unconfigured row read as "confirmed safe".
--
-- Both were picking the least-bad of two booleans, because the column only
-- had two. The actual missing state is "the provider has not answered", and
-- neither default can express it. With the column defaulting to false, a
-- provider who switches nothing on still gets "not recommended during
-- pregnancy" shown to clients and a safety acknowledgement forced at
-- checkout -- a clinical claim attributed to them that they never made.
--
-- NULL is that third state, and the column already allows it. Unanswered now
-- means the client is told nothing either way: no warning, and no
-- reassurance. The app reads all three explicitly (=== true / === false /
-- null) rather than collapsing any pair together, and InfoRegScreen marks an
-- unanswered service with a red asterisk so the provider can see it is still
-- outstanding -- a Switch cannot show "unanswered" on its own.
--
-- DELIBERATELY NOT A DATA BACKFILL. Today's false rows are a mixture that
-- this column cannot separate: services created while the default was true
-- (2026-08-17 to 2026-09-02) hold real provider decisions, while those either
-- side of that window are default noise. Only services.created_at can tell
-- them apart, and imperfectly -- an old service edited last week looks like
-- an old service. Wiping them wholesale would erase genuine "not recommended
-- during pregnancy" flags, which is exactly the failure the deleted iCloud
-- fork migration would have caused. Existing services keep what they have
-- until a provider answers; only new ones start unanswered.

ALTER TABLE public.services ALTER COLUMN is_pregnancy_safe DROP DEFAULT;

COMMENT ON COLUMN public.services.is_pregnancy_safe IS
  'true = provider states suitable during pregnancy; false = provider states '
  'not recommended; NULL = not answered, and clients are told nothing either '
  'way. Never collapse NULL with false: silence is not a warning.';
