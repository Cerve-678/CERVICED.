-- service_images.aspect_ratio
-- ─────────────────────────────────────────────────────────────────────────────
-- Explore's masonry grid and ImageDetailModal size an image's box from its
-- aspect ratio. portfolio_items has stored one since phase 1
-- (portfolio_items.aspect_ratio, stamped at upload from the picked asset's
-- width/height), but service_images never did — so every service photo in the
-- discover feed was mapped with a hardcoded 0.8 placeholder in ExploreScreen.
-- Real ratios in this table run 0.46–1.33, so that placeholder put landscape
-- photos in portrait boxes and let contentFit="cover" crop the difference away.
--
-- APPLIED LIVE 2026-08-18 (migrations add_service_images_aspect_ratio +
-- replace_provider_services_carry_aspect_ratio), including the backfill below.
--
-- Nullable with NO default on purpose: NULL means "not measured yet" and stays
-- distinguishable from a real value, so the client falls back to measuring the
-- file itself (see src/utils/useMeasuredAspectRatios.ts) rather than trusting a
-- fabricated number. A DEFAULT 1.0 (as portfolio_items has) would make
-- un-measured rows indistinguishable from genuinely-square photos.
--
-- Safe to re-run.

ALTER TABLE public.service_images
  ADD COLUMN IF NOT EXISTS aspect_ratio NUMERIC(6,4);

COMMENT ON COLUMN public.service_images.aspect_ratio IS
  'width/height of the image at url. NULL = never measured; the client falls back to measuring the file itself. Written at upload time by replace_provider_services().';

-- A zero/negative ratio would produce a zero-height or inverted card box, and
-- anything outside this range is a bad measurement rather than a real photo.
ALTER TABLE public.service_images
  DROP CONSTRAINT IF EXISTS service_images_aspect_ratio_sane;
ALTER TABLE public.service_images
  ADD CONSTRAINT service_images_aspect_ratio_sane
  CHECK (aspect_ratio IS NULL OR (aspect_ratio > 0 AND aspect_ratio <= 10));

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Ratios can only be obtained by reading each image file's header, which
-- Postgres can't do — these 25 values were measured out-of-band (JPEG/PNG
-- SOF/IHDR headers fetched over HTTP) and written back on 2026-08-18.
--
-- One row was deliberately left NULL: service_images row
-- 1cd1607f-65c2-40c6-9518-55187a77d67e (.../Bridal_Makeup-0-1.jpg) is not
-- actually a JPEG — its magic bytes are 00000034 (an ISO-BMFF/HEIC container
-- saved under a .jpg name), so a JPEG parse yields a nonsense 9878x22964.
-- NULL correctly routes it to client-side measurement instead of storing a
-- wrong number. Any future row added by an older app build lands NULL the
-- same way and self-heals on the client.
UPDATE public.service_images AS si SET aspect_ratio = v.ratio FROM (VALUES
  ('bcc39c6a-d295-4982-bb09-aee3e2df6088'::uuid, 1.3337::numeric),
  ('61f74b57-b4ef-4ea7-b174-c25c6ddf0502'::uuid, 0.8286::numeric),
  ('196ddd77-d5d2-4adc-b2d4-1b7083eb40f0'::uuid, 0.9982::numeric),
  ('08c682c8-0de7-46a4-9224-65b9410d8489'::uuid, 0.8283::numeric),
  ('41fbbbc9-2654-46ee-9b28-22981ee1c138'::uuid, 0.903::numeric),
  ('e0e4aa56-9640-41cf-af35-eb8f86b073ee'::uuid, 0.8865::numeric),
  ('e701257a-6650-46e7-9fb4-e4602be62f3e'::uuid, 0.9086::numeric),
  ('6e9902b1-8be9-4a20-947e-27e6a47787a9'::uuid, 1.0::numeric),
  ('a14fa400-7fbd-4759-8161-65513dc60a3e'::uuid, 1.0::numeric),
  ('9ad1dd4a-686f-4ded-bd0b-115ea7d3af2f'::uuid, 0.8036::numeric),
  ('3eb4e481-ebbf-477d-b4f2-4eacae7c1697'::uuid, 0.75::numeric),
  ('a1aa926c-cec5-4387-9a52-a42d6e07b143'::uuid, 0.7603::numeric),
  ('5671c581-4c97-4aa9-b68f-7d0aa8ce4523'::uuid, 0.75::numeric),
  ('e018c63e-2600-45f6-8d65-50c706dd6c75'::uuid, 0.75::numeric),
  ('9b29d9b3-427b-4d49-991c-112783242931'::uuid, 0.7603::numeric),
  ('a629ce44-bddd-4614-80b1-037bc8249a14'::uuid, 0.6001::numeric),
  ('59fa72bb-30d2-4098-9712-e98f6fa15c29'::uuid, 0.5908::numeric),
  ('49967d76-e421-485d-8f13-6e11a6b6d62a'::uuid, 0.4622::numeric),
  ('b3fffa3f-3477-4e52-a41d-8bd48d7415c1'::uuid, 0.4622::numeric),
  ('7f32f134-3c9d-482b-a90c-f6de19cd7400'::uuid, 0.4615::numeric),
  ('d141b4f8-a592-4df9-9cf9-d0c81d05ca5a'::uuid, 0.4622::numeric),
  ('8ccfda48-fbff-42e8-93e5-521c3345ef98'::uuid, 0.6667::numeric),
  ('0d76303b-dd60-4d77-89b0-6dc786225859'::uuid, 0.4622::numeric),
  ('8e2e9b39-086a-4e7b-a4ff-c23ec85abb0c'::uuid, 0.5625::numeric),
  ('34d1c94d-e8bd-4c19-8f63-8135bb6dfb76'::uuid, 1.0019::numeric)
) AS v(id, ratio) WHERE si.id = v.id;
