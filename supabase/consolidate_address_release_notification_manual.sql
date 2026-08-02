-- ============================================================
-- CERVICED — Wire manual address release into the shared notification helper.
-- Run AFTER consolidate_address_release_notification.sql. Safe to re-run.
--
-- Ship this AFTER the app has stopped calling notifyClientAddressReleased
-- (databaseService.ts's releaseBookingAddress) — see
-- consolidate_address_release_notification.sql's header for why the ordering
-- matters: app-stops-sending before DB-starts-sending avoids a window of
-- duplicate notifications; the reverse order only risks a transient missing
-- notification, which self-heals once this file lands.
--
-- Also closes a small pre-existing gap in fix_bookings_provider_update_bypass.sql's
-- version: repeat calls re-stamped address_released_at every time (no NULL
-- guard on the UPDATE), so a provider tapping "release" twice would just move
-- the timestamp forward. Guarded now — but NOT by folding the guard into the
-- original ownership-check UPDATE, because that UPDATE's zero-rows-affected
-- case is what triggers the existing "Booking not found or not owned by
-- caller" exception. Folding "already released" into that same UPDATE would
-- make a harmless second tap raise that exception, which is wrong — the
-- booking IS found and owned, it's just already released. So the ownership
-- check and the release UPDATE are now two separate steps: the first can
-- only ever fail with "not owned", the second is a plain idempotent no-op.
--
-- VERIFY
--   -- as the owning provider, call the RPC on the same booking twice:
--   select public.provider_release_booking_address('<booking id>');
--   select public.provider_release_booking_address('<booking id>');
--   select count(*) from notifications where booking_id = '<booking id>' and type = 'address_released';
--     → expect exactly 1
--   select address_released_at from bookings where id = '<booking id>';
--     → expect it did not change between the two calls
--   -- as a different provider (not owning the booking):
--   select public.provider_release_booking_address('<someone else''s booking id>');
--     → expect: still raises "Booking not found or not owned by caller"
-- ============================================================

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
