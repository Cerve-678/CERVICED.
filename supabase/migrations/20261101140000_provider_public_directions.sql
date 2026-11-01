-- Public "How to get there" for a provider's profile: the nearest station,
-- which street to park on, landmarks. Lives on `providers`, which every
-- signed-in user can read, so it is for directions anyone may see. Door and
-- buzzer codes go in provider_private_details.how_to_get_there (migration
-- 20261101115322), which a client only gets once their address is released.
--
-- Additive: one nullable column and a length check. No backfill, no policy
-- or grant change (providers uses table-level grants, so the column is
-- covered by the existing providers_owner_all / providers_public_read).
-- Must be applied BEFORE feat/profile-how-to-get-there merges: the provider
-- profile's public select names this column.

BEGIN;

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS public_directions text;

ALTER TABLE public.providers
  DROP CONSTRAINT IF EXISTS providers_public_directions_length;
ALTER TABLE public.providers
  ADD CONSTRAINT providers_public_directions_length
  CHECK (public_directions IS NULL OR char_length(public_directions) <= 300);

COMMENT ON COLUMN public.providers.public_directions IS
  'Public directions shown on the profile. Never door codes: those go in provider_private_details.how_to_get_there.';

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261101140000', 'provider_public_directions')
ON CONFLICT (version) DO NOTHING;

COMMIT;
