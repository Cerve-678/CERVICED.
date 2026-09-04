-- Adds providers.brand_font: a key into PROVIDER_FONTS (src/constants/providerFonts.ts),
-- selecting the display font for the provider's business name on their public
-- profile (hero name + scrolled nav header only — never body text or app chrome).
-- NULL means "not set", read by the app as the 'default' key (Prata-Regular) —
-- same NULL-means-default convention as profile_theme.
--
-- Purely additive (new nullable column, no function/view/policy touched), so
-- it is safe in any order relative to concurrent work on unrelated columns.
-- See supabase/MIGRATION_OWNER.md before applying — number above whatever
-- max(version) is in schema_migrations at apply time, not off this filename.

ALTER TABLE providers ADD COLUMN IF NOT EXISTS brand_font TEXT;

COMMENT ON COLUMN providers.brand_font IS
  'Key into PROVIDER_FONTS (src/constants/providerFonts.ts) for the business name''s display font on the client-facing profile. NULL = default (Prata-Regular).';
