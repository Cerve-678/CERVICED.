-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260803221837
-- Remote name: fix_reschedule_request_rls_forgery_gap
-- Do not edit this recovery archive; create a new tracked migration for changes.

-- Step 1: provider-side RPC, mirrors respondToRescheduleRequest's payload
-- but re-verifies the caller owns the provider on this booking, and that
-- the request is still 'pending' server-side (not a client-supplied WHERE).
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

-- Step 2: provider-initiated reschedule RPC, mirrors
-- upsertProviderRescheduleRequest but re-verifies provider ownership of
-- the booking instead of trusting an unrestricted upsert.
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

-- Step 3: lock down RLS. Drop the two unrestricted FOR ALL policies,
-- replace with SELECT-only policies per role. All writes now route through
-- SECURITY DEFINER RPCs (request_reschedule_own_booking,
-- confirm_reschedule_own_booking, respond_to_reschedule_request,
-- provider_initiate_reschedule), same shape as bookings itself.
DROP POLICY IF EXISTS reschedule_user_all ON public.booking_reschedule_requests;
DROP POLICY IF EXISTS reschedule_provider_all ON public.booking_reschedule_requests;

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
