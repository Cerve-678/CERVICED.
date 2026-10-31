-- Rescheduling can't be used to dodge a late-cancellation charge.
--
-- Frontier at authoring: 20261031173214 (verified live 2026-10-31). No open
-- PR branch has an unapplied migration above it. Check the lock in
-- MIGRATION_OWNER.md and re-check max(version) before applying.
--
-- The loophole (PRE-LAUNCH-TODO §26 item 2, PAYMENTS_AND_LOGIC.md Part 6):
-- a client already inside the provider's cancellation window could ask to
-- reschedule (reschedule notice is a separate, often looser setting), then
-- cancel the new date in good time for a full refund, because
-- apply-cancellation-refund only looked at the current date.
--
-- Decided with the user 2026-10-25: if the client asked to reschedule while
-- already inside the cancellation window, the provider's late-cancel rule
-- still applies to that booking, as if they'd cancelled on the original date.
-- Anyone who asks in good time is unaffected, and so is any reschedule the
-- provider started.
--
-- What this adds:
--   - booking_reschedule_requests.requested_inside_cancel_window: stamped by
--     request_reschedule_own_booking at the moment the client asks, measured
--     in UK time against cancel_notice_hours().
--   - bookings.late_reschedule_from: the start (UTC) of the appointment the
--     client moved away from while inside its window. Set by
--     confirm_reschedule_own_booking only when the request was the client's
--     and was stamped late. Sticky: a later reschedule never clears it, and
--     the earliest original start is kept.
--   - authenticated can read the new booking column (column grants), and
--     client_bookings exposes it so the client's cancel sheet can warn.
--
-- Redefines, each from its live definition on 2026-10-31 (md5 guarded):
--   - request_reschedule_own_booking: stamps the new request column. Nothing
--     else changes.
--   - confirm_reschedule_own_booking: sets bookings.late_reschedule_from.
--     Nothing else changes.
--   - cancel_own_booking: a cancel of a late-rescheduled confirmed booking
--     counts as a late cancel in the reliability record, the same as a cancel
--     inside the window. Nothing else changes.
--   - process_cancel_window_closing_warnings: skips late-rescheduled
--     bookings, whose "cancel by" time would no longer be true.
--   - client_bookings view: one column added at the end; security_invoker
--     kept.
--
-- apply-cancellation-refund reads bookings.late_reschedule_from and must be
-- deployed after this is applied (it selects the column, so deploying it
-- first makes every client cancellation fail to settle).

BEGIN;

DO $guard$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(pg_get_functiondef('public.request_reschedule_own_booking(uuid,text[])'::regprocedure)) INTO v_md5;
  IF v_md5 <> '1e9ef6ce2184248192cd61e2c5b8ab1e' THEN
    RAISE EXCEPTION 'request_reschedule_own_booking changed since this file was written (md5 %). Re-diff before applying.', v_md5;
  END IF;
  SELECT md5(pg_get_functiondef('public.confirm_reschedule_own_booking(uuid,date,time,time)'::regprocedure)) INTO v_md5;
  IF v_md5 <> 'b5582a6a0d74f7ae0b3abd9c909d178a' THEN
    RAISE EXCEPTION 'confirm_reschedule_own_booking changed since this file was written (md5 %). Re-diff before applying.', v_md5;
  END IF;
  SELECT md5(pg_get_functiondef('public.cancel_own_booking(uuid)'::regprocedure)) INTO v_md5;
  IF v_md5 <> '1edce41092538fc2c52d299ff1e96434' THEN
    RAISE EXCEPTION 'cancel_own_booking changed since this file was written (md5 %). Re-diff before applying.', v_md5;
  END IF;
  SELECT md5(pg_get_functiondef('public.process_cancel_window_closing_warnings()'::regprocedure)) INTO v_md5;
  IF v_md5 <> 'be76bfa78ae2f94833041d4658fcd882' THEN
    RAISE EXCEPTION 'process_cancel_window_closing_warnings changed since this file was written (md5 %). Re-diff before applying.', v_md5;
  END IF;
END
$guard$;

ALTER TABLE public.booking_reschedule_requests
  ADD COLUMN IF NOT EXISTS requested_inside_cancel_window boolean NOT NULL DEFAULT false;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS late_reschedule_from timestamptz;

COMMENT ON COLUMN public.booking_reschedule_requests.requested_inside_cancel_window IS
  'True when the client asked to reschedule while already inside the provider''s cancellation window (UK time). Read by confirm_reschedule_own_booking.';
COMMENT ON COLUMN public.bookings.late_reschedule_from IS
  'Start (UTC) of the appointment the client moved away from while inside its cancellation window. When set, a client cancellation is settled as late. Never cleared.';

GRANT SELECT (requested_inside_cancel_window) ON public.booking_reschedule_requests TO authenticated;
GRANT SELECT (late_reschedule_from) ON public.bookings TO authenticated;

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
  -- Booking dates/times are UK wall-clock.
  SELECT public.cancel_notice_hours(p.cancellation_notice_hours, p.booking_policies)
    INTO v_cancel_hrs
    FROM public.providers p WHERE p.id = v_booking.provider_id;
  IF COALESCE(v_cancel_hrs, 0) > 0 THEN
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

