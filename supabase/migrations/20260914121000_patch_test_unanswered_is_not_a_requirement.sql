-- The same rule as 20260914120000, applied to the other safety flag.
--
-- services.patch_test_required is a boolean with no way to say "the provider
-- has not answered", and InfoRegScreen went further: a brand-new HAIR, LASHES,
-- BROWS or AESTHETICS service arrived with the toggle already ON, so the
-- provider was telling clients a patch test was required before they had
-- opened the service. The app now starts it unanswered for every category and
-- asks for a patch test only on an explicit true.
--
-- Check the column's nullability before running this. If it is NOT NULL, the
-- DROP NOT NULL below is required for NULL to be storable at all; if it is
-- already nullable, that statement is a harmless no-op.
--
-- NOT a data backfill, for the same reason as the pregnancy flag: an existing
-- true is indistinguishable from a category default that was never reviewed,
-- and clearing them wholesale would drop real patch-test requirements, which
-- is a genuine client-safety instruction. Existing services keep what they
-- have; only new ones start unanswered.

ALTER TABLE public.services ALTER COLUMN patch_test_required DROP DEFAULT;
ALTER TABLE public.services ALTER COLUMN patch_test_required DROP NOT NULL;

COMMENT ON COLUMN public.services.patch_test_required IS
  'true = provider requires a patch test; false = provider states none is '
  'needed; NULL = not answered, and clients are asked for nothing. Never '
  'collapse NULL with true.';
