ALTER TABLE public.provider_private_details
  ADD COLUMN IF NOT EXISTS latitude  NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7);

CREATE OR REPLACE FUNCTION public.stamp_booking_address_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_address   TEXT;
  v_latitude       NUMERIC(10,7);
  v_longitude      NUMERIC(10,7);
  v_location_text  TEXT;
BEGIN
  SELECT d.full_address, d.latitude, d.longitude
    INTO v_full_address, v_latitude, v_longitude
  FROM public.provider_private_details d
  WHERE d.provider_id = NEW.provider_id;

  SELECT p.location_text INTO v_location_text
  FROM public.providers p
  WHERE p.id = NEW.provider_id;

  NEW.provider_address_snapshot := COALESCE(
    NULLIF(btrim(v_full_address), ''),
    NULLIF(btrim(v_location_text), ''),
    NEW.provider_address_snapshot
  );

  IF v_latitude IS NOT NULL AND v_longitude IS NOT NULL THEN
    NEW.provider_coordinates := jsonb_build_object('lat', v_latitude, 'lng', v_longitude);
  END IF;

  RETURN NEW;
END;
$$;

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
    )
    AND EXISTS (
      SELECT 1 FROM public.provider_private_details d
      WHERE d.provider_id = p_provider_id
        AND btrim(COALESCE(d.full_address, '')) <> ''
        AND d.latitude IS NOT NULL
        AND d.longitude IS NOT NULL
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_provider_address_change()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.check_and_set_provider_live(NEW.provider_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_provider_address_change ON public.provider_private_details;
CREATE TRIGGER on_provider_address_change
  AFTER INSERT OR UPDATE ON public.provider_private_details
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_provider_address_change();
;
