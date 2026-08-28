-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260801124420
-- Remote name: stamp_booking_address_snapshot_fallback_location_text
-- Do not edit this recovery archive; create a new tracked migration for changes.

CREATE OR REPLACE FUNCTION public.stamp_booking_address_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_address   TEXT;
  v_location_text  TEXT;
BEGIN
  SELECT d.full_address INTO v_full_address
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

  RETURN NEW;
END;
$$;
