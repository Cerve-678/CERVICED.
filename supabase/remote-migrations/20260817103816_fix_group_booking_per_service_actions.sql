-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260817103816
-- Remote name: fix_group_booking_per_service_actions
-- Do not edit this recovery archive; create a new tracked migration for changes.

-- fix_group_booking_per_service_actions.sql
-- See supabase/fix_group_booking_per_service_actions.sql in the repo for the full
-- header/reasoning. This is a verification-and-hardening pass: re-affirms
-- (byte-identical) the three single-row RPCs, adds COMMENT ON FUNCTION markers
-- recording that the absence of a group_booking_id guard on them is
-- intentional, and re-applies the REVOKE/GRANT lockdown defensively.

CREATE OR REPLACE FUNCTION public.provider_update_booking_status(p_booking_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status  text;
  v_booking_date    date;
  v_booking_time    time;
  v_appt_start      timestamp;
  v_active_reschedule boolean;
BEGIN
  SELECT b.status, b.booking_date, b.booking_time
    INTO v_current_status, v_booking_date, v_booking_time
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
    ELSIF p_status IN ('no_show', 'completed') THEN
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
      IF v_appt_start >= NOW() THEN
        RAISE EXCEPTION 'Cannot mark no_show before the appointment start time';
      END IF;
    ELSE
      RAISE EXCEPTION 'Invalid status transition: % -> %', v_current_status, p_status;
    END IF;

  ELSE
    RAISE EXCEPTION 'Unrecognized current status: %', v_current_status;
  END IF;

  UPDATE public.bookings SET status = p_status WHERE id = p_booking_id;
END;
$$;

COMMENT ON FUNCTION public.provider_update_booking_status(uuid, text) IS
  'Single-row status transition (in_progress/no_show/completed), scoped only by provider ownership. Deliberately has NO group_booking_id guard — this is the RPC per-service group actions rely on (see fix_group_booking_per_service_actions.sql). Do not add a group_booking_id IS NULL check here; that would resurrect the all-or-nothing bug where a provider could not mark one service in a group no_show/complete without forcing the same status onto its siblings.';

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

COMMENT ON FUNCTION public.cancel_own_booking(uuid) IS
  'Single-row client cancel, scoped only by user_id = auth.uid(). Deliberately has NO group_booking_id guard — a client can and should be able to cancel just one of N services in a group booking without touching its siblings. See fix_group_booking_per_service_actions.sql.';

CREATE OR REPLACE FUNCTION public.provider_cancel_own_booking(p_booking_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT b.status INTO v_status
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
   WHERE b.id = p_booking_id
     AND p.user_id = auth.uid()
   FOR UPDATE OF b;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_status IN ('cancelled', 'completed', 'no_show') THEN
    RAISE EXCEPTION 'This booking can no longer be cancelled';
  END IF;

  UPDATE public.bookings SET status = 'cancelled' WHERE id = p_booking_id;
END;
$$;

COMMENT ON FUNCTION public.provider_cancel_own_booking(uuid) IS
  'Single-row provider cancel, scoped only by provider ownership via auth.uid(). Deliberately has NO group_booking_id guard — a provider can and should be able to cancel just one already-confirmed service in a group without forcing cancellation onto its siblings. The atomic bulk equivalent for an intentional whole-group cancel is provider_cancel_group_booking(), which stays a separate, explicit action. See fix_group_booking_per_service_actions.sql.';

COMMENT ON FUNCTION public.provider_update_group_booking_status(uuid, text) IS
  'Atomic bulk action: moves ALL of the calling provider''s sibling rows in a group at once. Intentionally used ONLY for pending->confirmed today (see fix_group_booking_atomic_actions.sql) — a client should never see a group half-confirmed. Do NOT route in_progress/no_show/completed through this RPC; those are per-service and belong on provider_update_booking_status() instead.';

COMMENT ON FUNCTION public.provider_cancel_group_booking(uuid) IS
  'Atomic bulk action: cancels ALL of the calling provider''s sibling rows in a group at once. Intentionally used ONLY for the pending-stage provider decline today (see fix_group_booking_atomic_actions.sql and ProviderInboxScreen.tsx''s handleDeclineBooking) plus any future explicit "cancel whole group" bulk action. Do NOT route a single already-confirmed service''s cancel through this RPC; that belongs on provider_cancel_own_booking() instead.';

REVOKE ALL ON FUNCTION public.provider_update_booking_status(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provider_update_booking_status(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.provider_update_booking_status(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.cancel_own_booking(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_own_booking(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_own_booking(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.provider_cancel_own_booking(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provider_cancel_own_booking(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.provider_cancel_own_booking(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.provider_update_group_booking_status(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provider_update_group_booking_status(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.provider_update_group_booking_status(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.provider_cancel_group_booking(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provider_cancel_group_booking(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.provider_cancel_group_booking(uuid) TO authenticated;
