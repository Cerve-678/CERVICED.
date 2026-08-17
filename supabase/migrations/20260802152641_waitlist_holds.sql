-- Waitlist redesign: real time-boxed holds instead of a bare notification.
-- handle_new_booking() below is PATCHED from the source file: the file's
-- own version was written against a stale baseline that predates
-- recipient_role tagging and the auto-accept dedup fix (it would have
-- silently reverted both). This version keeps the file's only intended
-- change — the on_hold early-return guard — on top of the actual current
-- live function body.

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_status_check CHECK (status IN (
    'pending','confirmed','in_progress','completed','cancelled','no_show','on_hold'
  ));

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS hold_expires_at TIMESTAMPTZ;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS waitlist_entry_id UUID
  REFERENCES public.provider_waitlist(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.handle_new_booking()
RETURNS TRIGGER AS $$
DECLARE
  v_provider_user_id UUID;
  v_auto_accept      BOOLEAN;
BEGIN
  IF NEW.status = 'on_hold' THEN
    RETURN NEW;
  END IF;

  SELECT p.user_id, p.auto_accept_bookings
    INTO v_provider_user_id, v_auto_accept
    FROM public.providers p
   WHERE p.id = NEW.provider_id;

  IF v_auto_accept THEN
    UPDATE public.bookings
       SET status = 'confirmed', confirmed_at = NOW()
     WHERE id = NEW.id;

    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      v_provider_user_id,
      'booking_confirmed',
      'You have a new booking',
      COALESCE(NEW.customer_name, 'A client') || ' booked ' ||
        NEW.service_name_snapshot ||
        ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') ||
        ' at ' || TO_CHAR(NEW.booking_time, 'HH12:MI AM') || '.',
      'high', FALSE, NEW.id, NEW.provider_id, 'provider'
    );

  ELSE
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      NEW.user_id,
      'booking_pending',
      'Booking Request Sent',
      'Your request with ' || NEW.provider_name_snapshot ||
        ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') ||
        ' at ' || TO_CHAR(NEW.booking_time, 'HH12:MI AM') ||
        ' is awaiting confirmation.',
      'high', TRUE, NEW.id, NEW.provider_id, 'client'
    );

    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      v_provider_user_id,
      'booking_pending',
      'New Booking Request',
      COALESCE(NEW.customer_name, 'A client') || ' requested ' ||
        NEW.service_name_snapshot ||
        ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') ||
        '. Please confirm or decline.',
      'high', TRUE, NEW.id, NEW.provider_id, 'provider'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.enforce_booking_bookability()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_window_days INTEGER;
  v_notice_hours INTEGER;
  v_has_override BOOLEAN;
  v_fits_window BOOLEAN;
  v_legacy_open TIME;
  v_legacy_close TIME;
  v_legacy_closed BOOLEAN;
BEGIN
  SELECT booking_window_days, min_booking_notice_hrs
    INTO v_window_days, v_notice_hours
    FROM public.providers WHERE id = NEW.provider_id;

  IF NEW.booking_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Booking date cannot be in the past';
  END IF;
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

  IF EXISTS (
    SELECT 1 FROM public.bookings b
     WHERE b.provider_id = NEW.provider_id AND b.booking_date = NEW.booking_date
       AND b.status IN ('pending', 'confirmed', 'in_progress', 'on_hold')
       AND b.id IS DISTINCT FROM NEW.id
       AND NEW.booking_time < b.end_time AND NEW.end_time > b.booking_time
  ) THEN RAISE EXCEPTION 'That time is no longer available'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE VIEW public.client_bookings
