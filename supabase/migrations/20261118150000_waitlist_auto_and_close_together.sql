-- Waitlist: Auto is the automatic hold, and closing when full works with it.
--
-- Decided by the owner on 2026-11-18:
--   * "Enable waitlist" is the manual waitlist. Clients join; when a booking is
--     cancelled or a request declined, the provider is told and offers the
--     time from Bookings (waitlist_released_slots, reason 'cancelled').
--   * "Auto" (automation_settings.autoAcceptWaitlist) holds a freed slot for
--     the next person in line, and rolls it on if they miss it or pass.
--     Before this, the first hold was automatic whatever Auto said.
--   * A waitlist hold lasts 10 minutes, not 15.
--   * "Close my schedule when fully booked" no longer needs the waitlist off.
--     With both on, a slot freed while closed goes to the waitlist only. A
--     closure for any other reason (holiday, time off, training, none given)
--     still keeps everyone out, waitlist included.
--
-- Every function below is rebuilt from live, and the guard refuses to apply
-- over one that changed after this was written.

DO $guard$
DECLARE
  r record;
  v_md5 text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('waitlist_hold_duration', '87e62ed19d03bf5d0ebdceaf87bf7296'),
    ('invite_next_waitlist_entry', '6deb7d38bf13c0f5011c31fd29930b1f'),
    ('end_waitlist_hold', '5d83720634e05ad35437a41651f06157'),
    ('handle_booking_status_change', 'ba8db17717dbd9beb4699502c07ff4e8'),
    ('enforce_booking_bookability', '6373a542662004ff35d59a02c601df78'),
    ('process_provider_fully_booked_alerts', '4e506a3eff05c65f38de4596408f8519')
  ) AS t(fn, expected)
  LOOP
    SELECT md5(pg_get_functiondef(p.oid)) INTO v_md5
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = r.fn;
    IF v_md5 IS DISTINCT FROM r.expected THEN
      RAISE EXCEPTION '% changed since this migration was written (md5 %); rebuild from live', r.fn, v_md5;
    END IF;
  END LOOP;
END
$guard$;

-- A freed slot can be recorded because a booking was cancelled, not only
-- because a waitlist hold ended.
ALTER TABLE public.waitlist_released_slots
  DROP CONSTRAINT waitlist_released_slots_reason_check;
ALTER TABLE public.waitlist_released_slots
  ADD CONSTRAINT waitlist_released_slots_reason_check
  CHECK (reason = ANY (ARRAY['missed'::text, 'passed'::text, 'cancelled'::text]));

CREATE OR REPLACE FUNCTION public.waitlist_hold_duration()
 RETURNS interval
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$ SELECT INTERVAL '10 minutes' $function$;

