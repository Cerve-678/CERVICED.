-- The provider's notice when a request is confirmed (20261103000000) now reads
-- exactly like the one they get for an instant booking (user decision
-- 2026-11-03): "New Booking", high priority, one per booking, and the same
-- sentence claim_cart_booking_slots() writes.
--
-- Redefines a function only 20261103000000 wrote; the md5 guard stops if live
-- has changed since.

BEGIN;

DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.notify_provider_request_confirmed()'::regprocedure))
     <> '3b5426975cf93433a0be7b25a7a9a47c' THEN
    RAISE EXCEPTION 'notify_provider_request_confirmed() changed on live since 20261103000000; re-read it before applying';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.notify_provider_request_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_provider_user_id uuid;
BEGIN
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
    v_provider_user_id, 'booking_confirmed', 'New Booking',
    COALESCE(NEW.customer_name, 'A client') || ' booked ' || NEW.service_name_snapshot ||
      ' for ' || public.format_notification_date(NEW.booking_date) ||
      ' at ' || public.format_notification_time(NEW.booking_time) ||
      '. Check their client profile for anything important.',
    'high', FALSE, NEW.id, NEW.provider_id, 'provider'
  );
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.notify_provider_request_confirmed() FROM PUBLIC, anon, authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261103050000', 'provider_request_confirmed_reads_like_new_booking')
ON CONFLICT DO NOTHING;

COMMIT;
