-- A provider's own profile sections, written on Policies & Info: Key
-- Information, FAQs, Aftercare, House Rules and a Disclaimer. Each shows as
-- its own section under Additional Information on the profile.
--
-- Shape (the app cleans it the same way on read and save, see
-- src/features/providers/ownSections.ts):
--   { "keyInfo": text, "faq": [{ "question": text, "answer": text }],
--     "aftercare": text, "houseRules": text, "disclaimer": text }
--
-- Its own column, not a key inside booking_policies: that blob is saved as a
-- full replace from more than one screen, and these sections are profile
-- content rather than booking rules.
--
-- Lives on `providers`, which every signed-in user can read, so it is public
-- wording only. Additive: one column with a default, a type check and a size
-- cap. No backfill, no policy or grant change (providers uses table-level
-- grants, so the column is covered by the existing providers_owner_all /
-- providers_public_read). Must be applied BEFORE the app change merges: the
-- public profile select names this column.

BEGIN;

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS profile_sections jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.providers
  DROP CONSTRAINT IF EXISTS providers_profile_sections_shape;
ALTER TABLE public.providers
  ADD CONSTRAINT providers_profile_sections_shape
  CHECK (
    jsonb_typeof(profile_sections) = 'object'
    AND (NOT profile_sections ? 'faq' OR jsonb_typeof(profile_sections -> 'faq') = 'array')
    AND octet_length(profile_sections::text) <= 32000
  );

COMMENT ON COLUMN public.providers.profile_sections IS
  'Provider-written public profile sections (keyInfo, faq, aftercare, houseRules, disclaimer). Public: never private details.';

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261118120000', 'provider_profile_sections')
ON CONFLICT (version) DO NOTHING;

COMMIT;
