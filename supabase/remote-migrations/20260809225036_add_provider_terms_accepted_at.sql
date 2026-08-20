-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260809225036
-- Remote name: add_provider_terms_accepted_at
-- Do not edit this recovery archive; create a new tracked migration for changes.

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.providers.terms_accepted_at IS
  'When the provider first accepted the Terms & Conditions during profile setup (InfoRegScreen). Null for providers who published before this column existed. Never overwritten on later edits.';
