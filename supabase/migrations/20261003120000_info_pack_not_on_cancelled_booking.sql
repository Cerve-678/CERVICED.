-- A provider can't send an info pack on a cancelled booking.
--
-- attach_info_pack_to_booking() is the manual "Send Info Pack" path on the
-- provider's booking detail. It checked ownership but never the booking's
-- status, so a cancelled booking still pushed an "Info From Your Provider"
-- notification at a client who no longer has an appointment. The app hides
-- the button too, but the DB is the enforcement point.
--
-- The automatic paths already behave: handle_auto_send_intake_form() and
-- handle_attach_info_packs() run only on INSERT, and handle_new_info_pack()
-- only reaches pending/confirmed bookings.
--
-- Reproduced from the verified-live pg_get_functiondef (2026-10-03); the only
-- change is the status read and the guard. SECURITY DEFINER and search_path
-- preserved. Frontier at authoring: 20261003110000.

CREATE OR REPLACE FUNCTION public.attach_info_pack_to_booking(p_booking_id uuid, p_info_pack_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_pack     RECORD;
  v_booking  RECORD;
  v_provider RECORD;
  v_rows     INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be signed in';
  END IF;

  SELECT b.user_id, b.provider_id, b.service_name_snapshot, b.status
    INTO v_booking
    FROM public.bookings b
   WHERE b.id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  SELECT id, display_name
    INTO v_provider
    FROM public.providers
   WHERE id = v_booking.provider_id
     AND user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not owned by caller';
  END IF;

  IF v_booking.status = 'cancelled' THEN
    RAISE EXCEPTION 'This booking was cancelled, so you can''t send an info pack for it.';
  END IF;

  SELECT *
    INTO v_pack
    FROM public.info_packs
   WHERE id = p_info_pack_id
     AND provider_id = v_provider.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Info pack not found or not owned by caller';
  END IF;

  INSERT INTO public.booking_info_packs
    (booking_id, info_pack_id, provider_id, client_user_id, title, service, content)
  VALUES
    (p_booking_id, p_info_pack_id, v_provider.id, v_booking.user_id,
     v_pack.title, v_booking.service_name_snapshot, v_pack.content)
  ON CONFLICT (booking_id, info_pack_id) DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES
      (v_booking.user_id, 'info_pack_received', 'Info From Your Provider',
       COALESCE(v_provider.display_name, 'Your provider') || ' sent you "' || v_pack.title ||
         '" for your ' || v_booking.service_name_snapshot || ' — open the booking to read it.',
       'medium', TRUE, p_booking_id, v_provider.id, 'client');
  END IF;
END;
$function$;
