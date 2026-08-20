-- Persist add-ons on a provider's manual booking.
--
-- BUG: AddBookingScreen.tsx lets a provider tick add-ons for the chosen
-- service, but provider_create_manual_booking() (20260810171124_booking_
-- authority_and_provider_manual_bookings.sql, later touched by
-- 20260816120000_manual_booking_working_hours_bypass.sql for the working-
-- hours bypass) has never taken an add-on param — the UI collected them and
-- silently dropped them on submit. The screen even carried its own inline
-- notice saying so ("Add-ons are shown here but aren't saved to the booking
-- yet").
--
-- FIX: add p_add_on_ids uuid[] DEFAULT '{}'. Prices/names are resolved
-- SERVER-SIDE from service_add_ons — the client sends only ids, never a
-- price, so a modified client can't book a discounted/fabricated add-on.
-- Only add-ons that (a) belong to the chosen service and (b) are still
-- is_active are honoured; anything else in the array is silently ignored
-- (mirrors how a since-deactivated add-on would already fail a client-side
-- checkout rather than erroring the whole booking). add_ons_total and
-- remaining_balance are recomputed to include the resolved add-on sum,
-- matching the pattern in the client-side createBooking()/booking_add_ons
-- insert (databaseService.ts).
--
-- Adding a 6th parameter changes the function's signature, so a bare
-- CREATE OR REPLACE would leave the old 5-arg overload alongside the new
-- 6-arg one rather than replacing it — the app would silently keep calling
-- whichever Postgres/PostgREST resolves to (ambiguous, and either way it'd
-- leave a stale, wrongly-permissioned overload lying around). DROP the old
-- signature explicitly first.
--
-- Safe to re-run.

DROP FUNCTION IF EXISTS public.provider_create_manual_booking(uuid, uuid, date, time, text);

CREATE OR REPLACE FUNCTION public.provider_create_manual_booking(
  p_client_user_id uuid,
  p_service_id uuid,
  p_booking_date date,
  p_booking_time time,
  p_notes text DEFAULT NULL,
  p_add_on_ids uuid[] DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_provider public.providers%ROWTYPE;
  v_service public.services%ROWTYPE;
  v_client public.users%ROWTYPE;
  v_booking_id uuid;
  v_end_time time;
  v_daily_booking_cap integer;
  v_active_booking_count integer;
  v_add_ons_total numeric(10,2) := 0;
BEGIN
  SELECT p.* INTO v_provider
    FROM public.providers p
   WHERE p.user_id = auth.uid()
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only the owning provider can add a booking';
  END IF;

  SELECT s.* INTO v_service
    FROM public.services s
   WHERE s.id = p_service_id
     AND s.provider_id = v_provider.id
     AND s.is_active = TRUE
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service is not active for this provider';
  END IF;

  SELECT u.* INTO v_client
    FROM public.users u
   WHERE u.id = p_client_user_id
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client account was not found';
  END IF;

  IF p_booking_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Booking date cannot be in the past';
  END IF;
  IF p_booking_time IS NULL THEN
    RAISE EXCEPTION 'Booking time is required';
  END IF;

  v_end_time := p_booking_time + make_interval(mins => v_service.duration_minutes);

  -- Server-resolved add-on total — never trust a client-sent price. Only
  -- add-ons that belong to this exact service and are still active count;
  -- ids for a different service or a deactivated add-on are silently
  -- dropped rather than failing the whole booking.
  IF p_add_on_ids IS NOT NULL AND array_length(p_add_on_ids, 1) > 0 THEN
    SELECT COALESCE(SUM(sao.price), 0) INTO v_add_ons_total
      FROM public.service_add_ons sao
     WHERE sao.id = ANY(p_add_on_ids)
       AND sao.service_id = p_service_id
       AND sao.is_active = TRUE;
  END IF;

  -- A provider's capacity is an additional guard on top of time overlap.
  -- Count the same active states used by the booking availability trigger.
  v_daily_booking_cap := COALESCE(v_provider.max_bookings_per_day, 0);
  IF v_daily_booking_cap > 0 THEN
    SELECT count(*) INTO v_active_booking_count
      FROM public.bookings b
     WHERE b.provider_id = v_provider.id
       AND b.booking_date = p_booking_date
       AND b.status IN ('pending', 'confirmed', 'in_progress', 'on_hold');
    IF v_active_booking_count >= v_daily_booking_cap THEN
      RAISE EXCEPTION 'This provider has reached their booking limit for that date';
    END IF;
  END IF;

  -- Squeeze-in support: this provider is deliberately booking outside their
  -- own configured working hours (early/late/closed day). Every other
  -- bookability rule — past-date, booking-window-days, minimum-notice,
  -- blocked-dates, and same-day overlap — still applies unconditionally via
  -- enforce_booking_bookability() below; only its working-hours fit check is
  -- skipped, and only for this INSERT. Transaction-local (is_local = true),
  -- so it cannot affect any other statement or connection.
  PERFORM set_config('cerviced.bypass_working_hours', 'on', true);

  -- Insert as a hold first so the normal booking-created trigger stays quiet;
  -- the function then atomically promotes it and emits the correct pair of
  -- notifications below. Existing schedule and no-overlap triggers run on
  -- both statements and remain the final authority.
  INSERT INTO public.bookings (
    user_id, provider_id, service_id, status,
    booking_date, booking_time, end_time, notes,
    payment_type, base_price, add_ons_total, service_charge,
    deposit_amount, amount_paid, remaining_balance, payment_status,
    provider_name_snapshot, service_name_snapshot, service_category_snapshot,
    provider_logo_snapshot, customer_name, customer_email, customer_phone
  ) VALUES (
    v_client.id, v_provider.id, v_service.id, 'on_hold',
    p_booking_date, p_booking_time, v_end_time, NULLIF(btrim(p_notes), ''),
    'full', v_service.price, v_add_ons_total, 0,
    0, 0, v_service.price + v_add_ons_total, 'pending',
    v_provider.display_name, v_service.name, v_service.category_name,
    v_provider.logo_url, v_client.name, v_client.email, v_client.phone
  ) RETURNING id INTO v_booking_id;

  IF p_add_on_ids IS NOT NULL AND array_length(p_add_on_ids, 1) > 0 THEN
    INSERT INTO public.booking_add_ons (booking_id, add_on_id, name_snapshot, price_snapshot)
    SELECT v_booking_id, sao.id, sao.name, sao.price
      FROM public.service_add_ons sao
     WHERE sao.id = ANY(p_add_on_ids)
       AND sao.service_id = p_service_id
       AND sao.is_active = TRUE;
  END IF;

  UPDATE public.bookings
     SET status = 'confirmed', confirmed_at = now()
   WHERE id = v_booking_id;

  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
  VALUES (
    v_client.id, 'booking_confirmed', 'Booking Confirmed! 🎉',
    v_provider.display_name || ' booked your ' || v_service.name ||
      ' for ' || to_char(p_booking_date, 'DD Mon YYYY') ||
      ' at ' || to_char(p_booking_time, 'HH12:MI AM') || '.',
    'high', TRUE, v_booking_id, v_provider.id, 'client'
  );
  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
  VALUES (
    v_provider.user_id, 'booking_confirmed', 'Manual Booking Added',
    COALESCE(v_client.name, 'Client') || ' was added for ' || v_service.name ||
      ' on ' || to_char(p_booking_date, 'DD Mon YYYY') ||
      ' at ' || to_char(p_booking_time, 'HH12:MI AM') || '.',
    'medium', FALSE, v_booking_id, v_provider.id, 'provider'
  );

  RETURN v_booking_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.provider_create_manual_booking(uuid, uuid, date, time, text, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provider_create_manual_booking(uuid, uuid, date, time, text, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.provider_create_manual_booking(uuid, uuid, date, time, text, uuid[]) TO authenticated;

-- VERIFY
--   select proname, pronargs from pg_proc where pronamespace = 'public'::regnamespace
--     and proname = 'provider_create_manual_booking';
--     -> expect exactly ONE row, pronargs = 6 (old 5-arg overload dropped)
--   select proacl from pg_proc where pronamespace = 'public'::regnamespace
--     and proname = 'provider_create_manual_booking';
--     -> expect authenticated=X present, no anon=X entry
