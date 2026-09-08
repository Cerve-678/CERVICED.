-- A trailing space on a provider's name is a double space in every sentence
-- built from it.
--
-- Provider names are concatenated straight into notification copy —
--   'Your appointment with ' || provider_name_snapshot || ' is confirmed for '
--   provider_name_snapshot || ' needs to reschedule'
-- — and send-push-notification uses the notifications row's message as the
-- push body VERBATIM. So "Glam suit " (stored with a trailing space at
-- sign-up) reaches the lock screen as "Glam suit  needs to reschedule". Three
-- of eight providers are stored this way, and 48 of 95 bookings carry the
-- untrimmed snapshot.
--
-- It is not only cosmetic. display_name is a lookup KEY:
-- getProviderLocationsByDisplayNames / getProviderIdsByDisplayNames match it
-- with .eq/.in, and the first of those stamps a booking's address from the
-- result. Trimming one side and not the other would turn an exact match into a
-- miss, so every column holding a copy of the name is corrected together, in
-- one statement group, rather than fixing providers alone.
--
-- The writer is fixed in the same change (providerRegistrationService.ts now
-- trims at sign-up; BusinessInfoScreen already trimmed on rename), and the
-- INSERT trigger at the bottom is the backstop for the stale-build case.

-- ── 1. Correct the stored values ───────────────────────────────────────────

-- providers_display_name_cooldown is BEFORE UPDATE OF display_name and treats
-- any change as a rename: it would stamp display_name_changed_at = now() and
-- lock all three providers out of renaming for 14 days over a whitespace
-- repair they did not ask for -- and would ABORT this migration outright for
-- anyone who had renamed within the window. (None had when this was written,
-- but that is a fact about today's data, not a guarantee.) Disabled for the
-- repair and re-enabled immediately after; scoped to this one trigger rather
-- than session_replication_role so the search-vector trigger still refreshes
-- the trimmed name.
ALTER TABLE public.providers DISABLE TRIGGER providers_display_name_cooldown;

UPDATE public.providers
   SET display_name = btrim(display_name)
 WHERE display_name IS DISTINCT FROM btrim(display_name);

ALTER TABLE public.providers ENABLE TRIGGER providers_display_name_cooldown;

-- Snapshots of the same name. These are deliberately NOT re-derived from
-- providers.display_name -- a snapshot records the name as it stood at
-- booking time, and a provider who has since renamed must keep the old name
-- on the old booking. btrim only removes the stray whitespace and leaves the
-- historical value otherwise untouched.
UPDATE public.bookings
   SET provider_name_snapshot = btrim(provider_name_snapshot)
 WHERE provider_name_snapshot IS DISTINCT FROM btrim(provider_name_snapshot);

UPDATE public.provider_waitlist
   SET provider_name_snapshot = btrim(provider_name_snapshot)
 WHERE provider_name_snapshot IS DISTINCT FROM btrim(provider_name_snapshot);

-- The provider's business name as held on their user row.
UPDATE public.users
   SET business_name = btrim(business_name)
 WHERE business_name IS DISTINCT FROM btrim(business_name);

-- ── 2. Stop it coming back ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.normalise_provider_display_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.display_name := btrim(NEW.display_name);
  RETURN NEW;
END;
$$;

-- BEFORE INSERT only, on purpose.
--
-- Sign-up's INSERT is where every one of these actually came from, and a
-- stale app build is a caller no app-side fix reaches (the same lesson as the
-- 'Health info:' note prefix), so the INSERT path needs a guard in the DB.
--
-- The UPDATE path deliberately does NOT get one here. Postgres fires BEFORE
-- ROW triggers alphabetically, so providers_display_name_cooldown (c) would
-- run before any normaliser named for this column (n) and would still compare
-- the UNTRIMMED value -- meaning a rename that only added a trailing space
-- would read as a real rename and burn, or be refused by, the 14-day cooldown.
-- Picking a name that happens to sort earlier would "fix" that by side effect
-- and break the next time either trigger is renamed. If UPDATE-side
-- normalisation is ever needed, the correct home is the first statement of
-- enforce_display_name_change_cooldown() itself, so the value is normalised
-- BEFORE the did-it-change comparison rather than by a second trigger racing
-- it. Today the only UPDATE writer is BusinessInfoScreen, which already trims.
DROP TRIGGER IF EXISTS providers_normalise_display_name ON public.providers;
CREATE TRIGGER providers_normalise_display_name
  BEFORE INSERT ON public.providers
  FOR EACH ROW EXECUTE FUNCTION public.normalise_provider_display_name();

COMMENT ON FUNCTION public.normalise_provider_display_name() IS
  'Trims stray whitespace from providers.display_name on INSERT. The name is concatenated into notification/push copy and used as an .eq/.in lookup key, so a trailing space is both a visible double space and a failed match.';