WITH (security_invoker = true) AS
SELECT
  b.id, b.user_id, b.provider_id, b.service_id, b.status,
  b.booking_date, b.booking_time, b.end_time, b.notes, b.booking_instructions,
  b.payment_type, b.base_price, b.add_ons_total, b.service_charge, b.deposit_amount,
  b.amount_paid, b.remaining_balance, b.payment_status, b.payment_method, b.payment_intent_id,
  b.is_group_booking, b.group_booking_id, b.group_booking_count,
  b.provider_name_snapshot, b.service_name_snapshot, b.service_category_snapshot, b.provider_logo_snapshot,
  CASE WHEN public.is_address_released(b.status, p.address_release_policy, b.address_released_at, b.booking_date, b.booking_time)
       THEN b.provider_address_snapshot ELSE NULL END AS provider_address_snapshot,
  b.provider_phone_snapshot,
  CASE WHEN public.is_address_released(b.status, p.address_release_policy, b.address_released_at, b.booking_date, b.booking_time)
       THEN b.provider_coordinates ELSE NULL END AS provider_coordinates,
  b.customer_name, b.customer_email, b.customer_phone,
  b.confirmed_at, b.address_released_at, b.client_address,
  b.occasion_type, b.style_request, b.reference_image_url,
  b.created_at, b.updated_at,
  (SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.id), '[]'::jsonb)
     FROM public.booking_add_ons a WHERE a.booking_id = b.id) AS add_ons,
  jsonb_build_object('logo_url', p.logo_url) AS provider
FROM public.bookings b
LEFT JOIN public.providers p ON p.id = b.provider_id
WHERE b.status != 'on_hold';

GRANT SELECT ON public.client_bookings TO authenticated;

DROP FUNCTION IF EXISTS public.invite_next_waitlist_entry(UUID, UUID, DATE, TIME, TIME, NUMERIC, NUMERIC, NUMERIC, TEXT);

