-- Manual bookings wrote the wrong thing to bookings.service_category_snapshot.
--
-- That column is what BookingsScreen groups its category rows by: the read
-- path is bookingService.ts (`providerService: db.service_category_snapshot`)
-- → resolveServiceCategory() → the category header above each row of cards.
--
-- The two write paths disagreed about what the column means:
--
--   client cart (BookingContext.tsx) → item.providerService
--                                    = providers.service_category  ("AESTHETICS")
--   provider_create_manual_booking() → v_service.category_name     ("Dermal Fillers")
--
-- services.category_name is the provider's own sub-grouping of their menu
-- (Dermal Fillers, Bridal Makeup, French tips…), NOT the top-level business
-- category. Writing it here made every manual booking open a brand-new
-- category row on the client's Bookings screen — one holding a single card,
-- headed with the service's category, sitting alongside the provider's real
-- category row. Because BookingCard already prints booking.serviceName under
-- the logo, the service then appeared to be named twice.
--
-- Fix: write providers.service_category, matching the client path exactly, so
-- a manually-added booking files into the same category row as every other
-- booking for that provider. Nothing else in the function changes.
--
-- Verified live before writing: of 27 non-null snapshots, 26 held the
-- business category and exactly 1 ("Dermal Fillers") held a service category
-- — the single manual booking. That row is corrected at the bottom.

CREATE OR REPLACE FUNCTION public.provider_create_manual_booking(
  p_client_user_id uuid,
  p_service_id uuid,
  p_booking_date date,
  p_booking_time time without time zone,
  p_notes text DEFAULT NULL::text,
  p_add_on_ids uuid[] DEFAULT '{}'::uuid[],
  p_safety_ack boolean DEFAULT false
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

  -- Safety acknowledgement gate.
  v_safety_required := COALESCE(v_service.patch_test_required, false)
    OR v_service.is_pregnancy_safe = false;
  IF v_safety_required AND NOT COALESCE(p_safety_ack, false) THEN
    RAISE EXCEPTION 'Please confirm the client has been told this treatment''s safety requirements';
  END IF;

  v_end_time := p_booking_time + make_interval(mins => v_service.duration_minutes);

  -- Server-resolved add-on total — never trust a client-sent price. Only
  -- add-ons that belong to this exact service and are still active count.
  IF p_add_on_ids IS NOT NULL AND array_length(p_add_on_ids, 1) > 0 THEN
    SELECT COALESCE(SUM(sao.price), 0) INTO v_add_ons_total
      FROM public.service_add_ons sao
     WHERE sao.id = ANY(p_add_on_ids)
       AND sao.service_id = p_service_id
       AND sao.is_active = TRUE;
  END IF;

  -- A provider's capacity is an additional guard on top of time overlap.
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

  -- Squeeze-in support: skip only the working-hours fit check, and only for
  -- this INSERT. Transaction-local, cannot affect any other statement.
  PERFORM set_config('cerviced.bypass_working_hours', 'on', true);

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
    -- CHANGED: providers.service_category (the top-level business category the
    -- client's Bookings screen groups by), not services.category_name (the
    -- provider's own menu sub-grouping). Matches the client cart path.
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

-- Grants are re-asserted because CREATE OR REPLACE on a SECURITY DEFINER
-- function is exactly where an accidental anon EXECUTE would slip back in.
REVOKE ALL ON FUNCTION public.provider_create_manual_booking(uuid, uuid, date, time, text, uuid[], boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provider_create_manual_booking(uuid, uuid, date, time, text, uuid[], boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.provider_create_manual_booking(uuid, uuid, date, time, text, uuid[], boolean) TO authenticated;

-- Backfill: repoint bookings this bug already mis-filed — a NON-NULL snapshot
-- that disagrees with the provider's service_category (i.e. it holds the
-- service's category_name instead). Safe to re-run; corrects nothing that is
-- already right.
--
-- Deliberately scoped to non-null snapshots only. Older rows with a NULL
-- snapshot (abandoned "Reserving…" holds, pre-dating the column) are a
-- separate, pre-existing gap — resolveServiceCategory() already falls back to
-- keyword-matching the service name for those, so they are not part of this
-- defect and are left alone rather than silently rewritten here.
UPDATE public.bookings b
   SET service_category_snapshot = p.service_category
  FROM public.providers p
 WHERE p.id = b.provider_id
   AND p.service_category IS NOT NULL
   AND b.service_category_snapshot IS NOT NULL
   AND b.service_category_snapshot IS DISTINCT FROM p.service_category;
