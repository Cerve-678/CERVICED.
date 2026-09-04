-- Removes the silent 24h-notice / max-1-reschedule defaults that applied
-- whenever a provider had never set rescheduleNotice/maxReschedules at all.
-- Unset now means unrestricted, matching cancel_notice_hours()'s existing
-- unset -> 0 behavior for cancellations (that function was already correct;
-- only this one silently invented a policy the provider never chose).
-- Reproduced in full from the live definition (fetched via execute_sql
-- 2026-09-03) -- only the two blocks marked CHANGED differ; everything
-- else, including SET search_path, is verbatim.
CREATE OR REPLACE FUNCTION public.request_reschedule_own_booking(p_booking_id uuid, p_preferred_dates text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_duration INTERVAL;
  v_i INT;
BEGIN
  SELECT b.status, b.booking_date, b.booking_time, b.end_time, b.provider_id,
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

  -- CHANGED: unset (NULL or '') now means unrestricted, same as an explicit
  -- 'unlimited' -- previously COALESCE(..., 1) silently capped a provider
  -- who had never opened Policies at exactly one reschedule.
  v_max_raw := v_policies->>'maxReschedules';
  IF v_max_raw IS NOT NULL AND v_max_raw <> '' AND v_max_raw IS DISTINCT FROM 'unlimited' THEN
    v_max := v_max_raw::INT;
    IF v_booking.reschedule_count >= v_max THEN
      RAISE EXCEPTION 'This provider allows a maximum of % reschedule(s) per booking', v_max;
    END IF;
  END IF;

  -- CHANGED: unset now falls to 0 (no notice required) instead of silently
  -- imposing 24h -- matches cancel_notice_hours()'s existing unset -> 0
  -- behavior. An explicit '24h' choice still means 24h (added as its own
  -- WHEN so it no longer shares the ELSE branch with "never answered").
  v_notice_raw := v_policies->>'rescheduleNotice';
  v_notice_hrs := CASE v_notice_raw
    WHEN 'same_day' THEN 0
    WHEN '24h' THEN 24
    WHEN '48h' THEN 48
    WHEN '72h' THEN 72
    ELSE 0
  END;

  IF v_notice_hrs > 0 THEN
    v_hours_until := EXTRACT(EPOCH FROM (
      (v_booking.booking_date + v_booking.booking_time)::timestamp - NOW()
    )) / 3600;
    IF v_hours_until < v_notice_hrs THEN
      RAISE EXCEPTION 'This provider requires % hours notice to reschedule', v_notice_hrs;
    END IF;
  END IF;

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

  -- Any hold left by a previous, already-closed request on this booking.
  PERFORM public.release_reschedule_holds(p_booking_id);

  v_duration := COALESCE(v_booking.end_time, v_booking.booking_time + INTERVAL '1 hour')
                - v_booking.booking_time;

  FOR v_i IN 1 .. COALESCE(array_length(v_dates, 1), 0) LOOP
    IF v_times[v_i] IS NOT NULL THEN
      BEGIN
        PERFORM public.place_reschedule_hold(
          p_booking_id,
          v_dates[v_i],
          v_times[v_i]::TIME,
          (v_times[v_i]::TIME + v_duration)::TIME
        );
      EXCEPTION WHEN exclusion_violation OR check_violation THEN
        RAISE EXCEPTION 'That time has just been taken. Please pick another slot.'
          USING ERRCODE = 'P0001';
      END;
    END IF;
  END LOOP;
END;
$function$;
