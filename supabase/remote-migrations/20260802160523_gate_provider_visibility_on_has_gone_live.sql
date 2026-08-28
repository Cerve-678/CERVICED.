-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260802160523
-- Remote name: gate_provider_visibility_on_has_gone_live
-- Do not edit this recovery archive; create a new tracked migration for changes.

-- Security audit fix: RLS on providers/services and their ancillary tables
-- was FOR SELECT USING (true) with no has_gone_live/is_active gating at the
-- database level. The app's databaseService.ts filters on has_gone_live in
-- its query shape, but that's convention only — anyone with the public anon
-- key can call the Supabase REST API directly and bypass it entirely. This
-- migration makes has_gone_live/is_active gating an actual RLS enforcement
-- boundary, matching CLAUDE.md's stated (but previously unenforced) rule.
-- Provider owners keep full access to their own not-yet-live records via
-- the existing providers_owner_all / *_owner_write ALL policies, which are
-- unaffected by these changes.

-- providers
DROP POLICY IF EXISTS "providers_public_read" ON public.providers;
CREATE POLICY "providers_public_read" ON public.providers
  FOR SELECT USING (has_gone_live = true AND is_active = true);

-- services
DROP POLICY IF EXISTS "services_public_read" ON public.services;
CREATE POLICY "services_public_read" ON public.services
  FOR SELECT USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = services.provider_id
        AND p.has_gone_live = true
        AND p.is_active = true
    )
  );

-- portfolio_items
DROP POLICY IF EXISTS "portfolio_public_read" ON public.portfolio_items;
CREATE POLICY "portfolio_public_read" ON public.portfolio_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = portfolio_items.provider_id
        AND p.has_gone_live = true
        AND p.is_active = true
    )
  );

-- service_images (via services -> providers)
DROP POLICY IF EXISTS "service_images_public_read" ON public.service_images;
CREATE POLICY "service_images_public_read" ON public.service_images
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.services s
      JOIN public.providers p ON p.id = s.provider_id
      WHERE s.id = service_images.service_id
        AND p.has_gone_live = true
        AND p.is_active = true
    )
  );

-- provider_availability
DROP POLICY IF EXISTS "availability_public_read" ON public.provider_availability;
CREATE POLICY "availability_public_read" ON public.provider_availability
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = provider_availability.provider_id
        AND p.has_gone_live = true
        AND p.is_active = true
    )
  );

-- provider_availability_windows
DROP POLICY IF EXISTS "availability_windows_public_read" ON public.provider_availability_windows;
CREATE POLICY "availability_windows_public_read" ON public.provider_availability_windows
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = provider_availability_windows.provider_id
        AND p.has_gone_live = true
        AND p.is_active = true
    )
  );

-- provider_availability_overrides
DROP POLICY IF EXISTS "availability_overrides_public_read" ON public.provider_availability_overrides;
CREATE POLICY "availability_overrides_public_read" ON public.provider_availability_overrides
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = provider_availability_overrides.provider_id
        AND p.has_gone_live = true
        AND p.is_active = true
    )
  );

-- provider_blocked_dates (had two duplicate public-read policies)
DROP POLICY IF EXISTS "blocked_dates_public_read" ON public.provider_blocked_dates;
DROP POLICY IF EXISTS "Public read blocked dates" ON public.provider_blocked_dates;
CREATE POLICY "blocked_dates_public_read" ON public.provider_blocked_dates
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = provider_blocked_dates.provider_id
        AND p.has_gone_live = true
        AND p.is_active = true
    )
  );

-- provider_specialties
DROP POLICY IF EXISTS "specialties_public_read" ON public.provider_specialties;
CREATE POLICY "specialties_public_read" ON public.provider_specialties
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = provider_specialties.provider_id
        AND p.has_gone_live = true
        AND p.is_active = true
    )
  );

-- reviews: tighten public read to launched providers, but add an explicit
-- owner-read policy so a provider can still see their own reviews (e.g.
-- reviews imported during onboarding, before going live) — mirroring the
-- owner exception already established for the providers table itself.
DROP POLICY IF EXISTS "reviews_public_read" ON public.reviews;
CREATE POLICY "reviews_public_read" ON public.reviews
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = reviews.provider_id
        AND p.has_gone_live = true
        AND p.is_active = true
    )
  );
CREATE POLICY "reviews_owner_read" ON public.reviews
  FOR SELECT USING (
    provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
  );

-- users_service_insert was WITH CHECK (true), which shadowed the existing
-- correct "Users can insert own profile" (auth.uid() = id) policy — since
-- RLS policies are OR'd together, the permissive one made the strict one a
-- no-op. Tighten it to match, closing that gap.
DROP POLICY IF EXISTS "users_service_insert" ON public.users;
CREATE POLICY "users_service_insert" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);
