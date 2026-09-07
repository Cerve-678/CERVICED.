-- Provider-selectable display font for the business name on public profiles.
-- NULL means the default Prata font.

ALTER TABLE providers ADD COLUMN IF NOT EXISTS brand_font TEXT;

COMMENT ON COLUMN providers.brand_font IS
  'Key into PROVIDER_FONTS for the public business-name font. NULL = default (Prata-Regular).';
