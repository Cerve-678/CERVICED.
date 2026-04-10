-- Run this in Supabase Dashboard → SQL Editor
-- Fixes RLS policy violations for storage uploads

-- ── Drop old policies to avoid conflicts ──────────────────────────────────
DROP POLICY IF EXISTS "provider-logos: authenticated upload" ON storage.objects;
DROP POLICY IF EXISTS "provider-logos: authenticated update" ON storage.objects;
DROP POLICY IF EXISTS "provider-logos: authenticated delete" ON storage.objects;
DROP POLICY IF EXISTS "provider-logos: public read"          ON storage.objects;

DROP POLICY IF EXISTS "service-images: authenticated upload" ON storage.objects;
DROP POLICY IF EXISTS "service-images: authenticated update" ON storage.objects;
DROP POLICY IF EXISTS "service-images: authenticated delete" ON storage.objects;
DROP POLICY IF EXISTS "service-images: public read"          ON storage.objects;

DROP POLICY IF EXISTS "portfolio: authenticated upload" ON storage.objects;
DROP POLICY IF EXISTS "portfolio: authenticated update" ON storage.objects;
DROP POLICY IF EXISTS "portfolio: authenticated delete" ON storage.objects;
DROP POLICY IF EXISTS "portfolio: public read"          ON storage.objects;

-- ── Ensure buckets exist ──────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('provider-logos', 'provider-logos', true),
  ('service-images', 'service-images', true),
  ('portfolio',      'portfolio',      true),
  ('avatars',        'avatars',        true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- ── provider-logos ────────────────────────────────────────────────────────
CREATE POLICY "provider-logos: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'provider-logos');

CREATE POLICY "provider-logos: authenticated upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'provider-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "provider-logos: authenticated update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'provider-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "provider-logos: authenticated delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'provider-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── service-images ────────────────────────────────────────────────────────
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

-- ── portfolio ─────────────────────────────────────────────────────────────
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
