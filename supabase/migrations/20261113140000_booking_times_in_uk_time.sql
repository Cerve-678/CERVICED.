-- Booking start and end times are UK wall-clock times; read them as UK time.
--
-- booking_date + booking_time (and end_time) are what the client picked, in
-- UK local time. cancel_own_booking(), provider_update_booking_status(),
-- provider_update_group_booking_status() and process_auto_complete_bookings()
-- cast them to a bare timestamp and compared with now(), i.e. read them as
-- UTC, and used CURRENT_DATE (the UTC date). From the last Sunday of March to
-- the last Sunday of October that put every check an hour late:
--   * a client's late-cancel window closed an hour late (reliability count);
--   * a provider could mark completed / no-show only an hour after the start,
--     and the no-show "same day" ran 1am to 1am;
--   * bookings auto-completed (and their payouts began) an hour late.
-- apply-cancellation-refund already used London time, so the money and the
-- reliability count disagreed in summer.
--
-- No effect today (13 Nov is GMT, UTC+0): it changes behaviour from
-- 29 March 2027. Other functions with the same pattern (reminders, the
-- bookability trigger's "already passed today", busy spans and more) are
-- listed for a follow-up and not changed here.
--
-- Redefined from live (after 20261113120000 / 20261113130000) with md5 guards.

BEGIN;

DO $$
BEGIN
  IF md5(pg_get_functiondef('public.cancel_own_booking(uuid)'::regprocedure)) <> 'e73c89a5c5448d1529c1ce8d88284fd3' THEN
    RAISE EXCEPTION 'cancel_own_booking changed live since this migration was written; redo it from live';
  END IF;
  IF md5(pg_get_functiondef('public.provider_update_booking_status(uuid,text)'::regprocedure)) <> '11f092438037eb206a2b92781d6a73e2' THEN
    RAISE EXCEPTION 'provider_update_booking_status changed live since this migration was written; redo it from live';
  END IF;
  IF md5(pg_get_functiondef('public.provider_update_group_booking_status(uuid,text)'::regprocedure)) <> '70ace8e7818c706f4b312b5bb0b0e805' THEN
    RAISE EXCEPTION 'provider_update_group_booking_status changed live since this migration was written; redo it from live';
  END IF;
  IF md5(pg_get_functiondef('public.process_auto_complete_bookings()'::regprocedure)) <> '849e58dedd35a53347ffa4f347840658' THEN
    RAISE EXCEPTION 'process_auto_complete_bookings changed live since this migration was written; redo it from live';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_own_booking(p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking        RECORD;
  v_notice_hrs     INT;
  v_policies       JSONB;
  v_hours_until    NUMERIC;
  v_late_threshold INT;
BEGIN
  SELECT b.status, b.booking_date, b.booking_time, b.provider_id, b.user_id,
         b.late_reschedule_from, b.cancel_notice_hours
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

  SELECT cancellation_notice_hours, booking_policies
    INTO v_notice_hrs, v_policies
    FROM public.providers WHERE id = v_booking.provider_id;

  -- The window this booking was made under; rows from before it was stored
  -- fall back to the provider's current one.
  v_notice_hrs := COALESCE(v_booking.cancel_notice_hours, public.cancel_notice_hours(v_notice_hrs, v_policies));

  -- booking_date + booking_time is UK wall-clock time (20261113140000); read
  -- as UTC it was an hour late all summer, an extra hour of free notice.
  v_hours_until := EXTRACT(EPOCH FROM (
    ((v_booking.booking_date + v_booking.booking_time) AT TIME ZONE 'Europe/London') - NOW()
  )) / 3600;

  v_late_threshold := CASE WHEN COALESCE(v_notice_hrs, 0) > 0 THEN v_notice_hrs ELSE 24 END;

  -- A booking the client moved while already inside the window counts as a
  -- late cancel whenever it's cancelled, as if cancelled on the original date.
  -- Cancelling after the start is late too (it used to count as on time);
  -- same rule as isLateClientCancel in apply-cancellation-refund (20261113120000).
  IF v_booking.status = 'confirmed'
     AND (v_hours_until < v_late_threshold
          OR (v_booking.late_reschedule_from IS NOT NULL AND COALESCE(v_notice_hrs, 0) > 0)) THEN
    INSERT INTO public.client_provider_reliability (provider_id, client_user_id, late_cancel_count, updated_at)
    VALUES (v_booking.provider_id, v_booking.user_id, 1, NOW())
    ON CONFLICT (provider_id, client_user_id)
    DO UPDATE SET late_cancel_count = client_provider_reliability.late_cancel_count + 1,
                  updated_at = NOW();
  END IF;

  UPDATE public.bookings SET status = 'cancelled' WHERE id = p_booking_id;
END;
$function$
;

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
  v_appt_start      timestamptz;
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

  -- UK wall-clock time (20261113140000): read as UTC, no-show and completed
  -- were allowed an hour late in summer, and the no-show day rolled over at
  -- 1am instead of midnight.
  v_appt_start := (v_booking_date + v_booking_time) AT TIME ZONE 'Europe/London';

  SELECT COALESCE((booking_policies->>'noShowGraceMinutes')::integer, 0)
    INTO v_grace_minutes
    FROM public.providers
   WHERE id = v_provider_id;
  v_grace_minutes := GREATEST(COALESCE(v_grace_minutes, 0), 0);

  IF p_status = 'no_show' THEN
    IF v_booking_date <> (now() AT TIME ZONE 'Europe/London')::date THEN
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
  v_appt_start TIMESTAMPTZ;
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

    -- UK wall-clock time (20261113140000).
    v_appt_start := (r.booking_date + r.booking_time) AT TIME ZONE 'Europe/London';

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

CREATE OR REPLACE FUNCTION public.process_auto_complete_bookings()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.bookings b
     SET status = 'completed'
   WHERE b.status IN ('confirmed', 'in_progress')
     AND (
       -- UK wall-clock times (20261113140000): read as UTC, bookings were
       -- completed (and their payouts started) an hour late all summer.
       (b.end_time IS NOT NULL AND ((b.booking_date + b.end_time) AT TIME ZONE 'Europe/London') < NOW())
       OR
       (b.end_time IS NULL     AND ((b.booking_date + b.booking_time + INTERVAL '1 hour') AT TIME ZONE 'Europe/London') < NOW())
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.booking_reschedule_requests rr
        WHERE rr.booking_id = b.id
          AND rr.status IN ('pending', 'provider_responded')
     );
END;
$function$
;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261113140000', 'booking_times_in_uk_time')
ON CONFLICT (version) DO NOTHING;

COMMIT;
