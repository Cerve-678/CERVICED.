-- ─────────────────────────────────────────────────────────────────────────────
-- Storage buckets + RLS policies
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Create buckets (skip if already created via the dashboard UI)
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('provider-logos',       'provider-logos',       true),
  ('service-images',       'service-images',       true),
  ('portfolio',            'portfolio',            true),
  ('avatars',              'avatars',              true),
  ('provider-backgrounds', 'provider-backgrounds', true)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- provider-logos
-- ─────────────────────────────────────────────────────────────────────────────

-- Public read
DROP POLICY IF EXISTS "provider-logos: public read" ON storage.objects;
CREATE POLICY "provider-logos: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'provider-logos');

-- Authenticated upload to own folder  (<userId>/*)
DROP POLICY IF EXISTS "provider-logos: authenticated upload" ON storage.objects;
CREATE POLICY "provider-logos: authenticated upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'provider-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated update own files
DROP POLICY IF EXISTS "provider-logos: authenticated update" ON storage.objects;
CREATE POLICY "provider-logos: authenticated update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'provider-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated delete own files
DROP POLICY IF EXISTS "provider-logos: authenticated delete" ON storage.objects;
CREATE POLICY "provider-logos: authenticated delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'provider-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- service-images
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "service-images: public read" ON storage.objects;
CREATE POLICY "service-images: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'service-images');

DROP POLICY IF EXISTS "service-images: authenticated upload" ON storage.objects;
CREATE POLICY "service-images: authenticated upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'service-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "service-images: authenticated update" ON storage.objects;
CREATE POLICY "service-images: authenticated update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'service-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "service-images: authenticated delete" ON storage.objects;
CREATE POLICY "service-images: authenticated delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'service-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- portfolio
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "portfolio: public read" ON storage.objects;
CREATE POLICY "portfolio: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'portfolio');

DROP POLICY IF EXISTS "portfolio: authenticated upload" ON storage.objects;
CREATE POLICY "portfolio: authenticated upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'portfolio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "portfolio: authenticated update" ON storage.objects;
CREATE POLICY "portfolio: authenticated update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'portfolio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "portfolio: authenticated delete" ON storage.objects;
CREATE POLICY "portfolio: authenticated delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'portfolio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- avatars
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "avatars: public read" ON storage.objects;
CREATE POLICY "avatars: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars: authenticated upload" ON storage.objects;
CREATE POLICY "avatars: authenticated upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars: authenticated update" ON storage.objects;
CREATE POLICY "avatars: authenticated update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars: authenticated delete" ON storage.objects;
CREATE POLICY "avatars: authenticated delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- provider-backgrounds
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "provider-backgrounds: public read" ON storage.objects;
CREATE POLICY "provider-backgrounds: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'provider-backgrounds');

DROP POLICY IF EXISTS "provider-backgrounds: authenticated upload" ON storage.objects;
CREATE POLICY "provider-backgrounds: authenticated upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'provider-backgrounds'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "provider-backgrounds: authenticated update" ON storage.objects;
CREATE POLICY "provider-backgrounds: authenticated update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'provider-backgrounds'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "provider-backgrounds: authenticated delete" ON storage.objects;
CREATE POLICY "provider-backgrounds: authenticated delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'provider-backgrounds'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
