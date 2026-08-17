-- ── 1. group_reschedule_batch_id column ──────────────────────────────────
ALTER TABLE public.booking_reschedule_requests
  ADD COLUMN IF NOT EXISTS group_reschedule_batch_id UUID;

CREATE INDEX IF NOT EXISTS idx_reschedule_requests_group_batch
  ON public.booking_reschedule_requests (group_reschedule_batch_id)
  WHERE group_reschedule_batch_id IS NOT NULL;

-- ── 2. provider_initiate_group_reschedule ────────────────────────────────
CREATE OR REPLACE FUNCTION public.provider_initiate_group_reschedule(
  p_group_booking_id UUID,
  p_proposals JSONB
) RETURNS TABLE(booking_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider_id UUID;
  v_batch_id UUID := gen_random_uuid();
  v_proposal JSONB;
  v_booking_id UUID;
  v_booking RECORD;
BEGIN
  SELECT p.id INTO v_provider_id
    FROM public.providers p WHERE p.user_id = auth.uid();

  IF v_provider_id IS NULL THEN
    RAISE EXCEPTION 'No provider profile for caller';
  END IF;

  IF jsonb_array_length(p_proposals) = 0 THEN
    RAISE EXCEPTION 'No proposals supplied';
  END IF;

  FOR v_proposal IN SELECT * FROM jsonb_array_elements(p_proposals)
  LOOP
    v_booking_id := (v_proposal->>'booking_id')::UUID;

    SELECT b.id, b.status, b.group_booking_id
      INTO v_booking
      FROM public.bookings b
     WHERE b.id = v_booking_id
       AND b.provider_id = v_provider_id
     FOR UPDATE OF b;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Booking % not found or not owned by caller', v_booking_id;
    END IF;

    IF v_booking.group_booking_id IS DISTINCT FROM p_group_booking_id THEN
      RAISE EXCEPTION 'Booking % is not part of group %', v_booking_id, p_group_booking_id;
    END IF;

    IF v_booking.status <> 'confirmed' THEN
      RAISE EXCEPTION 'Only confirmed bookings can be rescheduled (booking % is %)', v_booking_id, v_booking.status;
    END IF;
  END LOOP;

  FOR v_proposal IN SELECT * FROM jsonb_array_elements(p_proposals)
  LOOP
    v_booking_id := (v_proposal->>'booking_id')::UUID;

    SELECT b.booking_date, b.booking_time INTO v_booking
      FROM public.bookings b WHERE b.id = v_booking_id;

    INSERT INTO public.booking_reschedule_requests
      (booking_id, requested_by, original_date, original_time, requested_dates,
       provider_available_slots, status, reschedule_count, updated_at,
       group_reschedule_batch_id)
    VALUES
      (v_booking_id, 'provider', v_booking.booking_date, v_booking.booking_time,
       ARRAY[]::DATE[], v_proposal->'available_slots', 'provider_responded', 0, NOW(),
       v_batch_id)
    ON CONFLICT (booking_id) DO UPDATE
      SET requested_by = 'provider',
          original_date = v_booking.booking_date,
          original_time = v_booking.booking_time,
          requested_dates = ARRAY[]::DATE[],
          provider_available_slots = v_proposal->'available_slots',
          status = 'provider_responded',
          updated_at = NOW(),
          group_reschedule_batch_id = v_batch_id;
  END LOOP;

  RETURN QUERY
    SELECT (v_proposal->>'booking_id')::UUID
    FROM jsonb_array_elements(p_proposals) v_proposal;
END;
$$;

REVOKE ALL ON FUNCTION public.provider_initiate_group_reschedule(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provider_initiate_group_reschedule(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.provider_initiate_group_reschedule(uuid, jsonb) TO authenticated;

-- ── 3. confirm_group_reschedule ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirm_group_reschedule(
  p_group_booking_id UUID,
  p_selections JSONB
) RETURNS TABLE(booking_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_selection JSONB;
  v_booking_id UUID;
  v_found BOOLEAN;
BEGIN
  IF jsonb_array_length(p_selections) = 0 THEN
    RAISE EXCEPTION 'No selections supplied';
  END IF;

  FOR v_selection IN SELECT * FROM jsonb_array_elements(p_selections)
  LOOP
    v_booking_id := (v_selection->>'booking_id')::UUID;

    SELECT EXISTS (
      SELECT 1
      FROM public.booking_reschedule_requests r
      JOIN public.bookings b ON b.id = r.booking_id
      WHERE r.booking_id = v_booking_id
        AND b.user_id = auth.uid()
        AND b.group_booking_id = p_group_booking_id
        AND r.status = 'provider_responded'
      FOR UPDATE OF r, b
    ) INTO v_found;

    IF NOT v_found THEN
      RAISE EXCEPTION 'No provider-responded reschedule request found for booking % in this group', v_booking_id;
    END IF;
  END LOOP;

  FOR v_selection IN SELECT * FROM jsonb_array_elements(p_selections)
  LOOP
    v_booking_id := (v_selection->>'booking_id')::UUID;

    UPDATE public.bookings
       SET booking_date = (v_selection->>'new_date')::DATE,
           booking_time = (v_selection->>'new_time')::TIME,
           end_time = (v_selection->>'new_end_time')::TIME,
           reschedule_count = COALESCE(reschedule_count, 0) + 1,
           last_rescheduled_at = NOW()
     WHERE id = v_booking_id;

    UPDATE public.booking_reschedule_requests
       SET status = 'confirmed',
           updated_at = NOW()
     WHERE booking_id = v_booking_id;
  END LOOP;

  RETURN QUERY
    SELECT (v_selection->>'booking_id')::UUID
    FROM jsonb_array_elements(p_selections) v_selection;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_group_reschedule(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.confirm_group_reschedule(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.confirm_group_reschedule(uuid, jsonb) TO authenticated;

-- ── 4. decline_group_reschedule_offer ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.decline_group_reschedule_offer(
  p_group_booking_id UUID
) RETURNS TABLE(booking_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT r.booking_id
      FROM public.booking_reschedule_requests r
      JOIN public.bookings b ON b.id = r.booking_id
     WHERE b.user_id = auth.uid()
       AND b.group_booking_id = p_group_booking_id
       AND r.status = 'provider_responded'
     FOR UPDATE OF r
  LOOP
    NULL;
  END LOOP;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No provider-responded reschedule requests found for this group';
  END IF;

  RETURN QUERY
    UPDATE public.booking_reschedule_requests r
       SET status = 'rejected',
           updated_at = NOW()
      FROM public.bookings b
     WHERE r.booking_id = b.id
       AND b.user_id = auth.uid()
       AND b.group_booking_id = p_group_booking_id
       AND r.status = 'provider_responded'
    RETURNING r.booking_id;
END;
$$;

REVOKE ALL ON FUNCTION public.decline_group_reschedule_offer(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decline_group_reschedule_offer(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.decline_group_reschedule_offer(uuid) TO authenticated;
;
