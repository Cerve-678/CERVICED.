-- ─────────────────────────────────────────────────────────────────────────────
-- Storage buckets + RLS policies
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Create buckets (skip if already created via the dashboard UI)
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('provider-logos',  'provider-logos',  true),
  ('service-images',  'service-images',  true),
  ('portfolio',       'portfolio',        true),
  ('avatars',         'avatars',          true)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- provider-logos
-- ─────────────────────────────────────────────────────────────────────────────

-- Public read
CREATE POLICY "provider-logos: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'provider-logos');

-- Authenticated upload to own folder  (<userId>/*)
CREATE POLICY "provider-logos: authenticated upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'provider-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated update own files
CREATE POLICY "provider-logos: authenticated update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'provider-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated delete own files
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

CREATE POLICY "service-images: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'service-images');

CREATE POLICY "service-images: authenticated upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'service-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "service-images: authenticated update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'service-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

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

CREATE POLICY "portfolio: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'portfolio');

CREATE POLICY "portfolio: authenticated upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'portfolio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "portfolio: authenticated update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'portfolio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

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

CREATE POLICY "avatars: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars: authenticated upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "avatars: authenticated update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "avatars: authenticated delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
