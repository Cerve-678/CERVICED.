-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260808173143
-- Remote name: fix_reschedule_requested_dates_type_mismatch
-- Do not edit this recovery archive; create a new tracked migration for changes.

ALTER TABLE public.booking_reschedule_requests
  ADD COLUMN IF NOT EXISTS requested_times TEXT[];

CREATE OR REPLACE FUNCTION public.request_reschedule_own_booking(
  p_booking_id UUID,
  p_preferred_dates TEXT[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking RECORD;
  v_policies JSONB;
  v_max_raw TEXT;
  v_max INT;
  v_notice_raw TEXT;
  v_notice_hrs INT;
  v_hours_until NUMERIC;
  v_hours_since_last NUMERIC;
  v_active_request BOOLEAN;
  v_dates DATE[] := ARRAY[]::DATE[];
  v_times TEXT[] := ARRAY[]::TEXT[];
  v_raw TEXT;
BEGIN
  SELECT b.status, b.booking_date, b.booking_time, b.provider_id,
         b.reschedule_count, b.last_rescheduled_at
    INTO v_booking
    FROM public.bookings b
   WHERE b.id = p_booking_id
     AND b.user_id = auth.uid()
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_booking.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Only confirmed bookings can be rescheduled';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.booking_reschedule_requests
     WHERE booking_id = p_booking_id AND status IN ('pending', 'provider_responded')
  ) INTO v_active_request;

  IF v_active_request THEN
    RAISE EXCEPTION 'A reschedule request is already in progress for this booking';
  END IF;

  IF v_booking.last_rescheduled_at IS NOT NULL THEN
    v_hours_since_last := EXTRACT(EPOCH FROM (NOW() - v_booking.last_rescheduled_at)) / 3600;
    IF v_hours_since_last < 24 THEN
      RAISE EXCEPTION 'You can reschedule again in % hours', CEIL(24 - v_hours_since_last);
    END IF;
  END IF;

  SELECT booking_policies INTO v_policies
    FROM public.providers WHERE id = v_booking.provider_id;

  v_max_raw := v_policies->>'maxReschedules';
  IF v_max_raw IS DISTINCT FROM 'unlimited' THEN
    v_max := COALESCE(NULLIF(v_max_raw, '')::INT, 1);
    IF v_booking.reschedule_count >= v_max THEN
      RAISE EXCEPTION 'This provider allows a maximum of % reschedule(s) per booking', v_max;
    END IF;
  END IF;

  v_notice_raw := v_policies->>'rescheduleNotice';
  v_notice_hrs := CASE v_notice_raw
    WHEN 'same_day' THEN 0
    WHEN '48h' THEN 48
    WHEN '72h' THEN 72
    ELSE 24 -- '24h' or unset — matches the app's historical default
  END;

  IF v_notice_hrs > 0 THEN
    v_hours_until := EXTRACT(EPOCH FROM (
      (v_booking.booking_date + v_booking.booking_time)::timestamp - NOW()
    )) / 3600;
    IF v_hours_until < v_notice_hrs THEN
      RAISE EXCEPTION 'This provider requires % hours notice to reschedule', v_notice_hrs;
    END IF;
  END IF;

  -- p_preferred_dates elements are "YYYY-MM-DD" or "YYYY-MM-DD HH:MM"
  -- (RescheduleScreen.tsx sends the latter). Split each into its date
  -- (cast to DATE — the ::date[] cast the original version of this
  -- function was missing) and time (preserved, not dropped, in
  -- requested_times).
  FOREACH v_raw IN ARRAY p_preferred_dates LOOP
    v_dates := v_dates || (split_part(v_raw, ' ', 1))::DATE;
    v_times := v_times || NULLIF(split_part(v_raw, ' ', 2), '');
  END LOOP;

  INSERT INTO public.booking_reschedule_requests
    (booking_id, requested_by, original_date, original_time, requested_dates,
     requested_times, provider_available_slots, status, reschedule_count, updated_at)
  VALUES
    (p_booking_id, 'user', v_booking.booking_date, v_booking.booking_time,
     v_dates, v_times, NULL, 'pending', 0, NOW())
  ON CONFLICT (booking_id) DO UPDATE
    SET requested_by = 'user',
        requested_dates = v_dates,
        requested_times = v_times,
        provider_available_slots = NULL,
        status = 'pending',
        updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_reschedule_own_booking(UUID, TEXT[]) TO authenticated;