CREATE OR REPLACE FUNCTION public.invite_next_waitlist_entry(
  p_provider_id UUID,
  p_service_id  UUID,
  p_booking_date DATE DEFAULT NULL,
  p_booking_time TIME DEFAULT NULL,
  p_end_time TIME DEFAULT NULL,
  p_base_price NUMERIC DEFAULT NULL,
  p_add_ons_total NUMERIC DEFAULT NULL,
  p_service_charge NUMERIC DEFAULT NULL,
  p_service_category_snapshot TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  w                   RECORD;
  v_waitlist_enabled  BOOLEAN;
  v_auto_accept       BOOLEAN;
  v_new_booking_id    UUID;
BEGIN
  SELECT COALESCE((automation_settings->>'waitlistEnabled')::boolean, TRUE),
         COALESCE((automation_settings->>'autoAcceptWaitlist')::boolean, FALSE)
    INTO v_waitlist_enabled, v_auto_accept
    FROM public.providers WHERE id = p_provider_id;

  IF NOT COALESCE(v_waitlist_enabled, TRUE) THEN
    RETURN;
  END IF;
  IF p_booking_date IS NULL OR p_booking_time IS NULL THEN
    RETURN;
  END IF;

  FOR w IN
    SELECT *
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
              position ASC
  LOOP
    BEGIN
      IF v_auto_accept THEN
        INSERT INTO public.bookings (
          user_id, provider_id, service_id, status,
          booking_date, booking_time, end_time,
          payment_type, base_price, add_ons_total, service_charge,
          deposit_amount, amount_paid, remaining_balance, payment_status,
          is_group_booking, group_booking_count,
          provider_name_snapshot, service_name_snapshot, service_category_snapshot,
          customer_name, waitlist_entry_id
        ) VALUES (
          w.user_id, p_provider_id, p_service_id, 'pending',
          p_booking_date, p_booking_time, p_end_time,
          'full', COALESCE(p_base_price, 0), COALESCE(p_add_ons_total, 0), COALESCE(p_service_charge, 0),
          0, 0, COALESCE(p_base_price, 0) + COALESCE(p_add_ons_total, 0) + COALESCE(p_service_charge, 0), 'pending',
          FALSE, 1,
          w.provider_name_snapshot, w.service_name_snapshot, p_service_category_snapshot,
          w.user_name_snapshot, w.id
        )
        RETURNING id INTO v_new_booking_id;

        UPDATE public.provider_waitlist SET status = 'booked', notified_at = NOW() WHERE id = w.id;
        RETURN;
      ELSE
        INSERT INTO public.bookings (
          user_id, provider_id, service_id, status,
          booking_date, booking_time, end_time,
          payment_type, base_price, add_ons_total, service_charge,
          deposit_amount, amount_paid, remaining_balance, payment_status,
          is_group_booking, group_booking_count,
          provider_name_snapshot, service_name_snapshot, service_category_snapshot,
          customer_name, waitlist_entry_id, hold_expires_at
        ) VALUES (
          w.user_id, p_provider_id, p_service_id, 'on_hold',
          p_booking_date, p_booking_time, p_end_time,
          'full', COALESCE(p_base_price, 0), COALESCE(p_add_ons_total, 0), COALESCE(p_service_charge, 0),
          0, 0, COALESCE(p_base_price, 0) + COALESCE(p_add_ons_total, 0) + COALESCE(p_service_charge, 0), 'pending',
          FALSE, 1,
          w.provider_name_snapshot, w.service_name_snapshot, p_service_category_snapshot,
          w.user_name_snapshot, w.id, NOW() + INTERVAL '3 hours'
        )
        RETURNING id INTO v_new_booking_id;

        UPDATE public.provider_waitlist SET status = 'notified', notified_at = NOW() WHERE id = w.id;

        INSERT INTO public.notifications
          (user_id, type, title, message, priority, is_actionable, provider_id, recipient_role, booking_id)
        VALUES (
          w.user_id,
          'waitlist_slot_available',
          'A slot opened up!',
          w.service_name_snapshot || ' with ' || w.provider_name_snapshot ||
            ' — ' || TO_CHAR(p_booking_date, 'DD Mon') || ' at ' || TO_CHAR(p_booking_time, 'HH12:MI AM') ||
            ' is held for you for 3 hours. Confirm now before it goes to the next person.',
          'high',
          TRUE,
          p_provider_id,
          'client',
          v_new_booking_id
        );
        RETURN;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.expire_waitlist_holds()
RETURNS VOID AS $$
DECLARE
  h RECORD;
BEGIN
  FOR h IN
    SELECT id, provider_id, service_id, booking_date, booking_time, end_time,
           base_price, add_ons_total, service_charge, service_category_snapshot,
           waitlist_entry_id
      FROM public.bookings
     WHERE status = 'on_hold' AND hold_expires_at < NOW()
  LOOP
    UPDATE public.bookings SET status = 'cancelled', hold_expires_at = NULL WHERE id = h.id;
    IF h.waitlist_entry_id IS NOT NULL THEN
      UPDATE public.provider_waitlist SET status = 'expired' WHERE id = h.waitlist_entry_id;
    END IF;

    PERFORM public.invite_next_waitlist_entry(
      h.provider_id, h.service_id, h.booking_date, h.booking_time, h.end_time,
      h.base_price, h.add_ons_total, h.service_charge, h.service_category_snapshot
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'expire-waitlist-holds';
SELECT cron.schedule('expire-waitlist-holds', '*/15 * * * *', $$SELECT public.expire_waitlist_holds();$$);

CREATE OR REPLACE FUNCTION public.claim_waitlist_hold(p_booking_id UUID)
RETURNS VOID AS $$
DECLARE
  v_booking RECORD;
  v_auto_accept_bookings BOOLEAN;
  v_provider_user_id UUID;
BEGIN
  SELECT * INTO v_booking FROM public.bookings
   WHERE id = p_booking_id AND status = 'on_hold' AND hold_expires_at > NOW();
  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'This hold has expired or no longer exists';
  END IF;
  IF v_booking.user_id != auth.uid() THEN
    RAISE EXCEPTION 'Not your hold';
  END IF;

  SELECT p.auto_accept_bookings, p.user_id
    INTO v_auto_accept_bookings, v_provider_user_id
    FROM public.providers p WHERE p.id = v_booking.provider_id;

  IF COALESCE(v_auto_accept_bookings, FALSE) THEN
    UPDATE public.bookings
       SET status = 'confirmed', hold_expires_at = NULL, confirmed_at = NOW()
     WHERE id = p_booking_id;

    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      v_booking.user_id, 'booking_confirmed', 'Booking Confirmed! 🎉',
      v_booking.provider_name_snapshot || ' confirmed your booking for ' || v_booking.service_name_snapshot ||
        ' on ' || TO_CHAR(v_booking.booking_date, 'DD Mon YYYY') ||
        ' at ' || TO_CHAR(v_booking.booking_time, 'HH12:MI AM') || '.',
      'high', TRUE, p_booking_id, v_booking.provider_id, 'client'
    );

    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      v_provider_user_id, 'booking_confirmed', 'Waitlist Slot Filled',
      COALESCE(v_booking.customer_name, 'A client') || ' claimed the held slot for ' ||
        v_booking.service_name_snapshot ||
        ' on ' || TO_CHAR(v_booking.booking_date, 'DD Mon YYYY') ||
        ' at ' || TO_CHAR(v_booking.booking_time, 'HH12:MI AM') || ' — now fully booked.',
      'high', FALSE, p_booking_id, v_booking.provider_id, 'provider'
    );
  ELSE
    UPDATE public.bookings
       SET status = 'pending', hold_expires_at = NULL
     WHERE id = p_booking_id;

    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
    VALUES (
      v_booking.user_id, 'booking_pending', 'Booking Request Sent',
      'Your request with ' || v_booking.provider_name_snapshot ||
        ' on ' || TO_CHAR(v_booking.booking_date, 'DD Mon YYYY') ||
        ' at ' || TO_CHAR(v_booking.booking_time, 'HH12:MI AM') ||
        ' is awaiting confirmation.',
      'high', TRUE, p_booking_id, v_booking.provider_id
    );

    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
    SELECT
      p.user_id, 'booking_pending', 'New Booking Request',
      COALESCE(v_booking.customer_name, 'A client') || ' requested ' || v_booking.service_name_snapshot ||
        ' on ' || TO_CHAR(v_booking.booking_date, 'DD Mon YYYY') || '. Please confirm or decline.',
      'high', TRUE, p_booking_id, v_booking.provider_id
    FROM public.providers p WHERE p.id = v_booking.provider_id;
  END IF;

  IF v_booking.waitlist_entry_id IS NOT NULL THEN
    UPDATE public.provider_waitlist SET status = 'booked' WHERE id = v_booking.waitlist_entry_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.decline_waitlist_hold(p_booking_id UUID)
