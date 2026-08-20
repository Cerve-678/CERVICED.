-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260818130232
-- Remote name: add_service_images_aspect_ratio
-- Do not edit this recovery archive; create a new tracked migration for changes.

-- Explore's masonry grid and ImageDetailModal size an image's box from its
-- aspect ratio. portfolio_items has stored one since phase 1
-- (portfolio_items.aspect_ratio, stamped at upload from the picked asset's
-- width/height), but service_images never did — so every service photo in
-- the discover feed was mapped with a hardcoded 0.8 placeholder in
-- ExploreScreen, which put landscape photos in portrait boxes and let
-- contentFit="cover" crop the difference away.
--
-- Nullable with no default on purpose: NULL means "not measured yet" and is
-- distinguishable from a real value, so the app can fall back to measuring
-- client-side for legacy rows instead of trusting a fabricated default. A
-- DEFAULT 1.0 (as portfolio_items has) would make un-measured rows
-- indistinguishable from genuinely-square photos.
ALTER TABLE public.service_images
  ADD COLUMN IF NOT EXISTS aspect_ratio NUMERIC(6,4);

COMMENT ON COLUMN public.service_images.aspect_ratio IS
  'width/height of the image at url. NULL = never measured; the client falls back to measuring the file itself. Written at upload time by addServiceImages().';

-- Sanity guard: a zero/negative ratio would produce a zero-height or
-- inverted card box, and anything outside this range is a bad measurement
-- rather than a real photo.
ALTER TABLE public.service_images
  DROP CONSTRAINT IF EXISTS service_images_aspect_ratio_sane;
ALTER TABLE public.service_images
  ADD CONSTRAINT service_images_aspect_ratio_sane
  CHECK (aspect_ratio IS NULL OR (aspect_ratio > 0 AND aspect_ratio <= 10));
