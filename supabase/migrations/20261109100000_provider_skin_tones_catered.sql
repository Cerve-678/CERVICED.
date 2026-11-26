-- Provider-level "skin tones I work with", asked in About You's I Work With
-- card next to clientele and hair types, and shown to clients under the bio
-- on the provider's profile.
--
-- Same shape and meaning as hair_types_catered: a list from the shared
-- SKIN_TONES vocabulary (src/constants/skinTones.ts). NULL means the provider
-- hasn't said — never "works with none". services.skin_tones_suitable stays
-- the narrower per-service answer.
--
-- Purely additive. providers' table-level grants already cover new columns,
-- and the existing RLS policies are row-based, so nothing else changes.

BEGIN;

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS skin_tones_catered text[];

COMMENT ON COLUMN public.providers.skin_tones_catered IS
  'Skin tones the provider says they work with (SKIN_TONES vocabulary). NULL = not stated.';

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261109100000', 'provider_skin_tones_catered')
ON CONFLICT (version) DO NOTHING;

COMMIT;
