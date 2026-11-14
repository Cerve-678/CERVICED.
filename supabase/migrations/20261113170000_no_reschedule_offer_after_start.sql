-- A provider can't offer new times once an appointment has started.
--
-- #483 (20261113110000) stops a provider cancelling a booking after its start,
-- because a provider cancel refunds the client in full. A reschedule offer set
-- to "cancel if declined" reached the same result by a side door: the booking is
-- still 'confirmed' while it's under way, the offer only checked that, and a
-- client's decline cancelled it with a full refund. Now:
--   * provider_initiate_reschedule / _with_note and respond_to_reschedule_request
--     refuse after the UK start time (the _with_policy wrappers call these);
--   * decline_reschedule_offer refuses a cancel-if-declined decline after the
--     start, for an offer sent just before it that the expiry job hasn't closed.
-- Each refusal tells the person to message the other side to sort it out.
-- Group reschedules carry no cancel-if-declined, so they are unchanged.
--
-- Redefined from live (pg_get_functiondef, 2026-11-13) with md5 guards.

BEGIN;

DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.provider_initiate_reschedule(uuid,jsonb)'::regprocedure)) <> '9cc45a5d5dfebdb4dd2ce11376403f88' THEN
    RAISE EXCEPTION 'provider_initiate_reschedule changed live since this migration was written; redo it from live';
  END IF;
  IF md5(pg_get_functiondef('public.provider_initiate_reschedule_with_note(uuid,jsonb,boolean,text)'::regprocedure)) <> 'b79cd81bc69495421341b18af96e8bef' THEN
    RAISE EXCEPTION 'provider_initiate_reschedule_with_note changed live since this migration was written; redo it from live';
  END IF;
  IF md5(pg_get_functiondef('public.respond_to_reschedule_request(uuid,jsonb,text)'::regprocedure)) <> 'a3894abb4fb07dde695a3e74ae775700' THEN
    RAISE EXCEPTION 'respond_to_reschedule_request changed live since this migration was written; redo it from live';
  END IF;
  IF md5(pg_get_functiondef('public.decline_reschedule_offer(uuid)'::regprocedure)) <> '04be84307487479625c6de1287fc1649' THEN
    RAISE EXCEPTION 'decline_reschedule_offer changed live since this migration was written; redo it from live';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.provider_initiate_reschedule(p_booking_id uuid, p_proposed_slots jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking RECORD;
BEGIN
  SELECT b.booking_date, b.booking_time, b.status
    INTO v_booking
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
   WHERE b.id = p_booking_id
     AND p.user_id = auth.uid()
   FOR UPDATE OF b;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_booking.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Only confirmed bookings can be rescheduled';
  END IF;

  -- Once it has started, a new time is no longer a reschedule: an offer set to
  -- cancel if declined would let a started booking be cancelled and fully
  -- refunded, which provider_cancel_own_booking refuses. UK wall-clock time.
  IF ((v_booking.booking_date + v_booking.booking_time) AT TIME ZONE 'Europe/London') <= now() THEN
    RAISE EXCEPTION 'This appointment has already started, so you can''t offer new times now. If something''s gone wrong, message the client to sort it out.';
  END IF;

  INSERT INTO public.booking_reschedule_requests
    (booking_id, requested_by, original_date, original_time, requested_dates,
     provider_available_slots, status, reschedule_count, updated_at)
  VALUES
    (p_booking_id, 'provider', v_booking.booking_date, v_booking.booking_time,
     ARRAY[]::DATE[], p_proposed_slots, 'provider_responded', 0, NOW())
  ON CONFLICT (booking_id) DO UPDATE
    SET requested_by = 'provider',
        original_date = v_booking.booking_date,
        original_time = v_booking.booking_time,
        requested_dates = ARRAY[]::DATE[],
        provider_available_slots = p_proposed_slots,
        status = 'provider_responded',
        cancel_if_declined = FALSE,
        updated_at = NOW();

  PERFORM public.release_reschedule_holds(p_booking_id);
  PERFORM public.place_reschedule_holds_from_slots(p_booking_id, p_proposed_slots);
END;
$function$;

CREATE OR REPLACE FUNCTION public.provider_initiate_reschedule_with_note(p_booking_id uuid, p_proposed_slots jsonb, p_cancel_if_declined boolean, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_booking record;
  v_note text := NULLIF(left(btrim(p_note), 500), '');
BEGIN
  SELECT b.booking_date, b.booking_time, b.status
    INTO v_booking
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
   WHERE b.id = p_booking_id AND p.user_id = auth.uid()
   FOR UPDATE OF b;

  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF v_booking.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Only confirmed bookings can be rescheduled';
  END IF;

  -- Same rule as provider_initiate_reschedule: nothing new once it has started.
  IF ((v_booking.booking_date + v_booking.booking_time) AT TIME ZONE 'Europe/London') <= now() THEN
    RAISE EXCEPTION 'This appointment has already started, so you can''t offer new times now. If something''s gone wrong, message the client to sort it out.';
  END IF;

  INSERT INTO public.booking_reschedule_requests
    (booking_id, requested_by, original_date, original_time, requested_dates,
     provider_available_slots, status, reschedule_count, response_note,
     cancel_if_declined, updated_at)
  VALUES
    (p_booking_id, 'provider', v_booking.booking_date, v_booking.booking_time,
     ARRAY[]::date[], p_proposed_slots, 'provider_responded', 0, v_note,
     COALESCE(p_cancel_if_declined, false), now())
  ON CONFLICT (booking_id) DO UPDATE
    SET requested_by = 'provider',
        original_date = v_booking.booking_date,
        original_time = v_booking.booking_time,
        requested_dates = ARRAY[]::date[],
        provider_available_slots = p_proposed_slots,
        status = 'provider_responded',
        response_note = v_note,
        cancel_if_declined = COALESCE(p_cancel_if_declined, false),
        updated_at = now();

  PERFORM public.release_reschedule_holds(p_booking_id);
  PERFORM public.place_reschedule_holds_from_slots(p_booking_id, p_proposed_slots);
END;
$function$;

CREATE OR REPLACE FUNCTION public.respond_to_reschedule_request(p_booking_id uuid, p_available_slots jsonb, p_response_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_found BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.booking_reschedule_requests r
    JOIN public.bookings b ON b.id = r.booking_id
    JOIN public.providers p ON p.id = b.provider_id
    WHERE r.booking_id = p_booking_id
      AND p.user_id = auth.uid()
      AND r.status = 'pending'
    FOR UPDATE OF r
  ) INTO v_found;

  IF NOT v_found THEN
    RAISE EXCEPTION 'No pending reschedule request found for this booking';
  END IF;

  -- Answering a client's request with new times after the start would put the
  -- same cancel-if-declined offer in front of them; refuse it the same way.
  IF EXISTS (
    SELECT 1 FROM public.bookings b
     WHERE b.id = p_booking_id
       AND ((b.booking_date + b.booking_time) AT TIME ZONE 'Europe/London') <= now()
  ) THEN
    RAISE EXCEPTION 'This appointment has already started, so you can''t offer new times now. If something''s gone wrong, message the client to sort it out.';
  END IF;

  UPDATE public.booking_reschedule_requests
     SET provider_available_slots = p_available_slots,
         status = 'provider_responded',
         response_note = p_response_note,
         cancel_if_declined = FALSE,
         updated_at = NOW()
   WHERE booking_id = p_booking_id;

  -- The client's own requested time is no longer a candidate: the provider has
  -- just answered with alternatives instead. Released BEFORE the new holds go
  -- down, so a provider re-offering the very time the client asked for is not
  -- blocked by that client's own stage 1 hold.
  PERFORM public.release_reschedule_holds(p_booking_id);
  PERFORM public.place_reschedule_holds_from_slots(p_booking_id, p_available_slots);
END;
$function$;

CREATE OR REPLACE FUNCTION public.decline_reschedule_offer(p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cancel boolean;
  v_payment_intent_id text;
  v_payment_status text;
  v_stripe_refund_id text;
  v_client_id uuid;
  v_provider_id uuid;
  v_provider_name text;
  v_starts_at timestamptz;
BEGIN
  SELECT r.cancel_if_declined, b.payment_intent_id, b.payment_status,
         b.stripe_refund_id, b.user_id, b.provider_id, b.provider_name_snapshot,
         (b.booking_date + b.booking_time) AT TIME ZONE 'Europe/London'
    INTO v_cancel, v_payment_intent_id, v_payment_status,
         v_stripe_refund_id, v_client_id, v_provider_id, v_provider_name,
         v_starts_at
    FROM public.booking_reschedule_requests r
    JOIN public.bookings b ON b.id = r.booking_id
   WHERE r.booking_id = p_booking_id AND b.user_id = auth.uid()
     AND r.status = 'provider_responded' AND b.status = 'confirmed'
     AND r.group_reschedule_batch_id IS NULL
   FOR UPDATE OF r, b;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active reschedule offer found for this booking';
  END IF;

  -- An offer sent just before the start stays open until the expiry job next
  -- runs. Declining one set to cancel would then cancel and fully refund a
  -- booking that has already started, so it closes at the start instead.
  IF v_cancel AND v_starts_at <= now() THEN
    RAISE EXCEPTION 'This offer closed when your appointment started, so your booking stays as it was. If something''s wrong, message % to sort it out.',
      COALESCE(v_provider_name, 'your provider');
  END IF;

  UPDATE public.booking_reschedule_requests
     SET status = 'rejected', updated_at = now()
   WHERE booking_id = p_booking_id;

  IF v_cancel THEN
    UPDATE public.bookings SET status = 'cancelled' WHERE id = p_booking_id;
    IF v_payment_intent_id IS NOT NULL
       AND v_payment_status IN ('fully_paid', 'deposit_paid')
       AND v_stripe_refund_id IS NULL THEN
      PERFORM public.refund_booking_async(p_booking_id, 'provider_offer_declined');
    END IF;
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      v_client_id, 'booking_cancelled', 'Appointment cancelled',
      'Your appointment with ' || COALESCE(v_provider_name, 'your provider') ||
      ' was cancelled after you declined the new time.' ||
      CASE WHEN v_payment_intent_id IS NOT NULL AND
                    v_payment_status IN ('fully_paid', 'deposit_paid') AND
                    v_stripe_refund_id IS NULL
           THEN ' Your payment is being refunded in full.' ELSE '' END,
      'high', FALSE, p_booking_id, v_provider_id, 'client'
    );
  END IF;
END;
$function$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261113170000', 'no_reschedule_offer_after_start')
ON CONFLICT DO NOTHING;

COMMIT;
