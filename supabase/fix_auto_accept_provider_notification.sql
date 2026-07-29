-- ════════════════════════════════════════════════════════════════════════════
-- fix_auto_accept_provider_notification.sql
-- handle_new_booking(): notifications on a brand-new booking.
--
--   • Auto-accept ON:
--       - confirm the booking immediately (status-change trigger then sends the
--         client "Booking Confirmed 🎉").
--       - the client gets NO "awaiting confirmation" notice — it would be
--         instantly contradicted by the confirmation, so it's pure noise.
--       - the PROVIDER is told a booking landed: title "New Booking"
--         (the push layer prepends the business name via recipient_role='provider',
--         so it reads "<Business> · New Booking"), body = client +
--         service + date/time.
--   • Auto-accept OFF (manual):
--       - client gets "Booking Request Sent … awaiting confirmation".
--       - provider gets "New Booking Request … confirm or decline".
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_booking()
RETURNS TRIGGER AS $$
DECLARE
  v_provider_user_id UUID;
  v_auto_accept      BOOLEAN;
BEGIN
  SELECT p.user_id, p.auto_accept_bookings
    INTO v_provider_user_id, v_auto_accept
    FROM public.providers p
   WHERE p.id = NEW.provider_id;

  IF v_auto_accept THEN
    -- Instant booking: confirm immediately. on_booking_status_changed
    -- (pending → confirmed) sends the client their "Booking Confirmed 🎉".
    UPDATE public.bookings
       SET status = 'confirmed', confirmed_at = NOW()
     WHERE id = NEW.id;

    -- Provider: a booking just landed (informational — nothing to confirm).
    -- Title "New Booking"; recipient_role='provider' makes the push
    -- layer render it as "<Business name> · New Booking".
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      v_provider_user_id,
      'booking_confirmed',
      'New Booking - ' || NEW.provider_name_snapshot,
      COALESCE(NEW.customer_name, 'A client') || ' booked ' ||
        NEW.service_name_snapshot ||
        ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') ||
        ' at ' || TO_CHAR(NEW.booking_time, 'HH12:MI AM') || '.',
      'high', FALSE, NEW.id, NEW.provider_id, 'provider'
    );

  ELSE
    -- Manual flow: tell the client their request is awaiting confirmation…
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

    -- …and tell the provider to confirm or decline.
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
