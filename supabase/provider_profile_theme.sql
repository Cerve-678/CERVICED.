-- ============================================================
-- CERVICED — Provider profile theme
-- Adds providers.profile_theme: the preset key a provider picks
-- in Branding & Style (see src/constants/providerThemes.ts).
-- 'app' (default) follows each client's light/dark app theme;
-- other keys ('blush', 'cream', 'sage', 'lavender', 'sky',
-- 'noir') are fixed palettes on the client-facing profile page.
-- Stored as free TEXT (validated app-side) so adding new preset
-- themes never needs another migration. Safe to re-run.
-- ============================================================

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS profile_theme TEXT DEFAULT 'app';

-- ============================================================
-- DONE — profile_theme column added
-- ============================================================