CREATE OR REPLACE FUNCTION public.confirm_reschedule_own_booking(p_booking_id uuid, p_new_date date, p_new_time time without time zone, p_new_end_time time without time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status TEXT;
  v_has_active_request BOOLEAN;
  v_old_start TIMESTAMPTZ;
  v_moved_late BOOLEAN;
BEGIN
  SELECT b.status,
         ((b.booking_date + b.booking_time)::timestamp AT TIME ZONE 'Europe/London')
    INTO v_status, v_old_start
    FROM public.bookings b
   WHERE b.id = p_booking_id
     AND b.user_id = auth.uid()
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_status <> 'confirmed' THEN
    RAISE EXCEPTION 'This booking can no longer be rescheduled';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.booking_reschedule_requests
     WHERE booking_id = p_booking_id AND status = 'provider_responded'
  ) INTO v_has_active_request;

  IF NOT v_has_active_request THEN
    RAISE EXCEPTION 'No provider-approved reschedule request found for this booking';
  END IF;

  -- Only the client's own late request carries the late-cancel rule; a move
  -- the provider started never does.
  SELECT COALESCE(bool_or(requested_by = 'user' AND requested_inside_cancel_window), false)
    INTO v_moved_late
    FROM public.booking_reschedule_requests
   WHERE booking_id = p_booking_id AND status = 'provider_responded';

  -- Before the UPDATE, never after.
  PERFORM public.release_reschedule_holds(p_booking_id);

  UPDATE public.bookings
     SET booking_date = p_new_date,
         booking_time = p_new_time,
         end_time = p_new_end_time,
         reschedule_count = reschedule_count + 1,
         last_rescheduled_at = NOW(),
         late_reschedule_from = CASE
           WHEN v_moved_late THEN LEAST(COALESCE(late_reschedule_from, v_old_start), v_old_start)
           ELSE late_reschedule_from
         END
   WHERE id = p_booking_id;

  UPDATE public.booking_reschedule_requests
     SET status = 'confirmed', updated_at = NOW()
   WHERE booking_id = p_booking_id;
END;
$function$;

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
         b.late_reschedule_from
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

  v_notice_hrs := public.cancel_notice_hours(v_notice_hrs, v_policies);

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
             - (public.cancel_notice_hours(p.cancellation_notice_hours, p.booking_policies) || ' hours')::INTERVAL
           )                                               AS cancel_cutoff
      FROM public.booking_reschedule_requests rr
      JOIN public.bookings  b ON b.id = rr.booking_id
      JOIN public.providers p ON p.id = b.provider_id
     WHERE rr.status = 'pending'
       AND b.status IN ('pending', 'confirmed')
       -- Already moved inside its window once: there's no free-cancel time
       -- left to warn about.
       AND b.late_reschedule_from IS NULL
       AND public.cancel_notice_hours(p.cancellation_notice_hours, p.booking_policies) > 0
       AND NOW() >= ((b.booking_date + b.booking_time)::TIMESTAMP
             - (public.cancel_notice_hours(p.cancellation_notice_hours, p.booking_policies) || ' hours')::INTERVAL) - INTERVAL '6 hours'
       AND NOW() < ((b.booking_date + b.booking_time)::TIMESTAMP
             - (public.cancel_notice_hours(p.cancellation_notice_hours, p.booking_policies) || ' hours')::INTERVAL)
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

CREATE OR REPLACE VIEW public.client_bookings WITH (security_invoker = true) AS
 SELECT b.id,
    b.user_id,
    b.provider_id,
    b.service_id,
    b.status,
    b.booking_date,
    b.booking_time,
    b.end_time,
    b.notes,
    b.booking_instructions,
    b.payment_type,
    b.base_price,
    b.add_ons_total,
    b.service_charge,
    b.deposit_amount,
    b.amount_paid,
    b.remaining_balance,
    b.payment_status,
    b.payment_method,
    b.payment_intent_id,
    b.is_group_booking,
    b.group_booking_id,
    b.group_booking_count,
    b.provider_name_snapshot,
    b.service_name_snapshot,
    b.service_category_snapshot,
    b.provider_logo_snapshot,
        CASE
            WHEN is_address_released(b.status, p.address_release_policy, b.address_released_at, b.booking_date, b.booking_time) THEN b.provider_address_snapshot
            ELSE NULL::text
        END AS provider_address_snapshot,
    b.provider_phone_snapshot,
        CASE
            WHEN is_address_released(b.status, p.address_release_policy, b.address_released_at, b.booking_date, b.booking_time) THEN b.provider_coordinates
            ELSE NULL::jsonb
        END AS provider_coordinates,
    b.customer_name,
    b.customer_email,
    b.customer_phone,
    b.confirmed_at,
    b.address_released_at,
    ca.address AS client_address,
    b.occasion_type,
    b.style_request,
    b.reference_image_url,
    b.created_at,
    b.updated_at,
    ( SELECT COALESCE(jsonb_agg(to_jsonb(a.*) ORDER BY a.id), '[]'::jsonb) AS "coalesce"
           FROM booking_add_ons a
          WHERE (a.booking_id = b.id)) AS add_ons,
    jsonb_build_object('logo_url', p.logo_url) AS provider,
    p.business_type AS provider_business_type,
    b.no_show_marked_at,
    b.no_show_disputed_at,
    b.no_show_dispute_reason,
    b.no_show_counted_at,
    b.booking_ref,
    b.refunded_amount,
    b.cancelled_by,
    b.policy_retained_amount,
    b.late_reschedule_from
   FROM ((bookings b
     LEFT JOIN providers p ON ((p.id = b.provider_id)))
     LEFT JOIN booking_client_addresses ca ON ((ca.booking_id = b.id)))
  WHERE (b.status <> 'on_hold'::text);

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261031200000', 'late_reschedule_keeps_cancel_charge')
ON CONFLICT (version) DO NOTHING;

COMMIT;
