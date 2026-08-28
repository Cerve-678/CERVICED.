-- Missed in the first pass: service_add_ons had two duplicate public-read
-- policies, one scoped only to is_active (no provider join) and one fully
-- open (USING true) with no gating at all. Same has_gone_live/is_active
-- gate as service_images, via services -> providers.
DROP POLICY IF EXISTS "add_ons_public_read" ON public.service_add_ons;
DROP POLICY IF EXISTS "service_add_ons_public_read" ON public.service_add_ons;
CREATE POLICY "service_add_ons_public_read" ON public.service_add_ons
  FOR SELECT USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.services s
      JOIN public.providers p ON p.id = s.provider_id
      WHERE s.id = service_add_ons.service_id
        AND p.has_gone_live = true
        AND p.is_active = true
    )
  );
;
