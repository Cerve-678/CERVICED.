-- ============================================================
-- provider_hair_types_catered.sql
--
-- Adds the PROVIDER-level "which hair types do you cater to" field.
--
-- Two levels, deliberately:
--   * providers.hair_types_catered  (this file) — the broad "this provider
--     caters to X hair types" claim. This is what the client-side Search
--     "Hair Type" filter matches on, so filtering needs one provider-row
--     read instead of a per-service lookup.
--   * services.hair_types_suitable (already exists) — the more specific
--     per-service refinement, shown once a client opens a provider and
--     picks a service.
--
-- Same empty-means-all semantics as services.hair_types_suitable, so an
-- untouched value is a valid "suits everyone" answer rather than an
-- incomplete profile. Vocabulary is HAIR_TYPES in src/constants/hairTypes.ts
-- ('Straight' | 'Wavy' | 'Curly' | 'Coily' | '4A' | '4B' | '4C') — keep the
-- two in step; the app writes exactly those strings.
--
-- Safe to re-run.
-- ============================================================

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS hair_types_catered TEXT[];

-- Clients filter on this directly, so index it the same way clientele is.
CREATE INDEX IF NOT EXISTS idx_providers_hair_types_catered
  ON public.providers USING GIN (hair_types_catered);

COMMENT ON COLUMN public.providers.hair_types_catered IS
  'Provider-level hair types this provider caters to (HAIR_TYPES vocabulary). NULL/empty = caters to all. Drives the client Search "Hair Type" filter; services.hair_types_suitable is the per-service refinement.';

-- ============================================================
-- DONE — provider_hair_types_catered.sql applied.
-- ============================================================
