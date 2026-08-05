-- ============================================================
-- CERVICED — Close the reschedule-request forgery gap
-- Deployed to project ztrfpfvvejzaysrelmfm on 2026-08-03. Safe to re-run.
--
-- Root cause: booking_reschedule_requests had reschedule_user_all /
-- reschedule_provider_all — both `FOR ALL USING (...)` with no
-- WITH CHECK, on both client and provider sides. That meant a client could
-- call .update() directly (bypassing the app's respondToRescheduleRequest,
-- which is meant to be provider-only) and set
-- status = 'provider_responded' on their own booking's request row.
-- confirm_reschedule_own_booking() trusts that flag without independently
-- verifying the provider actually set it — so a client could confirm a
-- reschedule to any date/time they themselves proposed, with no real
-- provider approval. See memory: rls-booking-update-unrestricted.md.
--
-- Fix: two new SECURITY DEFINER RPCs that re-verify provider ownership of
-- the booking server-side (same pattern as request_reschedule_own_booking /
-- confirm_reschedule_own_booking / provider_cancel_own_booking, all of
-- which already re-derive facts from the bookings table rather than
-- trusting client-supplied values), then drop the two permissive policies
-- and replace with SELECT-only policies — every write now goes through an
-- RPC, none through the client SDK directly. Same shape as `bookings`
-- itself (zero UPDATE/DELETE policies, RPC-only — see
-- fix_bookings_provider_update_bypass.sql).
-- ============================================================

CREATE OR REPLACE FUNCTION public.respond_to_reschedule_request(
  p_booking_id UUID,
  p_available_slots JSONB
) RETURNS VOID AS $$
DECLARE
  v_found BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.booking_reschedule_requests r
    JOIN public.bookings b ON b.id = r.booking_id
    JOIN public.providers p ON p.id = b.provider_id
    WHERE r.booking_id = p_booking_id
      AND p.user_id = auth.uid()
      AND r.status = 'pending'
    FOR UPDATE OF r
  ) INTO v_found;

  IF NOT v_found THEN
    RAISE EXCEPTION 'No pending reschedule request found for this booking';
  END IF;

  UPDATE public.booking_reschedule_requests
     SET provider_available_slots = p_available_slots,
         status = 'provider_responded',
         updated_at = NOW()
   WHERE booking_id = p_booking_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.provider_initiate_reschedule(
  p_booking_id UUID,
  p_proposed_slots JSONB
) RETURNS VOID AS $$
DECLARE
  v_booking RECORD;
BEGIN
  SELECT b.booking_date, b.booking_time, b.status
    INTO v_booking
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
   WHERE b.id = p_booking_id
     AND p.user_id = auth.uid()
   FOR UPDATE OF b;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_booking.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Only confirmed bookings can be rescheduled';
  END IF;

  INSERT INTO public.booking_reschedule_requests
    (booking_id, requested_by, original_date, original_time, requested_dates,
     provider_available_slots, status, reschedule_count, updated_at)
  VALUES
    (p_booking_id, 'provider', v_booking.booking_date, v_booking.booking_time,
     ARRAY[]::DATE[], p_proposed_slots, 'provider_responded', 0, NOW())
  ON CONFLICT (booking_id) DO UPDATE
    SET requested_by = 'provider',
        original_date = v_booking.booking_date,
        original_time = v_booking.booking_time,
        requested_dates = ARRAY[]::DATE[],
        provider_available_slots = p_proposed_slots,
        status = 'provider_responded',
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP POLICY IF EXISTS reschedule_user_all ON public.booking_reschedule_requests;
DROP POLICY IF EXISTS reschedule_provider_all ON public.booking_reschedule_requests;
DROP POLICY IF EXISTS reschedule_user_select ON public.booking_reschedule_requests;
DROP POLICY IF EXISTS reschedule_provider_select ON public.booking_reschedule_requests;

CREATE POLICY reschedule_user_select ON public.booking_reschedule_requests
  FOR SELECT USING (
    booking_id IN (SELECT id FROM public.bookings WHERE user_id = auth.uid())
  );

CREATE POLICY reschedule_provider_select ON public.booking_reschedule_requests
  FOR SELECT USING (
    booking_id IN (
      SELECT b.id FROM public.bookings b
      JOIN public.providers p ON p.id = b.provider_id
      WHERE p.user_id = auth.uid()
    )
  );

-- App-side changes landed alongside this file:
--   - databaseService.ts: respondToRescheduleRequest and
--     upsertProviderRescheduleRequest now call these RPCs via .rpc()
--     instead of raw .update()/.upsert(). upsertProviderRescheduleRequest's
--     signature dropped original_date/original_time params — the RPC
--     derives them from the booking row server-side now.
--   - databaseService.ts: upsertRescheduleRequest (unused, superseded by
--     request_reschedule_own_booking) and closeRescheduleRequest (its one
--     call site in BookingContext.tsx was redundant — confirm_reschedule_
--     own_booking's RPC already sets status='confirmed' on the request row
--     as its last step) were both deleted as dead code.