-- Closed in a way that keeps the waitlist out too: any closure except one
-- made because the schedule is full. One closure row per provider.
CREATE OR REPLACE FUNCTION public.provider_schedule_closed_to_waitlist(p_provider_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.provider_schedule_is_closed(p_provider_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.provider_schedule_closures c
        WHERE c.provider_id = p_provider_id AND c.reason = 'fully_booked'
     );
$function$;

REVOKE ALL ON FUNCTION public.provider_schedule_closed_to_waitlist(uuid) FROM PUBLIC, anon, authenticated;

-- A booking was cancelled or a request declined, freeing its time. With Auto
-- on, the next person in line gets it held. With Auto off, the provider is
-- told and offers it from Bookings. Never fails the cancellation it runs in.
CREATE OR REPLACE FUNCTION public.waitlist_slot_freed(
  p_provider_id uuid,
  p_service_id uuid,
  p_booking_date date,
  p_booking_time time without time zone,
  p_end_time time without time zone,
  p_freed_by text
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_enabled BOOLEAN;
  v_auto BOOLEAN;
  v_provider_user_id UUID;
  v_service_name TEXT;
  v_closed BOOLEAN;
BEGIN
  IF p_provider_id IS NULL OR p_service_id IS NULL OR p_booking_date IS NULL OR p_booking_time IS NULL THEN
    RETURN;
  END IF;
  IF (p_booking_date + p_booking_time) <= (now() AT TIME ZONE 'Europe/London') THEN
    RETURN;  -- already started: nobody can take it
  END IF;

  SELECT COALESCE((automation_settings->>'waitlistEnabled')::boolean, TRUE),
         COALESCE((automation_settings->>'autoAcceptWaitlist')::boolean, FALSE),
         user_id
    INTO v_enabled, v_auto, v_provider_user_id
    FROM public.providers WHERE id = p_provider_id;
  IF NOT FOUND OR NOT COALESCE(v_enabled, TRUE) THEN
    RETURN;
  END IF;
  IF public.provider_schedule_closed_to_waitlist(p_provider_id) THEN
    RETURN;
  END IF;

  IF v_auto THEN
    PERFORM public.invite_next_waitlist_entry(
      p_provider_id, p_service_id, p_booking_date, p_booking_time, p_end_time);
    RETURN;
  END IF;

  -- Auto off: only worth telling the provider if someone could take it.
  IF NOT EXISTS (
    SELECT 1 FROM public.provider_waitlist o
     WHERE o.provider_id = p_provider_id
       AND o.status = 'waiting'
       AND (o.service_id = p_service_id OR o.service_id IS NULL)
       AND (o.preferred_dates IS NULL
            OR (p_booking_date >= o.preferred_dates[1]
                AND p_booking_date <= COALESCE(o.preferred_dates[2], 'infinity'::date)))
  ) THEN
    RETURN;
  END IF;

  SELECT name INTO v_service_name FROM public.services WHERE id = p_service_id;
  v_closed := public.provider_schedule_is_closed(p_provider_id);

  INSERT INTO public.waitlist_released_slots
    (provider_id, service_id, service_name_snapshot, booking_date, booking_time, end_time, released_by_name, reason)
  VALUES
    (p_provider_id, p_service_id, COALESCE(v_service_name, 'A service'), p_booking_date, p_booking_time, p_end_time,
     NULLIF(btrim(p_freed_by), ''), 'cancelled');

  IF v_provider_user_id IS NOT NULL THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, provider_id, recipient_role)
    VALUES (
      v_provider_user_id, 'waitlist_slot_available', 'A space opened up',
      COALESCE(v_service_name, 'A service') || ' on ' || TO_CHAR(p_booking_date, 'FMDD Mon') || ' at ' ||
        public.format_notification_time(p_booking_time) || ' is free.' ||
        CASE WHEN v_closed THEN ' Your schedule is closed, so only your waitlist can have it.' ELSE '' END ||
        ' You can offer it to someone on your waitlist from Bookings.',
      'medium', TRUE, p_provider_id, 'provider'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'waitlist_slot_freed: provider % slot % %: % (%)',
    p_provider_id, p_booking_date, p_booking_time, SQLERRM, SQLSTATE;
END;
$function$;

REVOKE ALL ON FUNCTION public.waitlist_slot_freed(uuid, uuid, date, time without time zone, time without time zone, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.invite_next_waitlist_entry(p_provider_id uuid, p_service_id uuid, p_booking_date date DEFAULT NULL::date, p_booking_time time without time zone DEFAULT NULL::time without time zone, p_end_time time without time zone DEFAULT NULL::time without time zone, p_base_price numeric DEFAULT NULL::numeric, p_add_ons_total numeric DEFAULT NULL::numeric, p_service_charge numeric DEFAULT NULL::numeric, p_service_category_snapshot text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  w RECORD;
  v_waitlist_enabled BOOLEAN;
BEGIN
  -- p_base_price, p_add_ons_total, p_service_charge and
  -- p_service_category_snapshot are unused since 20261113210000: the hold is
  -- priced at checkout. Kept so callers don't change.
  SELECT COALESCE((automation_settings->>'waitlistEnabled')::boolean, TRUE)
    INTO v_waitlist_enabled
    FROM public.providers WHERE id = p_provider_id;

  IF NOT COALESCE(v_waitlist_enabled, TRUE) THEN
    RETURN FALSE;
  END IF;
  IF p_booking_date IS NULL OR p_booking_time IS NULL OR p_service_id IS NULL THEN
    RETURN FALSE;
  END IF;
  -- Checked here as well as in the booking gate: the gate lets the provider's
  -- own inserts through, and this can run as the provider when they cancel.
  -- A schedule closed because it's full still gives a freed slot to the
  -- waitlist (20261118150000); any other closure doesn't.
  IF public.provider_schedule_closed_to_waitlist(p_provider_id) THEN
    RETURN FALSE;
  END IF;

  -- Queue order. "Anytime" and a date range are equal; the dates only decide
  -- whether someone matches (decided 2026-11-10).
  FOR w IN
    SELECT id
      FROM public.provider_waitlist
     WHERE provider_id = p_provider_id
       AND status = 'waiting'
       AND (service_id = p_service_id OR service_id IS NULL)
       AND (
         preferred_dates IS NULL
         OR (p_booking_date >= preferred_dates[1]
             AND p_booking_date <= COALESCE(preferred_dates[2], 'infinity'::date))
       )
     ORDER BY (service_id IS NOT NULL AND service_id = p_service_id) DESC,
              position ASC,
              created_at ASC
  LOOP
    BEGIN
      PERFORM public.offer_waitlist_slot(w.id, p_service_id, p_booking_date, p_booking_time, p_end_time);
      RETURN TRUE;
    EXCEPTION WHEN OTHERS THEN
      -- This candidate can't take it (a rule, or a clash); try the next. Logged
      -- so a failure that hits everyone is visible, not just "nobody matched".
      RAISE WARNING 'invite_next_waitlist_entry: entry % skipped: % (%)', w.id, SQLERRM, SQLSTATE;
    END;
  END LOOP;
  RETURN FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_booking_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor              UUID := auth.uid();
  v_provider_user_id   UUID;
  v_representative_id  UUID;
BEGIN

  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    PERFORM public.close_orphaned_reschedule_request(NEW.id);
  END IF;

  IF NEW.status = 'confirmed' AND OLD.status = 'pending' THEN
    IF NEW.group_booking_id IS NOT NULL THEN
      SELECT id INTO v_representative_id
        FROM public.bookings
       WHERE group_booking_id = NEW.group_booking_id
         AND user_id = NEW.user_id
       ORDER BY booking_date ASC, booking_time ASC, id ASC
       LIMIT 1;

      IF v_representative_id = NEW.id THEN
        INSERT INTO public.notifications
          (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
        VALUES (
          NEW.user_id,
          'booking_confirmed',
          'Booking Confirmed! 🎉',
          COALESCE(NEW.group_booking_count, 1)::TEXT || ' of your services have been confirmed, starting with ' ||
            NEW.service_name_snapshot || ' with ' || NEW.provider_name_snapshot ||
            ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') ||
            ' at ' || public.format_notification_time(NEW.booking_time) || '.',
          'high', TRUE, NEW.id, NEW.provider_id, 'client'
        );
      END IF;
      RETURN NEW;
    END IF;

    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      NEW.user_id, 'booking_confirmed', 'Booking Confirmed! 🎉',
      NEW.provider_name_snapshot || ' confirmed your booking for ' ||
        NEW.service_name_snapshot ||
        ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') ||
        ' at ' || public.format_notification_time(NEW.booking_time) || '.',
      'high', TRUE, NEW.id, NEW.provider_id, 'client'
    );
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelled' AND OLD.status = 'pending' THEN
    IF v_actor IS NOT NULL AND v_actor = NEW.user_id THEN
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
      SELECT
        p.user_id, 'booking_cancelled', 'Booking Request Withdrawn',
        COALESCE(NEW.customer_name, 'A client') || ' withdrew their request for ' ||
          NEW.service_name_snapshot ||
          ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || '.',
        'medium', FALSE, NEW.id, NEW.provider_id, 'provider'
      FROM public.providers p WHERE p.id = NEW.provider_id;
    ELSE
      IF NEW.group_booking_id IS NOT NULL THEN
        SELECT id INTO v_representative_id
          FROM public.bookings
         WHERE group_booking_id = NEW.group_booking_id
           AND user_id = NEW.user_id
           AND provider_id = NEW.provider_id
         ORDER BY booking_date ASC, booking_time ASC, id ASC
         LIMIT 1;

        IF v_representative_id = NEW.id THEN
          INSERT INTO public.notifications
            (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
          VALUES (
            NEW.user_id, 'booking_declined', 'Booking Declined',
            'Unfortunately, ' || NEW.provider_name_snapshot ||
              ' is unable to accept your ' || COALESCE(NEW.group_booking_count, 1)::TEXT ||
              ' requested service(s), starting with ' || NEW.service_name_snapshot ||
              ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || '.' || CASE WHEN NEW.payment_status = 'authorised'
                 THEN ' You won''t be charged. We''ve asked your bank to release the hold on your card; some banks take a few days to stop showing it.' ELSE '' END,
            'high', FALSE, NEW.id, NEW.provider_id, 'client'
          );
        END IF;
      ELSE
        INSERT INTO public.notifications
          (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
        VALUES (
          NEW.user_id, 'booking_declined', 'Booking Declined',
          'Unfortunately, ' || NEW.provider_name_snapshot ||
            ' is unable to accept your booking for ' ||
            NEW.service_name_snapshot ||
            ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || '.' || CASE WHEN NEW.payment_status = 'authorised'
                 THEN ' You won''t be charged. We''ve asked your bank to release the hold on your card; some banks take a few days to stop showing it.' ELSE '' END,
          'high', FALSE, NEW.id, NEW.provider_id, 'client'
        );
      END IF;
    END IF;

    PERFORM public.waitlist_slot_freed(
      NEW.provider_id, NEW.service_id,
      NEW.booking_date, NEW.booking_time, NEW.end_time,
      NEW.customer_name
    );
    RETURN NEW;
  END IF;

  IF NEW.status = 'in_progress' AND OLD.status != 'in_progress' THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      NEW.user_id, 'booking_in_progress', 'Your Appointment Has Started',
      NEW.provider_name_snapshot || ' has started your ' ||
        NEW.service_name_snapshot || ' appointment.',
      'high', FALSE, NEW.id, NEW.provider_id, 'client'
    );
    RETURN NEW;
  END IF;

  IF NEW.status = 'no_show' AND OLD.status != 'no_show' THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      NEW.user_id, 'no_show', 'Missed Appointment',
      'Your appointment with ' || NEW.provider_name_snapshot ||
        ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') ||
        ' was marked as a no-show.',
      'high', FALSE, NEW.id, NEW.provider_id, 'client'
    );
    RETURN NEW;
  END IF;

  IF NEW.status = 'provider_no_show' AND OLD.status != 'provider_no_show' THEN
    SELECT p.user_id INTO v_provider_user_id
      FROM public.providers p WHERE p.id = NEW.provider_id;

    IF v_provider_user_id IS NOT NULL THEN
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
      VALUES (
        v_provider_user_id, 'provider_no_show', 'Client Reported a Missed Appointment',
        COALESCE(NEW.customer_name, 'A client') || ' marked ' ||
          NEW.service_name_snapshot || ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') ||
          ' at ' || public.format_notification_time(NEW.booking_time) ||
          ' as a missed appointment — you did not show up.',
        'high', FALSE, NEW.id, NEW.provider_id, 'provider'
      );
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' AND OLD.status != 'pending' AND OLD.status != 'on_hold' THEN
    SELECT p.user_id INTO v_provider_user_id
      FROM public.providers p WHERE p.id = NEW.provider_id;

    IF NEW.group_booking_id IS NOT NULL THEN
      SELECT id INTO v_representative_id
        FROM public.bookings
       WHERE group_booking_id = NEW.group_booking_id
         AND user_id = NEW.user_id
         AND provider_id = NEW.provider_id
       ORDER BY booking_date ASC, booking_time ASC, id ASC
       LIMIT 1;

      IF v_representative_id = NEW.id THEN
        IF v_actor IS NULL OR v_actor != NEW.user_id THEN
          INSERT INTO public.notifications
            (user_id, type, title, message, priority, is_actionable, booking_id, recipient_role)
          VALUES (
            NEW.user_id, 'booking_cancelled', 'Booking Cancelled',
            'Your ' || COALESCE(NEW.group_booking_count, 1)::TEXT || ' service(s) with ' ||
              NEW.provider_name_snapshot || ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') ||
              ' have been cancelled.',
            'high', FALSE, NEW.id, 'client'
          );
        END IF;

        IF v_provider_user_id IS NOT NULL
           AND (v_actor IS NULL OR v_actor != v_provider_user_id) THEN
          INSERT INTO public.notifications
            (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
          SELECT
            p.user_id, 'booking_cancelled', 'Client Cancelled',
            COALESCE(NEW.customer_name, 'A client') || ' cancelled their ' ||
              COALESCE(NEW.group_booking_count, 1)::TEXT || ' service(s) on ' ||
              TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || '.',
            'medium', FALSE, NEW.id, NEW.provider_id, 'provider'
          FROM public.providers p WHERE p.id = NEW.provider_id;
        END IF;
      END IF;
    ELSE
      IF v_actor IS NULL OR v_actor != NEW.user_id THEN
        INSERT INTO public.notifications
          (user_id, type, title, message, priority, is_actionable, booking_id, recipient_role)
        VALUES (
          NEW.user_id, 'booking_cancelled', 'Booking Cancelled',
          'Your booking with ' || NEW.provider_name_snapshot ||
            ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || ' has been cancelled.',
          'high', FALSE, NEW.id, 'client'
        );
      END IF;

      IF v_provider_user_id IS NOT NULL
         AND (v_actor IS NULL OR v_actor != v_provider_user_id) THEN
        INSERT INTO public.notifications
          (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
        SELECT
          p.user_id, 'booking_cancelled', 'Client Cancelled',
          COALESCE(NEW.customer_name, 'A client') || ' cancelled their ' ||
            NEW.service_name_snapshot ||
            ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || '.',
          'medium', FALSE, NEW.id, NEW.provider_id, 'provider'
        FROM public.providers p WHERE p.id = NEW.provider_id;
      END IF;
    END IF;

    PERFORM public.waitlist_slot_freed(
      NEW.provider_id, NEW.service_id,
      NEW.booking_date, NEW.booking_time, NEW.end_time,
      NEW.customer_name
    );
    RETURN NEW;
  END IF;

  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    IF COALESCE((
      SELECT (p.automation_settings->>'autoReviewRequest')::BOOLEAN
        FROM public.providers p WHERE p.id = NEW.provider_id
    ), TRUE) THEN
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
      VALUES (
        NEW.user_id, 'review_request', 'How was your appointment?',
        'Leave a review for ' || NEW.provider_name_snapshot ||
          '. Your feedback helps others find great providers.',
        'medium', TRUE, NEW.id, NEW.provider_id, 'client'
      );
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_booking_bookability()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_last_bookable DATE;
  v_notice_hours INTEGER;
  v_has_override BOOLEAN;
  v_fits_window BOOLEAN;
  v_legacy_open TIME;
  v_legacy_close TIME;
  v_legacy_closed BOOLEAN;
  v_bypass_hours BOOLEAN;
  v_bypass_policy BOOLEAN;
  -- Emergency-request opt-ins, read once alongside the settings above.
  v_allow_hours BOOLEAN;
  v_allow_blocked BOOLEAN;
  v_allow_notice BOOLEAN;
  v_allow_window BOOLEAN;
  v_emergency BOOLEAN;
  v_day_is_shut BOOLEAN := FALSE;
  v_latest_start TIME;
BEGIN
  SELECT min_booking_notice_hrs,
         COALESCE(allow_out_of_hours_requests, false),
         COALESCE(allow_blocked_date_requests, false),
         COALESCE(allow_short_notice_requests, false),
         COALESCE(allow_beyond_window_requests, false)
    INTO v_notice_hours,
         v_allow_hours, v_allow_blocked, v_allow_notice, v_allow_window
    FROM public.providers WHERE id = NEW.provider_id;

  v_emergency := COALESCE(NEW.is_emergency_request, false);

  IF NEW.booking_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Booking date cannot be in the past';
  END IF;

  -- Always enforced, emergency or not, bypass or not: a same-day booking for
  -- a time that has already elapsed (or is exactly now) cannot be kept by
  -- anyone, provider override or not.
  IF NEW.booking_date = CURRENT_DATE AND NEW.booking_time <= LOCALTIME THEN
    RAISE EXCEPTION 'That time has already passed today';
  END IF;

  -- Provider-initiated manual booking: skips the booking-window / minimum-
  -- notice / blocked-date POLICY checks below outright, independently of any
  -- client-facing opt-in. Set exclusively by provider_create_manual_booking()
  -- via set_config('cerviced.bypass_scheduling_policy', 'on', true);
  -- transaction-local, cannot leak to any other insert.
  v_bypass_policy := COALESCE(current_setting('cerviced.bypass_scheduling_policy', true), 'off') = 'on';

  IF NOT v_bypass_policy THEN
    -- Closed by hand: no NEW bookings. Holds for a reschedule pass
    -- (reschedule_hold_for), and an UPDATE moves a booking the provider
    -- agreed to through confirm_reschedule_own_booking, so a move carries on.
    -- The provider adding their own client is exempt: inviting from their
    -- waitlist by hand is a plain insert under bookings_provider_insert. The
    -- automatic invite can also run as the provider, when they cancel, so
    -- invite_next_waitlist_entry has its own check. A waitlist hold passes a
    -- schedule closed because it's full: only the waitlist can have a slot
    -- freed then (20261118150000). Clients can't insert bookings directly.
    IF TG_OP = 'INSERT'
       AND NEW.reschedule_hold_for IS NULL
       AND public.provider_schedule_is_closed(NEW.provider_id)
       AND NOT (NEW.waitlist_entry_id IS NOT NULL
                AND NOT public.provider_schedule_closed_to_waitlist(NEW.provider_id))
       AND NOT EXISTS (
         SELECT 1 FROM public.providers own
          WHERE own.id = NEW.provider_id AND own.user_id = auth.uid()
       ) THEN
      RAISE EXCEPTION 'This provider is not taking bookings right now';
    END IF;

    -- The rolling window, or what a monthly release has opened so far — see
    -- provider_last_bookable_date. NULL = no limit.
    --
    -- Not re-checked when an existing booking keeps its date and provider:
    -- a time-only change (or an end_time fix) to a booking that was valid
    -- when made must not fail just because the horizon has since moved — a
    -- provider switching from a 60-day window to a monthly release would
    -- otherwise freeze every booking they hold past the end of the month.
    v_last_bookable := public.provider_last_bookable_date(NEW.provider_id);
    IF v_last_bookable IS NOT NULL
       AND NOT (TG_OP = 'UPDATE'
                AND NEW.booking_date = OLD.booking_date
                AND NEW.provider_id = OLD.provider_id)
       AND NEW.booking_date > v_last_bookable
       AND NOT (v_emergency AND v_allow_window) THEN
      RAISE EXCEPTION 'Booking is outside this provider''s booking window';
    END IF;

    IF COALESCE(v_notice_hours, 0) > 0
       AND (NEW.booking_date + NEW.booking_time) < now() + make_interval(hours => v_notice_hours)
       AND NOT (v_emergency AND v_allow_notice) THEN
      RAISE EXCEPTION 'This appointment does not meet the provider''s minimum notice';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.provider_blocked_dates
      WHERE provider_id = NEW.provider_id AND blocked_date = NEW.booking_date
    ) THEN
      IF NOT (v_emergency AND v_allow_blocked) THEN
        RAISE EXCEPTION 'Provider is unavailable on this date';
      END IF;
      -- Accepted as an emergency request, but the day has no hours of its
      -- own, so the envelope check below is what bounds the time of day.
      v_day_is_shut := TRUE;
    END IF;
  END IF;

  -- Provider-initiated squeeze-in: skips ONLY the working-hours fit check
  -- below. Set exclusively by provider_create_manual_booking() via
  -- set_config('cerviced.bypass_working_hours', 'on', true) immediately
  -- before its INSERT; transaction-local, cannot leak to any other insert.
  v_bypass_hours := COALESCE(current_setting('cerviced.bypass_working_hours', true), 'off') = 'on';

  IF NOT v_bypass_hours THEN
    -- The service's own latest start (services.latest_start_time). Hard
    -- stop: no emergency opt-in reaches past it, only the provider's own
    -- squeeze-in (the bypass above). Checked on a new booking and on a move
    -- to a new date, time or service, never on an UPDATE that leaves all
    -- three alone, so a booking made before the provider set the limit isn't
    -- frozen by it. Clients can't insert bookings directly (only the
    -- provider's own insert policy exists; checkout goes through RPCs that
    -- always set service_id), so a NULL service_id is a provider's own or
    -- legacy row and is left alone.
    IF NEW.service_id IS NOT NULL
       AND (TG_OP = 'INSERT'
            OR NEW.booking_date IS DISTINCT FROM OLD.booking_date
            OR NEW.booking_time IS DISTINCT FROM OLD.booking_time
            OR NEW.service_id IS DISTINCT FROM OLD.service_id) THEN
      SELECT s.latest_start_time INTO v_latest_start
        FROM public.services s
       WHERE s.id = NEW.service_id AND s.provider_id = NEW.provider_id;
      IF v_latest_start IS NOT NULL AND NEW.booking_time > v_latest_start THEN
        RAISE EXCEPTION 'This service has to start by %',
          lower(to_char(DATE '2000-01-01' + v_latest_start, 'FMHH12:MIAM'));
      END IF;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.provider_availability_overrides
       WHERE provider_id = NEW.provider_id AND availability_date = NEW.booking_date
    ) INTO v_has_override;

    -- A one-off "closed" override is the same kind of statement as a blocked
    -- date — "I am not working that day" — so it answers to the same opt-in,
    -- not to the out-of-hours one.
    IF v_has_override AND EXISTS (
      SELECT 1 FROM public.provider_availability_overrides
       WHERE provider_id = NEW.provider_id AND availability_date = NEW.booking_date AND is_closed
    ) THEN
      IF NOT (v_emergency AND v_allow_blocked) THEN
        RAISE EXCEPTION 'Provider is unavailable on this date';
      END IF;
      v_day_is_shut := TRUE;
    END IF;

    IF v_day_is_shut THEN
      v_fits_window := FALSE;
    ELSE
      SELECT EXISTS (
        SELECT 1 FROM public.provider_availability_overrides
         WHERE provider_id = NEW.provider_id AND availability_date = NEW.booking_date
           AND is_closed = FALSE AND NEW.booking_time >= start_time AND NEW.end_time <= end_time
      ) INTO v_fits_window;

      IF NOT v_has_override THEN
        SELECT EXISTS (
          SELECT 1 FROM public.provider_availability_windows
           WHERE provider_id = NEW.provider_id
             AND day_of_week = EXTRACT(DOW FROM NEW.booking_date)
             AND NEW.booking_time >= start_time AND NEW.end_time <= end_time
        ) INTO v_fits_window;

        -- Providers not yet migrated retain their original single daily period.
        IF NOT v_fits_window AND NOT EXISTS (
          SELECT 1 FROM public.provider_availability_windows WHERE provider_id = NEW.provider_id
        ) THEN
          SELECT open_time, close_time, is_closed INTO v_legacy_open, v_legacy_close, v_legacy_closed
          FROM public.provider_availability
          WHERE provider_id = NEW.provider_id AND day_of_week = EXTRACT(DOW FROM NEW.booking_date);
          v_fits_window := FOUND AND NOT COALESCE(v_legacy_closed, TRUE)
            AND NEW.booking_time >= v_legacy_open AND NEW.end_time <= v_legacy_close;
        END IF;
      END IF;
    END IF;

    -- Outside the working hours. Allowed only as an emergency request, and
    -- only under the opt-in that matches WHY the day doesn't fit: a shut day
    -- was already authorised by the blocked-date opt-in above, anything else
    -- needs the out-of-hours one. No further bound on the time of day — see
    -- this migration's header.
    IF NOT COALESCE(v_fits_window, FALSE)
       AND (NOT v_emergency OR NOT (v_allow_hours OR (v_day_is_shut AND v_allow_blocked))) THEN
      RAISE EXCEPTION 'This appointment is outside the provider''s working hours';
    END IF;
  END IF;

  -- Busy in the provider's own calendar (provider_calendar_busy_blocks,
  -- synced from the calendars they chose on their phone). Same answer as a
  -- taken slot, but only when a booking is made or moved to a new time: a
  -- busy time synced later never freezes a booking already made. Skipped for
  -- the provider's own bookings (their manual add, or their own insert), since
  -- the calendar entry may be that very appointment.
  IF NOT v_bypass_policy
     AND (TG_OP = 'INSERT'
          OR NEW.booking_date IS DISTINCT FROM OLD.booking_date
          OR NEW.booking_time IS DISTINCT FROM OLD.booking_time
          OR NEW.end_time IS DISTINCT FROM OLD.end_time)
     AND NOT EXISTS (
       SELECT 1 FROM public.providers own
        WHERE own.id = NEW.provider_id AND own.user_id = auth.uid()
     )
     AND EXISTS (
       SELECT 1 FROM public.provider_calendar_busy_blocks cb
        WHERE cb.provider_id = NEW.provider_id AND cb.block_date = NEW.booking_date
          AND NEW.booking_time < cb.end_time
          AND COALESCE(NEW.end_time, NEW.booking_time + INTERVAL '1 hour') > cb.start_time
     ) THEN
    RAISE EXCEPTION 'That time is no longer available';
  END IF;

  -- A taken slot stays taken regardless of anyone's intent — no opt-in, no
  -- override, no emergency reaches past this.
  IF EXISTS (
    SELECT 1 FROM public.bookings b
     WHERE b.provider_id = NEW.provider_id AND b.booking_date = NEW.booking_date
       AND b.status IN ('pending', 'confirmed', 'in_progress', 'on_hold')
       AND b.id IS DISTINCT FROM NEW.id
       AND NEW.booking_time < b.end_time AND NEW.end_time > b.booking_time
  ) THEN RAISE EXCEPTION 'That time is no longer available'; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.end_waitlist_hold(p_booking_id uuid, p_missed boolean, p_tell_client boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  h public.bookings%ROWTYPE;
  v_rolling BOOLEAN;
  v_enabled BOOLEAN;
  v_provider_user_id UUID;
  v_offered BOOLEAN;
  v_when TEXT;
  v_who TEXT;
  v_closed BOOLEAN;
BEGIN
  SELECT * INTO h FROM public.bookings
   WHERE id = p_booking_id AND status = 'on_hold' AND waitlist_entry_id IS NOT NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;  -- already paid for, or already ended
  END IF;

  -- An unfinished checkout on this hold ends with it. One with a payment
  -- started is left to reconcile-checkouts: its batch can't outlast the hold,
  -- so finalize_checkout() refuses it and the payment is cancelled or refunded.
  IF h.hold_batch_id IS NOT NULL THEN
    UPDATE public.checkout_batches
       SET status = 'cancelled'
     WHERE id = h.hold_batch_id AND status = 'prepared' AND payment_intent_id IS NULL;
  END IF;

  UPDATE public.provider_waitlist
     SET status = 'expired', offer_ended_at = now()
   WHERE id = h.waitlist_entry_id;

  -- Like an abandoned cart hold: never a booking, so never a cancelled one.
  -- Its notifications stay (booking_id is ON DELETE SET NULL).
  DELETE FROM public.bookings WHERE id = h.id;

  v_when := TO_CHAR(h.booking_date, 'FMDD Mon') || ' at ' || public.format_notification_time(h.booking_time);
  v_who := COALESCE(NULLIF(btrim(h.customer_name), ''), 'Your waitlist client');

  IF p_tell_client THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, provider_id, recipient_role)
    VALUES (
      h.user_id, 'waitlist_slot_available', 'Your held slot has gone',
      h.service_name_snapshot || ' with ' || h.provider_name_snapshot || ' on ' || v_when ||
        ' was held for you until ' || public.format_notification_time((h.hold_expires_at AT TIME ZONE 'Europe/London')::time) ||
        '. You''ve come off this waitlist, but you can rejoin from Bookings.' ||
        -- A payment caught by the clock is cancelled or refunded by
        -- reconcile-checkouts, which sends its own payment_not_completed notice.
        CASE WHEN h.hold_batch_id IS NOT NULL AND EXISTS (
               SELECT 1 FROM public.checkout_batches cb
                WHERE cb.id = h.hold_batch_id AND cb.payment_intent_id IS NOT NULL)
             THEN ' If you''d started paying, that payment is cancelled or refunded in full.'
             ELSE '' END,
      'medium', TRUE, h.provider_id, 'client'
    );
  END IF;

  IF public.provider_schedule_closed_to_waitlist(h.provider_id) THEN
    RETURN;  -- the slot isn't open to anyone
  END IF;
  -- Closed because full: the slot can only go to the waitlist.
  v_closed := public.provider_schedule_is_closed(h.provider_id);

  SELECT COALESCE((automation_settings->>'waitlistEnabled')::boolean, TRUE),
         COALESCE((automation_settings->>'autoAcceptWaitlist')::boolean, FALSE),
         user_id
    INTO v_enabled, v_rolling, v_provider_user_id
    FROM public.providers WHERE id = h.provider_id;
  IF NOT COALESCE(v_enabled, TRUE) THEN
    RETURN;
  END IF;

  IF v_rolling THEN
    v_offered := public.invite_next_waitlist_entry(
      h.provider_id, h.service_id, h.booking_date, h.booking_time, h.end_time);
    IF v_offered THEN
      RETURN;
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM public.provider_waitlist o
     WHERE o.provider_id = h.provider_id
       AND o.status = 'waiting'
       AND (o.service_id = h.service_id OR o.service_id IS NULL)
       AND (o.preferred_dates IS NULL
            OR (h.booking_date >= o.preferred_dates[1]
                AND h.booking_date <= COALESCE(o.preferred_dates[2], 'infinity'::date)))
  ) THEN
    -- Auto off: back to the provider to offer, and open to everyone unless
    -- the schedule is closed.
    INSERT INTO public.waitlist_released_slots
      (provider_id, service_id, service_name_snapshot, booking_date, booking_time, end_time, released_by_name, reason)
    VALUES
      (h.provider_id, h.service_id, h.service_name_snapshot, h.booking_date, h.booking_time, h.end_time,
       h.customer_name, CASE WHEN p_missed THEN 'missed' ELSE 'passed' END);
    IF v_provider_user_id IS NOT NULL THEN
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, provider_id, recipient_role)
      VALUES (
        v_provider_user_id, 'waitlist_slot_available',
        v_who || ' didn''t take ' || v_when,
        CASE WHEN p_missed
             THEN 'Their ' || (EXTRACT(EPOCH FROM public.waitlist_hold_duration()) / 60)::int || ' minutes ran out.'
             ELSE 'They passed on it.' END ||
          CASE WHEN v_closed
               THEN ' Your schedule is closed, so only your waitlist can have it.'
               ELSE ' The time is open to everyone now.' END ||
          ' You can offer it to someone on your waitlist from Bookings.',
        'medium', TRUE, h.provider_id, 'provider'
      );
    END IF;
    RETURN;
  END IF;

  -- Nobody left who can take it.
  IF v_provider_user_id IS NOT NULL THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, provider_id, recipient_role)
    VALUES (
      v_provider_user_id, 'waitlist_slot_available', 'Waitlist exhausted',
      'Nobody on the waitlist took ' || h.service_name_snapshot || ' on ' || v_when ||
        CASE WHEN v_closed
             THEN '. It stays closed while your schedule is.'
             ELSE '. The time is open to everyone again.' END,
      'medium', FALSE, h.provider_id, 'provider'
    );
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_provider_fully_booked_alerts()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r           RECORD;
  v_open      boolean;
  v_has_state boolean;
  v_was_full  boolean;
  v_open_since timestamptz;
  v_through   date;
  v_month_end date;
  v_new_fill  boolean;
  v_last      date;
  v_horizon   integer;
  v_services  uuid[];
  v_fill_id   uuid;
  v_today     date := (now() AT TIME ZONE 'Europe/London')::date;
  v_daytime   boolean := EXTRACT(HOUR FROM (now() AT TIME ZONE 'Europe/London'))::int BETWEEN 8 AND 20;
