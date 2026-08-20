-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260817105507
-- Remote name: fix_client_reliability_tracking
-- Do not edit this recovery archive; create a new tracked migration for changes.

-- 1. Table
CREATE TABLE IF NOT EXISTS public.client_provider_reliability (
  provider_id      uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  client_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  no_show_count    integer NOT NULL DEFAULT 0,
  late_cancel_count integer NOT NULL DEFAULT 0,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_id, client_user_id)
);

COMMENT ON TABLE public.client_provider_reliability IS
  'Per-(provider, client) no-show / late-cancellation counters. Incremented by cancel_own_booking() (late_cancel_count) and provider_update_booking_status() (no_show_count) only — never written directly by app code. See fix_client_reliability_tracking.sql for the exact "late cancellation" definition used.';

ALTER TABLE public.client_provider_reliability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_provider_reliability_provider_read ON public.client_provider_reliability;
CREATE POLICY client_provider_reliability_provider_read
  ON public.client_provider_reliability
  FOR SELECT
  USING (
    provider_id IN (SELECT p.id FROM public.providers p WHERE p.user_id = auth.uid())
  );

GRANT SELECT ON public.client_provider_reliability TO authenticated;
REVOKE ALL ON public.client_provider_reliability FROM anon;

CREATE INDEX IF NOT EXISTS idx_client_provider_reliability_provider
  ON public.client_provider_reliability (provider_id);

-- 2. cancel_own_booking with late-cancel increment
CREATE OR REPLACE FUNCTION public.cancel_own_booking(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_booking   RECORD;
  v_notice_hrs INT;
  v_hours_until NUMERIC;
  v_cancel_notice TEXT;
BEGIN
  SELECT b.status, b.booking_date, b.booking_time, b.provider_id, b.user_id
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

  v_hours_until := EXTRACT(EPOCH FROM (
    (v_booking.booking_date + v_booking.booking_time)::timestamp - NOW()
  )) / 3600;

  IF COALESCE(v_notice_hrs, 0) > 0 THEN
    IF v_hours_until < v_notice_hrs THEN
      RAISE EXCEPTION 'This provider requires % hours notice to cancel', v_notice_hrs;
    END IF;
  END IF;

  IF v_booking.status = 'confirmed' AND v_hours_until >= 0 AND v_hours_until < 24 THEN
    INSERT INTO public.client_provider_reliability (provider_id, client_user_id, late_cancel_count, updated_at)
    VALUES (v_booking.provider_id, v_booking.user_id, 1, NOW())
    ON CONFLICT (provider_id, client_user_id)
    DO UPDATE SET late_cancel_count = client_provider_reliability.late_cancel_count + 1,
                  updated_at = NOW();
  END IF;

  UPDATE public.bookings SET status = 'cancelled' WHERE id = p_booking_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_own_booking(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_own_booking(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_own_booking(uuid) TO authenticated;

-- 3. provider_update_booking_status with no_show increment
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
  v_client_user_id  uuid;
  v_grace_minutes   integer;
BEGIN
  SELECT b.status, b.booking_date, b.booking_time, b.provider_id, b.user_id
    INTO v_current_status, v_booking_date, v_booking_time, v_provider_id, v_client_user_id
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

  IF p_status = 'no_show' THEN
    INSERT INTO public.client_provider_reliability (provider_id, client_user_id, no_show_count, updated_at)
    VALUES (v_provider_id, v_client_user_id, 1, NOW())
    ON CONFLICT (provider_id, client_user_id)
    DO UPDATE SET no_show_count = client_provider_reliability.no_show_count + 1,
                  updated_at = NOW();
  END IF;

  UPDATE public.bookings SET status = p_status WHERE id = p_booking_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.provider_update_booking_status(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provider_update_booking_status(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.provider_update_booking_status(uuid, text) TO authenticated;
