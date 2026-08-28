-- Security audit fix: 7 storage buckets are marked public=true, which
-- already serves objects via a public, unauthenticated URL route with no
-- RLS check (per Supabase's own advisor: "Public buckets don't need this
-- [SELECT policy] for object URL access"). Each also had a broad
-- `USING (bucket_id = 'x')` SELECT policy on storage.objects, which does
-- nothing for public URL rendering but does let ANY client enumerate every
-- file in the bucket via the storage API's .list()/authenticated-download
-- routes, which do consult RLS. Replacing each with an owner-scoped policy
-- (matching the existing upload/update/delete policies' foldername(name)[1]
-- = auth.uid() convention) removes cross-account enumeration while
-- preserving the one real in-app consumer: AuthContext.tsx's
-- clearStorageFolder() self-listing a user's own <uid>/ folder during
-- account deletion. Public image rendering via getPublicUrl() is
-- unaffected since it never goes through this policy.

-- avatars
DROP POLICY IF EXISTS "avatars: public read" ON storage.objects;
CREATE POLICY "avatars: owner read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- portfolio
DROP POLICY IF EXISTS "portfolio: public read" ON storage.objects;
CREATE POLICY "portfolio: owner read" ON storage.objects
  FOR SELECT USING (bucket_id = 'portfolio' AND (storage.foldername(name))[1] = auth.uid()::text);

-- provider-backgrounds
DROP POLICY IF EXISTS "provider-backgrounds: public read" ON storage.objects;
CREATE POLICY "provider-backgrounds: owner read" ON storage.objects
  FOR SELECT USING (bucket_id = 'provider-backgrounds' AND (storage.foldername(name))[1] = auth.uid()::text);

-- provider-logos (had two duplicate public-read policies)
DROP POLICY IF EXISTS "provider-logos: public read" ON storage.objects;
DROP POLICY IF EXISTS "Public read provider-logos" ON storage.objects;
CREATE POLICY "provider-logos: owner read" ON storage.objects
  FOR SELECT USING (bucket_id = 'provider-logos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- service-images
DROP POLICY IF EXISTS "service-images: public read" ON storage.objects;
CREATE POLICY "service-images: owner read" ON storage.objects
  FOR SELECT USING (bucket_id = 'service-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- promotion-images
DROP POLICY IF EXISTS "Public read promotion images" ON storage.objects;
CREATE POLICY "promotion-images: owner read" ON storage.objects
  FOR SELECT USING (bucket_id = 'promotion-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- public (not referenced anywhere in src/ today; scoped for consistency)
DROP POLICY IF EXISTS "Public read access" ON storage.objects;
CREATE POLICY "public: owner read" ON storage.objects
  FOR SELECT USING (bucket_id = 'public' AND (storage.foldername(name))[1] = auth.uid()::text);
;
