-- Tells the provider when a booking request becomes confirmed (user request
-- 2026-11-02). handle_booking_status_change() only tells the client on
-- pending -> confirmed; providers only got booking_confirmed on instant bookings.
--
-- Its own trigger rather than an edit to handle_booking_status_change(): that
-- function is a long CREATE OR REPLACE, and rewriting it risks reverting another
-- session's unapplied change with no error.
--
-- Group bookings send one notice, from the earliest booking, like the client's.
-- The provider row is skipped if this booking already has one.

BEGIN;

CREATE OR REPLACE FUNCTION public.notify_provider_request_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_provider_user_id  uuid;
  v_representative_id uuid;
  v_client            text := COALESCE(NULLIF(trim(NEW.customer_name), ''), 'A client');
  v_when              text := TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || ' at ' || public.format_notification_time(NEW.booking_time);
BEGIN
  IF NEW.group_booking_id IS NOT NULL THEN
    SELECT id INTO v_representative_id
      FROM public.bookings
     WHERE group_booking_id = NEW.group_booking_id
       AND user_id = NEW.user_id
       AND provider_id = NEW.provider_id
     ORDER BY booking_date ASC, booking_time ASC, id ASC
     LIMIT 1;
    IF v_representative_id IS DISTINCT FROM NEW.id THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT p.user_id INTO v_provider_user_id
    FROM public.providers p WHERE p.id = NEW.provider_id;
  IF v_provider_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.notifications n
     WHERE n.booking_id = NEW.id
       AND n.type = 'booking_confirmed'
       AND n.recipient_role = 'provider'
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
  VALUES (
    v_provider_user_id, 'booking_confirmed', 'Booking Confirmed',
    CASE WHEN NEW.group_booking_id IS NOT NULL
      THEN v_client || ': ' || COALESCE(NEW.group_booking_count, 1)::text || ' services confirmed, starting with ' ||
           COALESCE(NEW.service_name_snapshot, 'their first service') || ' on ' || v_when || '.'
      ELSE v_client || ': ' || COALESCE(NEW.service_name_snapshot, 'booking') || ' confirmed for ' || v_when || '.'
    END,
    'medium', FALSE, NEW.id, NEW.provider_id, 'provider'
  );
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS on_booking_request_confirmed_tell_provider ON public.bookings;
CREATE TRIGGER on_booking_request_confirmed_tell_provider
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW
  WHEN (OLD.status = 'pending' AND NEW.status = 'confirmed')
  EXECUTE FUNCTION public.notify_provider_request_confirmed();

COMMIT;
