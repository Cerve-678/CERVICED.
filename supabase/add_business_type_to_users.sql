-- ════════════════════════════════════════════════════════════════════════════
-- add_business_type_to_users.sql
--
-- The 5-step signup flow now asks providers for their business type (salon /
-- studio / home_based / mobile) at Step 3, alongside business name/email —
-- previously this was only asked post-login in InfoRegScreen.tsx, forcing a
-- second ask and leaving the providers row without it until that first save.
-- `providers.business_type` already exists with this same CHECK constraint
-- (see address_release_policy.sql) — this mirrors it onto `users` so the
-- value collected at signup has somewhere to land (EmailVerificationScreen.tsx's
-- upsert) before a providers row exists at all. InfoRegScreen.tsx then reads
-- it via getUserSignupPrefillInfo() to prefill+lock its own Business Type
-- field on first save instead of asking cold.
--
-- Safe to re-run (IF NOT EXISTS / DROP+ADD CONSTRAINT idempotent).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS business_type TEXT;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_business_type_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_business_type_check
  CHECK (business_type IS NULL OR business_type IN ('salon', 'studio', 'home_based', 'mobile'));
