-- Bookings keep the cancellation window they were made under.
--
-- Frontier when written (2026-11-03): live max 20261102210000; claimed by open
-- work: 20261103000000 (#268) and 20261103010000-030000 (session cerviced-bf).
-- Check MIGRATION_OWNER.md and re-check max(version) and open branches before
-- applying.
--
-- Until now every check read the provider's CURRENT window
-- (providers.cancellation_notice_hours, else booking_policies.cancelNotice), so
-- a provider changing it moved the goalposts on bookings already made.
-- Decided with the user 2026-11-03: a change applies to new bookings only.
--
-- What this adds:
--   - bookings.cancel_notice_hours: the window in force when the booking was
--     made, set by a BEFORE INSERT trigger from the provider row (whatever the
--     app sends is overwritten) and never changed after; a reschedule keeps it.
--   - Existing bookings are filled with the window in force now, so nobody's
--     booking changes when this runs. Bookings triggers are skipped for that
--     fill (session_replication_role), so it sends nothing and moves nothing.
--
-- Redefines, each from the latest repo definition (body md5 guarded, so a
-- function changed live since stops this file instead of being reverted). The
-- only change in each is to prefer the booking's own window:
--   - cancel_own_booking
--   - request_reschedule_own_booking
--   - process_cancel_window_closing_warnings
--   - process_expire_stale_reschedule_requests
--
-- apply-cancellation-refund selects the new column and must be deployed AFTER
-- this is applied (selecting it first makes every client cancellation fail to
-- settle). The app reads it too: apply this before the app change ships.

BEGIN;

DO $guard$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(prosrc) INTO v_md5 FROM pg_proc WHERE oid = 'public.cancel_own_booking(uuid)'::regprocedure;
  IF v_md5 IS DISTINCT FROM '35272ab80f84e1de55d286095aab3211' THEN
    RAISE EXCEPTION 'cancel_own_booking changed since this file was written (body md5 %). Re-diff before applying.', v_md5;
  END IF;
  SELECT md5(prosrc) INTO v_md5 FROM pg_proc WHERE oid = 'public.request_reschedule_own_booking(uuid,text[])'::regprocedure;
  IF v_md5 IS DISTINCT FROM 'a6f279f59b40c358eb620735d9247611' THEN
    RAISE EXCEPTION 'request_reschedule_own_booking changed since this file was written (body md5 %). Re-diff before applying.', v_md5;
  END IF;
  SELECT md5(prosrc) INTO v_md5 FROM pg_proc WHERE oid = 'public.process_cancel_window_closing_warnings()'::regprocedure;
  IF v_md5 IS DISTINCT FROM 'e9e4fc76203e92cb207c4714c4abe04a' THEN
    RAISE EXCEPTION 'process_cancel_window_closing_warnings changed since this file was written (body md5 %). Re-diff before applying.', v_md5;
  END IF;
  SELECT md5(prosrc) INTO v_md5 FROM pg_proc WHERE oid = 'public.process_expire_stale_reschedule_requests()'::regprocedure;
  IF v_md5 IS DISTINCT FROM '30a187c7039e70bb628077d6ec1dfdeb' THEN
    RAISE EXCEPTION 'process_expire_stale_reschedule_requests changed since this file was written (body md5 %). Re-diff before applying.', v_md5;
  END IF;
END
$guard$;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS cancel_notice_hours integer;

COMMENT ON COLUMN public.bookings.cancel_notice_hours IS
  'Cancellation window (hours) in force when the booking was made: cancel_notice_hours() of the provider at insert. Set by trigger, never changed after. NULL only on rows the backfill could not match to a provider; readers fall back to the provider''s current window.';

SET LOCAL session_replication_role = replica;
UPDATE public.bookings b
   SET cancel_notice_hours = public.cancel_notice_hours(p.cancellation_notice_hours, p.booking_policies)
  FROM public.providers p
 WHERE p.id = b.provider_id
   AND b.cancel_notice_hours IS NULL;
SET LOCAL session_replication_role = origin;

CREATE OR REPLACE FUNCTION public.freeze_booking_cancel_notice_hours()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT public.cancel_notice_hours(p.cancellation_notice_hours, p.booking_policies)
      INTO NEW.cancel_notice_hours
      FROM public.providers p
     WHERE p.id = NEW.provider_id;
  ELSE
    NEW.cancel_notice_hours := OLD.cancel_notice_hours;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.freeze_booking_cancel_notice_hours() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS freeze_cancel_notice_hours_on_insert ON public.bookings;
CREATE TRIGGER freeze_cancel_notice_hours_on_insert
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.freeze_booking_cancel_notice_hours();

DROP TRIGGER IF EXISTS keep_cancel_notice_hours_on_update ON public.bookings;
CREATE TRIGGER keep_cancel_notice_hours_on_update
  BEFORE UPDATE OF cancel_notice_hours ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.freeze_booking_cancel_notice_hours();

GRANT SELECT (cancel_notice_hours) ON public.bookings TO authenticated;

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

  v_hours_until := EXTRACT(EPOCH FROM (
    (v_booking.booking_date + v_booking.booking_time)::timestamp - NOW()
  )) / 3600;

  v_late_threshold := CASE WHEN COALESCE(v_notice_hrs, 0) > 0 THEN v_notice_hrs ELSE 24 END;

  -- A booking the client moved while already inside the window counts as a
  -- late cancel whenever it's cancelled, as if cancelled on the original date.
  IF v_booking.status = 'confirmed'
     AND ((v_hours_until >= 0 AND v_hours_until < v_late_threshold)
          OR (v_booking.late_reschedule_from IS NOT NULL AND COALESCE(v_notice_hrs, 0) > 0)) THEN
    INSERT INTO public.client_provider_reliability (provider_id, client_user_id, late_cancel_count, updated_at)
    VALUES (v_booking.provider_id, v_booking.user_id, 1, NOW())
    ON CONFLICT (provider_id, client_user_id)
    DO UPDATE SET late_cancel_count = client_provider_reliability.late_cancel_count + 1,
                  updated_at = NOW();
  END IF;

  UPDATE public.bookings SET status = 'cancelled' WHERE id = p_booking_id;
END;
$function$;

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
  v_cancel_hrs INT;
  v_cancel_hours_until NUMERIC;
  v_inside_cancel_window BOOLEAN := false;
BEGIN
  SELECT b.status, b.booking_date, b.booking_time, b.end_time, b.provider_id,
         b.reschedule_count, b.last_rescheduled_at, b.created_at, b.cancel_notice_hours
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
  -- behavior. An explicit '24h' choice keeps its own WHEN branch.
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

  -- Asking while already too late to cancel for free keeps the late-cancel
  -- rule on this booking once the move is confirmed (decided 2026-10-25).
  -- Only bookings made since the rule started (decided 2026-10-31).
  -- Booking dates/times are UK wall-clock.
  SELECT COALESCE(v_booking.cancel_notice_hours, public.cancel_notice_hours(p.cancellation_notice_hours, p.booking_policies))
    INTO v_cancel_hrs
    FROM public.providers p WHERE p.id = v_booking.provider_id;
  IF COALESCE(v_cancel_hrs, 0) > 0
     AND v_booking.created_at >= public.late_reschedule_rule_starts_at() THEN
    v_cancel_hours_until := EXTRACT(EPOCH FROM (
      ((v_booking.booking_date + v_booking.booking_time)::timestamp AT TIME ZONE 'Europe/London') - NOW()
    )) / 3600;
    v_inside_cancel_window := v_cancel_hours_until < v_cancel_hrs;
  END IF;

  FOREACH v_raw IN ARRAY p_preferred_dates LOOP
    v_dates := v_dates || (split_part(v_raw, ' ', 1))::DATE;
    v_times := v_times || NULLIF(split_part(v_raw, ' ', 2), '');
  END LOOP;

  INSERT INTO public.booking_reschedule_requests
    (booking_id, requested_by, original_date, original_time, requested_dates,
     requested_times, provider_available_slots, status, reschedule_count, updated_at,
     requested_inside_cancel_window)
  VALUES
    (p_booking_id, 'user', v_booking.booking_date, v_booking.booking_time,
     v_dates, v_times, NULL, 'pending', 0, NOW(),
     v_inside_cancel_window)
  ON CONFLICT (booking_id) DO UPDATE
    SET requested_by = 'user',
        requested_dates = v_dates,
        requested_times = v_times,
        provider_available_slots = NULL,
        status = 'pending',
        updated_at = NOW(),
        requested_inside_cancel_window = v_inside_cancel_window;

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

CREATE OR REPLACE FUNCTION public.process_cancel_window_closing_warnings()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT rr.id                                          AS request_id,
           rr.booking_id,
           b.user_id                                      AS client_user_id,
           b.provider_id,
           NULLIF(btrim(b.service_name_snapshot), '')     AS service_name_snapshot,
           NULLIF(btrim(b.provider_name_snapshot), '')    AS provider_name_snapshot,
           ((b.booking_date + b.booking_time)::TIMESTAMP
             - (COALESCE(b.cancel_notice_hours, public.cancel_notice_hours(p.cancellation_notice_hours, p.booking_policies)) || ' hours')::INTERVAL
           )                                               AS cancel_cutoff
      FROM public.booking_reschedule_requests rr
      JOIN public.bookings  b ON b.id = rr.booking_id
      JOIN public.providers p ON p.id = b.provider_id
     WHERE rr.status = 'pending'
       AND b.status IN ('pending', 'confirmed')
       -- Already moved inside its window once: there's no free-cancel time
       -- left to warn about.
       AND b.late_reschedule_from IS NULL
       AND COALESCE(b.cancel_notice_hours, public.cancel_notice_hours(p.cancellation_notice_hours, p.booking_policies)) > 0
       AND NOW() >= ((b.booking_date + b.booking_time)::TIMESTAMP
             - (COALESCE(b.cancel_notice_hours, public.cancel_notice_hours(p.cancellation_notice_hours, p.booking_policies)) || ' hours')::INTERVAL) - INTERVAL '6 hours'
       AND NOW() < ((b.booking_date + b.booking_time)::TIMESTAMP
             - (COALESCE(b.cancel_notice_hours, public.cancel_notice_hours(p.cancellation_notice_hours, p.booking_policies)) || ' hours')::INTERVAL)
       AND NOT EXISTS (
         SELECT 1 FROM public.notifications n
          WHERE n.booking_id = rr.booking_id
            AND n.type = 'cancel_window_closing'
            AND n.created_at > rr.updated_at
       )
     FOR UPDATE OF rr
  LOOP
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable,
       booking_id, provider_id, recipient_role)
    VALUES (
      r.client_user_id, 'cancel_window_closing', 'Still Waiting on Your Provider',
      COALESCE(r.provider_name_snapshot, 'Your provider') ||
        ' hasn''t answered your reschedule request for ' ||
        COALESCE(r.service_name_snapshot, 'your appointment') ||
        '. If you''d rather cancel, you need to do that by ' ||
        to_char(r.cancel_cutoff, 'FMHH12:MI') ||
        lower(to_char(r.cancel_cutoff, 'am')) || ' on ' ||
        to_char(r.cancel_cutoff, 'FMDD Mon') ||
        ' — after that their cancellation notice period has passed.',
      'high', TRUE, r.booking_id, r.provider_id, 'client'
    );
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_expire_stale_reschedule_requests()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT rr.id            AS request_id,
           rr.status        AS request_status,
           rr.booking_id,
           b.user_id        AS client_user_id,
           b.booking_date,
           NULLIF(btrim(b.customer_name), '')            AS customer_name,
           NULLIF(btrim(b.service_name_snapshot), '')    AS service_name_snapshot,
           b.provider_id,
           NULLIF(btrim(b.provider_name_snapshot), '')   AS provider_name_snapshot,
           p.user_id        AS provider_user_id
      FROM public.booking_reschedule_requests rr
      JOIN public.bookings  b ON b.id = rr.booking_id
      JOIN public.providers p ON p.id = b.provider_id
     WHERE rr.status IN ('pending', 'provider_responded')
       AND NOW() >= LEAST(
             -- Never later than the appointment itself.
             b.booking_date::TIMESTAMP + b.booking_time,
             LEAST(
               -- The provider's own reschedule-notice policy, floored at
               -- 24h. Mapping kept identical to
               -- request_reschedule_own_booking().
               rr.updated_at + (GREATEST(
                 CASE p.booking_policies->>'rescheduleNotice'
                   WHEN 'same_day' THEN 0
                   WHEN '48h'      THEN 48
                   WHEN '72h'      THEN 72
                   ELSE 24
                 END, 24) || ' hours')::INTERVAL,
               -- Answer before the appointment DAY starts, so the client
               -- knows the night before -- but never less than 4 hours from
               -- the ask, or a same-day request would be dead on arrival.
               GREATEST(
                 b.booking_date::TIMESTAMP,
                 rr.updated_at + INTERVAL '4 hours'
               )
             ),
             -- NEW: never later than 6 hours before the CLIENT's own
             -- cancel_notice_hours() deadline on this same booking would
             -- close. The reschedule-notice bound above is a SEPARATE
             -- provider policy from cancelNotice and can easily outlast it
             -- (rescheduleNotice is floored at 24h; cancelNotice can be as
             -- short as the provider likes) -- without this bound a
             -- provider's silence can carry the client straight through
             -- their own cancellation deadline while the request is still
             -- 'pending', at which point cancel_own_booking() starts
             -- rejecting them and request_reschedule_own_booking() is still
             -- refusing a second request on the same booking. See this
             -- file's header for the confirmed live scenario.
             --
             -- Floored at the same 4-hour "real chance to answer" minimum as
             -- the bound above, for the same reason: a request made five
             -- minutes before the client's own cancel window shuts should
             -- not expire on the very next cron tick with no chance for the
             -- provider to have answered it.
             --
             -- Does NOT grant a no-penalty cancellation and does not change
             -- cancel_own_booking()'s own notice check below -- see header.
             CASE
               WHEN COALESCE(b.cancel_notice_hours, public.cancel_notice_hours(p.cancellation_notice_hours, p.booking_policies)) > 0
                 THEN GREATEST(
                        (b.booking_date::TIMESTAMP + b.booking_time)
                          - (COALESCE(b.cancel_notice_hours, public.cancel_notice_hours(p.cancellation_notice_hours, p.booking_policies)) || ' hours')::INTERVAL
                          - INTERVAL '6 hours',
                        rr.updated_at + INTERVAL '4 hours'
                      )
               ELSE 'infinity'::TIMESTAMP
             END
           )
     FOR UPDATE OF rr
  LOOP
    UPDATE public.booking_reschedule_requests
       SET status = 'expired', updated_at = NOW()
     WHERE id = r.request_id;

    IF r.request_status = 'pending' THEN
      -- Waiting on the PROVIDER, who never offered dates. The client's request
      -- is dead and they had no part in that, so they are the one told. The
      -- provider caused it by inaction and has already had up to N nudges from
      -- process_provider_stale_reschedule_reminders() — another message here
      -- would be a fourth nag, not news.
      --
      -- Copy asserts only what is certainly true. It deliberately does NOT
      -- offer "ask again or cancel": by this point the provider's own notice
      -- window may have lapsed, which is exactly what would make both of those
      -- fail. Promising an action the next tap rejects is worse than silence.
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable,
         booking_id, provider_id, recipient_role)
      VALUES (
        r.client_user_id, 'reschedule_expired', 'Reschedule Request Expired',
        COALESCE(r.provider_name_snapshot, 'Your provider') ||
          ' didn''t confirm new dates for ' ||
          COALESCE(r.service_name_snapshot, 'your appointment') ||
          ', so your booking on ' || to_char(r.booking_date, 'DD Mon YYYY') ||
          ' stays as originally scheduled.',
        'high', TRUE, r.booking_id, r.provider_id, 'client'
      );
    ELSE
      -- Waiting on the CLIENT, who never picked one of the offered times.
      -- Both sides are told here, unlike the branch above: the provider's held
      -- offer is dead (their state changed through no act of their own), and
      -- the client's app is still showing those offered dates as live, so
      -- leaving them to tap a slot that no longer exists is the worse failure.
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable,
         booking_id, provider_id, recipient_role)
      VALUES (
        r.provider_user_id, 'reschedule_expired', 'Reschedule Offer Expired',
        COALESCE(r.customer_name, 'A client') ||
          ' didn''t pick one of the times you offered for ' ||
          COALESCE(r.service_name_snapshot, 'their appointment') ||
          ', so the booking on ' || to_char(r.booking_date, 'DD Mon YYYY') ||
          ' stays as originally scheduled.',
        'medium', TRUE, r.booking_id, r.provider_id, 'provider'
      );

      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable,
         booking_id, provider_id, recipient_role)
      VALUES (
        r.client_user_id, 'reschedule_expired', 'Reschedule Offer Expired',
        'The times ' || COALESCE(r.provider_name_snapshot, 'your provider') ||
          ' offered for ' || COALESCE(r.service_name_snapshot, 'your appointment') ||
          ' have expired, so your booking on ' ||
          to_char(r.booking_date, 'DD Mon YYYY') ||
          ' stays as originally scheduled.',
        'high', TRUE, r.booking_id, r.provider_id, 'client'
      );
    END IF;
  END LOOP;
END;
$function$;

COMMIT;