BEGIN
  -- Forget anyone who has left (offline, inactive, link-only, nothing set up),
  -- so they come back with a fresh first look instead of a stale "full". A
  -- closed schedule keeps its state: it's only paused.
  DELETE FROM public.provider_fully_booked_state st
   WHERE NOT EXISTS (
     SELECT 1 FROM public.providers p
      WHERE p.id = st.provider_id
        AND p.has_gone_live = TRUE
        AND p.is_active = TRUE
        AND COALESCE(p.booking_mode, '') <> 'external'
        AND EXISTS (SELECT 1 FROM public.services s
                     WHERE s.provider_id = p.id AND s.is_active = TRUE AND s.duration_minutes > 0)
        AND (EXISTS (SELECT 1 FROM public.provider_availability_windows w WHERE w.provider_id = p.id)
             OR EXISTS (SELECT 1 FROM public.provider_availability a WHERE a.provider_id = p.id AND a.is_closed = FALSE))
   );

  FOR r IN
    SELECT p.id AS provider_id, p.user_id,
           COALESCE(p.automation_settings->>'autoCloseWhenFull', '') = 'true' AS auto_close,
           COALESCE(p.automation_settings->>'waitlistEnabled', '') = 'false' AS waitlist_off
      FROM public.providers p
     WHERE p.has_gone_live = TRUE
       AND p.is_active = TRUE
       -- Link-only providers take their bookings elsewhere.
       AND COALESCE(p.booking_mode, '') <> 'external'
       -- Closed isn't full: nothing can be booked, so there's nothing to fill.
       -- Their state is left as it was.
       AND NOT public.provider_schedule_is_closed(p.id)
       -- Nothing bookable because nothing is set up isn't full either.
       AND EXISTS (
         SELECT 1 FROM public.services s
          WHERE s.provider_id = p.id AND s.is_active = TRUE AND s.duration_minutes > 0
       )
       AND (
         EXISTS (SELECT 1 FROM public.provider_availability_windows w WHERE w.provider_id = p.id)
         OR EXISTS (SELECT 1 FROM public.provider_availability a WHERE a.provider_id = p.id AND a.is_closed = FALSE)
       )
  LOOP
   -- One provider's failure is logged and skipped, not allowed to stop the run.
   BEGIN
    v_last := public.provider_last_bookable_date(r.provider_id);
    v_horizon := CASE WHEN v_last IS NULL THEN 180
                      ELSE LEAST(180, v_last - v_today + 1) END;
    -- Too little left to book to say anything (see the header).
    CONTINUE WHEN v_horizon < 7;

    v_services := ARRAY(SELECT s.id FROM public.services s
                         WHERE s.provider_id = r.provider_id AND s.is_active = TRUE);

    -- The same check as the client profile's Fully Booked: no free slot for
    -- any active service on any date they've opened. The near term first,
    -- which answers it for almost everyone; 180 days only when that's taken.
    v_open := EXISTS (SELECT 1 FROM public.get_services_open_within(v_services, 14) o WHERE o.has_slot)
           OR EXISTS (SELECT 1 FROM public.get_services_open_within(v_services, 180) o WHERE o.has_slot);

    -- No free slot and nothing booked is a blocked-out diary, not a full one.
    v_open := v_open OR NOT EXISTS (
      SELECT 1 FROM public.bookings b
       WHERE b.provider_id = r.provider_id
         AND b.booking_date BETWEEN v_today AND v_today + v_horizon - 1
         AND b.status IN ('pending', 'confirmed', 'in_progress')
    );

    SELECT s.is_full, s.open_since INTO v_was_full, v_open_since
      FROM public.provider_fully_booked_state s
     WHERE s.provider_id = r.provider_id;
    v_has_state := FOUND;

    IF v_open THEN
      INSERT INTO public.provider_fully_booked_state (provider_id, is_full, open_since, checked_at)
      VALUES (r.provider_id, FALSE, now(), now())
      ON CONFLICT (provider_id) DO UPDATE
        SET is_full = FALSE,
            open_since = CASE WHEN provider_fully_booked_state.is_full THEN now()
                              ELSE COALESCE(provider_fully_booked_state.open_since, now()) END,
            checked_at = now();
      CONTINUE;
    END IF;

    -- Full. Nothing is said at night; it's re-checked every hour.
    v_new_fill := FALSE;
    IF v_has_state AND v_was_full THEN
      UPDATE public.provider_fully_booked_state SET checked_at = now() WHERE provider_id = r.provider_id;
    ELSE
      CONTINUE WHEN NOT v_daytime;
      INSERT INTO public.provider_fully_booked_state (provider_id, is_full, open_since, checked_at)
      VALUES (r.provider_id, TRUE, NULL, now())
      ON CONFLICT (provider_id) DO UPDATE SET is_full = TRUE, checked_at = now();
      -- Just filled. One cancellation filled again the same day is the same
      -- fill, and it's said at most once a week.
      v_new_fill := NOT (
        (v_has_state
         AND v_open_since IS NOT NULL
         AND v_open_since > now() - INTERVAL '24 hours'
         AND EXISTS (SELECT 1 FROM public.provider_fully_booked_fills f WHERE f.provider_id = r.provider_id))
        OR EXISTS (SELECT 1 FROM public.provider_fully_booked_fills f
                    WHERE f.provider_id = r.provider_id AND f.filled_at > now() - INTERVAL '7 days')
      );
    END IF;
    CONTINUE WHEN NOT v_daytime;

    -- They asked for their schedule to close when it fills. Only at the moment
    -- of filling: a provider who reopens by hand while still full stays open,
    -- because the state above already says full. With the waitlist on too, a
    -- slot freed while closed goes to the waitlist only (20261118150000).
    IF NOT (v_has_state AND v_was_full) AND r.auto_close THEN
      INSERT INTO public.provider_schedule_closures
        (provider_id, closed_at, reopens_on, reason, show_reason, auto_closed)
      VALUES (r.provider_id, now(), NULL, 'fully_booked', FALSE, TRUE)
      ON CONFLICT (provider_id) DO UPDATE
        SET closed_at = now(), reopens_on = NULL, reason = 'fully_booked',
            show_reason = FALSE, auto_closed = TRUE;

      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, provider_id, recipient_role, metadata)
      VALUES (
        r.user_id,
        'schedule_fully_booked',
        'Your schedule has closed',
        CASE WHEN r.waitlist_off
             THEN 'You''re fully booked, so new bookings are off, including any slot that frees up. Reopen it from your schedule whenever you like.'
             ELSE 'You''re fully booked, so new bookings are off. A slot that frees up goes to your waitlist only. Reopen it from your schedule whenever you like.' END,
        'medium',
        TRUE,
        r.provider_id,
        'provider',
        jsonb_build_object('kind', 'schedule_auto_closed')
      );
    END IF;

    -- The last date the check looked at, and the last month end within it.
    v_through := v_today + v_horizon - 1;
    v_month_end := CASE
      WHEN v_through = (date_trunc('month', v_through) + INTERVAL '1 month - 1 day')::date THEN v_through
      ELSE (date_trunc('month', v_through) - INTERVAL '1 day')::date
    END;

    -- A whole month: no space from today to a month end at least 4 weeks off.
    -- Checked on every full run, not only when they first fill, because a
    -- rolling window or a release brings the next month end into range while
    -- they stay full. Once per calendar month.
    IF v_month_end - v_today + 1 >= 28
       AND NOT EXISTS (
         SELECT 1 FROM public.provider_fully_booked_fills f
          WHERE f.provider_id = r.provider_id
            AND f.certificate_month = date_trunc('month', v_month_end)::date
       ) THEN
      INSERT INTO public.provider_fully_booked_fills (provider_id, through_date, certificate_month)
      VALUES (r.provider_id, v_month_end, date_trunc('month', v_month_end)::date)
      RETURNING id INTO v_fill_id;

      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, provider_id, recipient_role, metadata)
      VALUES (
        r.user_id,
        'schedule_fully_booked',
        'You''re Fully Booked!',
        to_char(v_month_end, 'FMMonth') || ' is fully booked. Open My Profile to see your certificate.',
        'medium',
        TRUE,
        r.provider_id,
        'provider',
        jsonb_build_object('kind', 'fully_booked_certificate', 'fill_id', v_fill_id)
      );
      CONTINUE;
    END IF;

    -- A shorter run: a notification, no certificate, no achievement.
    CONTINUE WHEN NOT v_new_fill;

    INSERT INTO public.provider_fully_booked_fills (provider_id, through_date)
    VALUES (r.provider_id, v_through)
    RETURNING id INTO v_fill_id;

    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, provider_id, recipient_role, metadata)
    VALUES (
      r.user_id,
      'schedule_fully_booked',
      'You''re Fully Booked!',
      'Every slot you''ve opened, up to ' || to_char(v_through, 'FMDD FMMonth') || ', is booked.',
      'medium',
      TRUE,
      r.provider_id,
      'provider',
      jsonb_build_object('kind', 'fully_booked', 'fill_id', v_fill_id)
    );
   EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fully booked check failed for provider %: % (%)', r.provider_id, SQLERRM, SQLSTATE;
   END;
  END LOOP;
END;
$function$;
