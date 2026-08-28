ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.providers.terms_accepted_at IS
  'When the provider first accepted the Terms & Conditions during profile setup (InfoRegScreen). Null for providers who published before this column existed. Never overwritten on later edits.';
;
