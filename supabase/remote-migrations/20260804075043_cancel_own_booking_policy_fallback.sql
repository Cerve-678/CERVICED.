-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260804075043
-- Remote name: cancel_own_booking_policy_fallback
-- Do not edit this recovery archive; create a new tracked migration for changes.

CREATE OR REPLACE FUNCTION public.cancel_own_booking(p_booking_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking   RECORD;
  v_notice_hrs INT;
  v_hours_until NUMERIC;
  v_cancel_notice TEXT;
BEGIN
  SELECT b.status, b.booking_date, b.booking_time, b.provider_id
    INTO v_booking
    FROM public.bookings b
   WHERE b.id = p_booking_id
     AND b.user_id = auth.uid()
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_booking.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'This booking can no longer be cancelled';
  END IF;

  SELECT cancellation_notice_hours, booking_policies ->> 'cancelNotice'
    INTO v_notice_hrs, v_cancel_notice
    FROM public.providers WHERE id = v_booking.provider_id;

  IF COALESCE(v_notice_hrs, 0) = 0 THEN
    v_notice_hrs := CASE v_cancel_notice
      WHEN '24h' THEN 24
      WHEN '48h' THEN 48
      WHEN '72h' THEN 72
      ELSE 0
    END;
  END IF;

  IF COALESCE(v_notice_hrs, 0) > 0 THEN
    v_hours_until := EXTRACT(EPOCH FROM (
      (v_booking.booking_date + v_booking.booking_time)::timestamp - NOW()
    )) / 3600;

    IF v_hours_until < v_notice_hrs THEN
      RAISE EXCEPTION 'This provider requires % hours notice to cancel', v_notice_hrs;
    END IF;
  END IF;

  UPDATE public.bookings SET status = 'cancelled' WHERE id = p_booking_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_own_booking(UUID) TO authenticated;
