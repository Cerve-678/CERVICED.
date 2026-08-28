-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260801124403
-- Remote name: consolidate_address_release_notification_manual
-- Do not edit this recovery archive; create a new tracked migration for changes.

CREATE OR REPLACE FUNCTION public.provider_release_booking_address(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated BOOLEAN := FALSE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.bookings b
     WHERE b.id = p_booking_id
       AND b.provider_id IN (SELECT p.id FROM public.providers p WHERE p.user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Booking not found or not owned by caller';
  END IF;

  UPDATE public.bookings b
     SET address_released_at = NOW()
   WHERE b.id = p_booking_id
     AND b.address_released_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated THEN
    PERFORM public.notify_address_released(p_booking_id);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.provider_release_booking_address(uuid) TO authenticated;
