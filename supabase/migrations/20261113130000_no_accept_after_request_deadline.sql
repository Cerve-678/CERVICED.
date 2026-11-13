-- A provider can't accept a request after its answer-by time.
--
-- process_expire_stale_pending_bookings() cancels and fully refunds a
-- pending request once now() >= booking_request_deadline(...), but it runs
-- every 5 minutes and provider_update_booking_status() /
-- provider_update_group_booking_status() never checked the deadline. A
-- provider accepting in that gap kept a booking (and the client's money) the
-- client had been told would be refunded if not answered in time.
--
-- Both now refuse pending -> confirmed once the deadline has passed, using the
-- same booking_request_deadline() the expiry job does, so the two can't
-- disagree. The UTC readings of the start time elsewhere in these functions
-- are left for 20261113140000 (UK time).
--
-- Redefined from live with md5 guards.

BEGIN;

DO $$
BEGIN
  IF md5(pg_get_functiondef('public.provider_update_booking_status(uuid,text)'::regprocedure)) <> '5d8dc58ae930d5c469ea03d246275d0c' THEN
    RAISE EXCEPTION 'provider_update_booking_status changed live since this migration was written; redo it from live';
  END IF;
  IF md5(pg_get_functiondef('public.provider_update_group_booking_status(uuid,text)'::regprocedure)) <> 'b6eba2550890c860088b9c01a07acd3c' THEN
    RAISE EXCEPTION 'provider_update_group_booking_status changed live since this migration was written; redo it from live';
  END IF;
  IF md5(pg_get_functiondef('public.booking_request_deadline(timestamptz,date,time)'::regprocedure)) <> '274f72fbbfc2dea734c9638e46d0d446' THEN
    RAISE EXCEPTION 'booking_request_deadline changed live since this migration was written; recheck';
  END IF;
END $$;

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
  v_created_at      timestamptz;
BEGIN
  SELECT b.status, b.booking_date, b.booking_time, b.provider_id, b.user_id, b.created_at
    INTO v_current_status, v_booking_date, v_booking_time, v_provider_id, v_client_user_id, v_created_at
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
    -- Past its answer-by time a request is already lost: the 5-minute expiry
    -- job (same deadline function) cancels and refunds it. Accepting in that
    -- gap kept the money for a booking the client had been told was ending
    -- (20261113130000).
    IF now() >= public.booking_request_deadline(v_created_at, v_booking_date, v_booking_time) THEN
      RAISE EXCEPTION 'This request has expired, so it can''t be accepted now. The client is refunded automatically.';
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

  -- The client_provider_reliability increment that used to live here is gone
  -- on purpose. It ran before the client had been told, on an accusation they
  -- had no way to answer. settle_no_show_reliability() applies it only once
  -- the dispute window has closed undisputed.
  IF p_status = 'no_show' THEN
    UPDATE public.bookings
       SET status = p_status,
           no_show_marked_at = NOW()
     WHERE id = p_booking_id;
  ELSE
    UPDATE public.bookings SET status = p_status WHERE id = p_booking_id;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.provider_update_group_booking_status(p_group_booking_id uuid, p_status text)
 RETURNS TABLE(booking_id uuid, new_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_provider_id UUID;
  r RECORD;
  v_appt_start TIMESTAMP;
BEGIN
  IF p_status = 'cancelled' THEN
    RAISE EXCEPTION 'Use provider_cancel_group_booking() to cancel a group booking';
  END IF;

  SELECT p.id INTO v_provider_id
    FROM public.providers p WHERE p.user_id = auth.uid();

  IF v_provider_id IS NULL THEN
    RAISE EXCEPTION 'No provider profile for caller';
  END IF;

  FOR r IN
    SELECT b.id, b.status, b.booking_date, b.booking_time, b.created_at
      FROM public.bookings b
     WHERE b.group_booking_id = p_group_booking_id
       AND b.provider_id = v_provider_id
     FOR UPDATE OF b
  LOOP
    IF r.status IN ('cancelled', 'completed', 'no_show') THEN
      RAISE EXCEPTION 'Booking % is already %, no further status changes allowed', r.id, r.status;
    END IF;

    v_appt_start := (r.booking_date + r.booking_time)::timestamp;

    IF r.status = 'pending' THEN
      IF p_status <> 'confirmed' THEN
        RAISE EXCEPTION 'Invalid status transition for booking %: % -> %', r.id, r.status, p_status;
      END IF;
      -- Same rule as provider_update_booking_status() (20261113130000).
      IF now() >= public.booking_request_deadline(r.created_at, r.booking_date, r.booking_time) THEN
        RAISE EXCEPTION 'This request has expired, so it can''t be accepted now. The client is refunded automatically.';
      END IF;

    ELSIF r.status = 'confirmed' THEN
      IF p_status = 'in_progress' THEN
        NULL;
      ELSIF p_status IN ('no_show', 'completed') THEN
        IF v_appt_start >= NOW() THEN
          RAISE EXCEPTION 'Cannot mark % before the appointment start time (booking %)', p_status, r.id;
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition for booking %: % -> %', r.id, r.status, p_status;
      END IF;

    ELSIF r.status = 'in_progress' THEN
      IF p_status = 'completed' THEN
        NULL;
      ELSIF p_status = 'no_show' THEN
        IF v_appt_start >= NOW() THEN
          RAISE EXCEPTION 'Cannot mark no_show before the appointment start time (booking %)', r.id;
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition for booking %: % -> %', r.id, r.status, p_status;
      END IF;

    ELSE
      RAISE EXCEPTION 'Unrecognized current status for booking %: %', r.id, r.status;
    END IF;
  END LOOP;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No bookings found in this group for the calling provider';
  END IF;

  RETURN QUERY
    UPDATE public.bookings b
       SET status = p_status
     WHERE b.group_booking_id = p_group_booking_id
       AND b.provider_id = v_provider_id
    RETURNING b.id, b.status;
END;
$function$
;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261113130000', 'no_accept_after_request_deadline')
ON CONFLICT (version) DO NOTHING;

COMMIT;
