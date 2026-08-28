-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260817152938
-- Remote name: manual_booking_scheduling_policy_override
-- Do not edit this recovery archive; create a new tracked migration for changes.

CREATE OR REPLACE FUNCTION public.enforce_booking_bookability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_window_days INTEGER;
  v_notice_hours INTEGER;
  v_has_override BOOLEAN;
  v_fits_window BOOLEAN;
  v_legacy_open TIME;
  v_legacy_close TIME;
  v_legacy_closed BOOLEAN;
  v_bypass_hours BOOLEAN;
  v_bypass_policy BOOLEAN;
BEGIN
  SELECT booking_window_days, min_booking_notice_hrs
    INTO v_window_days, v_notice_hours
    FROM public.providers WHERE id = NEW.provider_id;

  IF NEW.booking_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Booking date cannot be in the past';
  END IF;

  IF NEW.booking_date = CURRENT_DATE AND NEW.booking_time <= LOCALTIME THEN
    RAISE EXCEPTION 'That time has already passed today';
  END IF;

  v_bypass_policy := COALESCE(current_setting('cerviced.bypass_scheduling_policy', true), 'off') = 'on';

  IF NOT v_bypass_policy THEN
    IF COALESCE(v_window_days, 60) > 0
       AND NEW.booking_date > CURRENT_DATE + COALESCE(v_window_days, 60) THEN
      RAISE EXCEPTION 'Booking is outside this provider''s booking window';
    END IF;
    IF COALESCE(v_notice_hours, 0) > 0
       AND (NEW.booking_date + NEW.booking_time) < now() + make_interval(hours => v_notice_hours) THEN
      RAISE EXCEPTION 'This appointment does not meet the provider''s minimum notice';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.provider_blocked_dates
      WHERE provider_id = NEW.provider_id AND blocked_date = NEW.booking_date
    ) THEN RAISE EXCEPTION 'Provider is unavailable on this date'; END IF;
  END IF;

  v_bypass_hours := COALESCE(current_setting('cerviced.bypass_working_hours', true), 'off') = 'on';

  IF NOT v_bypass_hours THEN
    SELECT EXISTS (
      SELECT 1 FROM public.provider_availability_overrides
       WHERE provider_id = NEW.provider_id AND availability_date = NEW.booking_date
    ) INTO v_has_override;
    IF v_has_override AND EXISTS (
      SELECT 1 FROM public.provider_availability_overrides
       WHERE provider_id = NEW.provider_id AND availability_date = NEW.booking_date AND is_closed
    ) THEN RAISE EXCEPTION 'Provider is unavailable on this date'; END IF;

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
    IF NOT COALESCE(v_fits_window, FALSE) THEN
      RAISE EXCEPTION 'This appointment is outside the provider''s working hours';
    END IF;
  END IF;

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

REVOKE ALL ON FUNCTION public.enforce_booking_bookability() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.provider_create_manual_booking(
  p_client_user_id uuid,
  p_service_id uuid,
  p_booking_date date,
  p_booking_time time without time zone,
  p_notes text DEFAULT NULL::text,
  p_add_on_ids uuid[] DEFAULT '{}'::uuid[],
  p_safety_ack boolean DEFAULT false,
  p_override_scheduling boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
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
  v_safety_required boolean;
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

  v_safety_required := COALESCE(v_service.patch_test_required, false)
    OR v_service.is_pregnancy_safe = false;
  IF v_safety_required AND NOT COALESCE(p_safety_ack, false) THEN
    RAISE EXCEPTION 'Please confirm the client has been told this treatment''s safety requirements';
  END IF;

  v_end_time := p_booking_time + make_interval(mins => v_service.duration_minutes);

  IF p_add_on_ids IS NOT NULL AND array_length(p_add_on_ids, 1) > 0 THEN
    SELECT COALESCE(SUM(sao.price), 0) INTO v_add_ons_total
      FROM public.service_add_ons sao
     WHERE sao.id = ANY(p_add_on_ids)
       AND sao.service_id = p_service_id
       AND sao.is_active = TRUE;
  END IF;

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

  PERFORM set_config('cerviced.bypass_working_hours', 'on', true);

  IF p_override_scheduling THEN
    PERFORM set_config('cerviced.bypass_scheduling_policy', 'on', true);
  END IF;

  INSERT INTO public.bookings (
    user_id, provider_id, service_id, status,
    booking_date, booking_time, end_time, notes,
    payment_type, base_price, add_ons_total, service_charge,
    deposit_amount, amount_paid, remaining_balance, payment_status,
    provider_name_snapshot, service_name_snapshot, service_category_snapshot,
    provider_logo_snapshot, customer_name, customer_email, customer_phone,
    safety_ack_required, safety_ack_at
  ) VALUES (
    v_client.id, v_provider.id, v_service.id, 'on_hold',
    p_booking_date, p_booking_time, v_end_time, NULLIF(btrim(p_notes), ''),
    'full', v_service.price, v_add_ons_total, 0,
    0, 0, v_service.price + v_add_ons_total, 'pending',
    v_provider.display_name, v_service.name, v_provider.service_category,
    v_provider.logo_url, v_client.name, v_client.email, v_client.phone,
    v_safety_required, CASE WHEN v_safety_required THEN now() ELSE NULL END
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

REVOKE ALL ON FUNCTION public.provider_create_manual_booking(uuid, uuid, date, time, text, uuid[], boolean, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provider_create_manual_booking(uuid, uuid, date, time, text, uuid[], boolean, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.provider_create_manual_booking(uuid, uuid, date, time, text, uuid[], boolean, boolean) TO authenticated;

DROP FUNCTION IF EXISTS public.provider_create_manual_booking(uuid, uuid, date, time, text, uuid[], boolean);
