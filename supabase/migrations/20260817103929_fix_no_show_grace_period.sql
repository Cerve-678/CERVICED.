-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260817103929
-- Remote name: fix_no_show_grace_period
-- Do not edit this recovery archive; create a new tracked migration for changes.

CREATE OR REPLACE FUNCTION public.provider_update_booking_status(p_booking_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_status  text;
  v_booking_date    date;
  v_booking_time    time;
  v_appt_start      timestamp;
  v_active_reschedule boolean;
  v_provider_id     uuid;
  v_grace_minutes   integer;
BEGIN
  SELECT b.status, b.booking_date, b.booking_time, b.provider_id
    INTO v_current_status, v_booking_date, v_booking_time, v_provider_id
    FROM public.bookings b
   WHERE b.id = p_booking_id
     AND b.provider_id IN (SELECT p.id FROM public.providers p WHERE p.user_id = auth.uid())
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found or not owned by caller';
  END IF;

  IF v_current_status IN ('cancelled', 'completed', 'no_show') THEN
    RAISE EXCEPTION 'Booking is already %, no further status changes allowed', v_current_status;
  END IF;

  IF p_status = 'cancelled' THEN
    RAISE EXCEPTION 'Use provider_cancel_own_booking() to cancel a booking';
  END IF;

  v_appt_start := (v_booking_date + v_booking_time)::timestamp;

  SELECT COALESCE((booking_policies->>'noShowGraceMinutes')::integer, 0)
    INTO v_grace_minutes
    FROM public.providers
   WHERE id = v_provider_id;
  v_grace_minutes := GREATEST(COALESCE(v_grace_minutes, 0), 0);

  IF p_status = 'no_show' THEN
    IF v_booking_date <> CURRENT_DATE THEN
      RAISE EXCEPTION 'no_show can only be marked on the day of the appointment';
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.booking_reschedule_requests r
       WHERE r.booking_id = p_booking_id
         AND r.status IN ('pending', 'provider_responded')
    ) INTO v_active_reschedule;
    IF v_active_reschedule THEN
      RAISE EXCEPTION 'Cannot mark no_show while a reschedule request is active for this booking';
    END IF;
  END IF;

  IF v_current_status = 'pending' THEN
    IF p_status <> 'confirmed' THEN
      RAISE EXCEPTION 'Invalid status transition: % -> %', v_current_status, p_status;
    END IF;

  ELSIF v_current_status = 'confirmed' THEN
    IF p_status = 'in_progress' THEN
      NULL;
    ELSIF p_status = 'no_show' THEN
      IF NOW() < v_appt_start + (v_grace_minutes * INTERVAL '1 minute') THEN
        RAISE EXCEPTION 'Cannot mark no_show until % minute(s) after the appointment start time', v_grace_minutes;
      END IF;
    ELSIF p_status = 'completed' THEN
      IF v_appt_start >= NOW() THEN
        RAISE EXCEPTION 'Cannot mark % before the appointment start time', p_status;
      END IF;
    ELSE
      RAISE EXCEPTION 'Invalid status transition: % -> %', v_current_status, p_status;
    END IF;

  ELSIF v_current_status = 'in_progress' THEN
    IF p_status = 'completed' THEN
      NULL;
    ELSIF p_status = 'no_show' THEN
      IF NOW() < v_appt_start + (v_grace_minutes * INTERVAL '1 minute') THEN
        RAISE EXCEPTION 'Cannot mark no_show until % minute(s) after the appointment start time', v_grace_minutes;
      END IF;
    ELSE
      RAISE EXCEPTION 'Invalid status transition: % -> %', v_current_status, p_status;
    END IF;

  ELSE
    RAISE EXCEPTION 'Unrecognized current status: %', v_current_status;
  END IF;

  UPDATE public.bookings SET status = p_status WHERE id = p_booking_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.provider_update_booking_status(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provider_update_booking_status(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.provider_update_booking_status(uuid, text) TO authenticated;
