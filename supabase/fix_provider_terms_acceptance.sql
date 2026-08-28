-- ════════════════════════════════════════════════════════════════════════════
-- fix_provider_terms_acceptance.sql
--
-- Adds a real, persisted Terms & Conditions acceptance record for providers.
-- Previously there was no provider-facing acceptance mechanism at all — only
-- a passive "By continuing you agree to our Terms" line on signup screens
-- (AuthScreen.tsx / WelcomeScreen.tsx) with no checkbox and nothing written
-- to the database. The only checkbox anywhere in the app was client-side, at
-- booking checkout, and even that was local component state only (never
-- persisted). See LEGAL-COMPLIANCE-NOTES.md's "no explicit acceptance
-- mechanism" gap.
--
-- This adds a timestamp column on `providers`, stamped once — the moment a
-- provider first publishes their profile (InfoRegScreen.tsx, !isEditMode
-- path) — and never overwritten by later profile edits. That mirrors how the
-- rest of this table already treats first-publish vs. edit-save (see
-- is_active handling in providerRegistrationService.ts).
--
-- Idempotent / safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.providers.terms_accepted_at IS
  'When the provider first accepted the Terms & Conditions during profile setup (InfoRegScreen). Null for providers who published before this column existed. Never overwritten on later edits.';
