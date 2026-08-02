-- ============================================================
-- CERVICED -- Fix: provider-side bookings UPDATE had no WITH CHECK either
-- (the same gap as fix_bookings_client_update_bypass.sql, mirrored on the
-- provider side). A provider's direct API call could change a booking's
-- date/time, price, deposit, or payment_status fields -- none of which
-- have any legitimate provider-side direct-write path in the app today.
-- Safe to re-run.
--
-- Traced every live direct (non-RPC) write path the PROVIDER side uses
-- against bookings:
--   - cancel/decline: routed through provider_cancel_own_booking() RPC
--     already (BookingContext.tsx's cancelBooking)
--   - confirm/start/complete/no-show: raw status update from
--     ProviderBookingDetailScreen (updateBookingStatus) -- legitimate,
--     kept working, just moved behind a narrow RPC that can ONLY touch
--     the status column
--   - address release: raw update from ProviderBookingDetailScreen
--     (releaseBookingAddress) -- legitimate, moved behind a narrow RPC
--     that can ONLY touch address_released_at
--
-- Neither of those two legitimate flows needs to touch booking_date,
-- booking_time, base_price, deposit_amount, payment_status, or any other
-- column -- so after moving them behind narrow RPCs, the provider role has
-- no remaining legitimate need for a general "update your own bookings"
-- policy, same reasoning as the client-side fix.
-- ============================================================

CREATE OR REPLACE FUNCTION public.provider_update_booking_status(p_booking_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.bookings b
  SET status = p_status
  WHERE b.id = p_booking_id
    AND b.provider_id IN (SELECT p.id FROM public.providers p WHERE p.user_id = auth.uid());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found or not owned by caller';
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.provider_update_booking_status(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.provider_release_booking_address(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.bookings b
  SET address_released_at = NOW()
  WHERE b.id = p_booking_id
    AND b.provider_id IN (SELECT p.id FROM public.providers p WHERE p.user_id = auth.uid());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found or not owned by caller';
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.provider_release_booking_address(uuid) TO authenticated;

DROP POLICY IF EXISTS "bookings_provider_update" ON public.bookings;