RETURNS VOID AS $$
DECLARE
  v_booking RECORD;
BEGIN
  SELECT * INTO v_booking FROM public.bookings
   WHERE id = p_booking_id AND status = 'on_hold';
  IF v_booking.id IS NULL THEN
    RETURN;
  END IF;
  IF v_booking.user_id != auth.uid() THEN
    RAISE EXCEPTION 'Not your hold';
  END IF;

  UPDATE public.bookings SET status = 'cancelled', hold_expires_at = NULL WHERE id = p_booking_id;
  IF v_booking.waitlist_entry_id IS NOT NULL THEN
    UPDATE public.provider_waitlist SET status = 'expired' WHERE id = v_booking.waitlist_entry_id;
  END IF;

  PERFORM public.invite_next_waitlist_entry(
    v_booking.provider_id, v_booking.service_id, v_booking.booking_date,
    v_booking.booking_time, v_booking.end_time, v_booking.base_price,
    v_booking.add_ons_total, v_booking.service_charge, v_booking.service_category_snapshot
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.claim_waitlist_hold(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_waitlist_hold(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.claim_waitlist_hold(UUID) FROM public;
REVOKE ALL ON FUNCTION public.decline_waitlist_hold(UUID) FROM public;
REVOKE EXECUTE ON FUNCTION public.claim_waitlist_hold(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.decline_waitlist_hold(UUID) FROM anon;;
