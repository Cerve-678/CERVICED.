-- Per-card logo framing for the two Home card shapes.
--
-- A provider can now pinch and drag their logo separately for the small
-- (160x70) and large (282x147) Home cards. Only a zoom and an offset are
-- stored per card, relative to the logo image's own shape; the image itself
-- is never re-cut:
--   { "imageRatio": 1, "small": { "zoom": 0.6, "x": 0, "y": 0 },
--                      "large": { "zoom": 1.2, "x": 0.05, "y": -0.1 } }
-- NULL (every existing row) means every card fills and centres the logo,
-- exactly as before.
--
-- Additive and nullable: no backfill, no policy change. It's display data
-- like logo_url, readable wherever logo_url is (providers is selected by the
-- app's has_gone_live-filtered provider queries), and written by the owner
-- through the existing providers update policy.
--
-- Frontier at authoring: 20261020120000.

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS logo_framing jsonb;

ALTER TABLE public.providers
  DROP CONSTRAINT IF EXISTS providers_logo_framing_is_object;
ALTER TABLE public.providers
  ADD CONSTRAINT providers_logo_framing_is_object
  CHECK (logo_framing IS NULL OR jsonb_typeof(logo_framing) = 'object');

COMMENT ON COLUMN public.providers.logo_framing IS
  'Per-Home-card logo framing: {imageRatio, small?: {zoom,x,y}, large?: {zoom,x,y}}. NULL = fill and centre.';

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261020140000', 'providers_logo_framing')
ON CONFLICT (version) DO NOTHING;
