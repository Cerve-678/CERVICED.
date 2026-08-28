-- Requires at least one service, not just an open schedule day, before a
-- provider goes live. One-way flag — never un-flips an already-live provider.

CREATE OR REPLACE FUNCTION public.check_and_set_provider_live(p_provider_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.providers p
  SET has_gone_live = TRUE
  WHERE p.id = p_provider_id
    AND p.has_gone_live = FALSE
    AND EXISTS (
      SELECT 1 FROM public.provider_availability a
      WHERE a.provider_id = p_provider_id AND a.is_closed = FALSE
    )
    AND EXISTS (
      SELECT 1 FROM public.services s
      WHERE s.provider_id = p_provider_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_provider_availability_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_closed = FALSE THEN
    PERFORM public.check_and_set_provider_live(NEW.provider_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.handle_provider_service_insert()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.check_and_set_provider_live(NEW.provider_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_provider_service_insert ON public.services;
CREATE TRIGGER on_provider_service_insert
  AFTER INSERT ON public.services
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_provider_service_insert();
;
