-- Every client is emailed the address once it's shared, and the reminder
-- before their appointment.
--
-- Both were app notifications only. A client who booked on the website (or
-- who turned notifications off) never heard either, so could turn up without
-- the address. User decision 2026-11-23: email them to every client.
--
-- The email is asked for when the notification row is written, so it follows
-- the notification's own rules with nothing duplicated here: the provider's
-- address release setting (notify_address_released, from auto_release_address
-- and process_address_release_notifications), their reminder timing and the
-- client's reminder switch (process_client_appointment_reminders), one notice
-- per group booking, and throttle_reminder_notifications (a row it drops is
-- never inserted, so never emailed).
--
-- send-booking-update-email decides the rest from the row: it re-checks the
-- booking is still on, sends an address only once booking_released_venue
-- returns it (never for a mobile provider, who comes to the client), and
-- emails only the reminder nearest the appointment. Sent once per
-- notification (Resend idempotency key); not retried.
--
-- New function and trigger; nothing live is redefined. Numbered above the
-- live frontier (20261125140000, declined_payment_tells_client).

BEGIN;

CREATE OR REPLACE FUNCTION public.queue_booking_update_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_key text;
BEGIN
  IF NEW.booking_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
   WHERE name = 'service_role_key'
   LIMIT 1;

  -- Key not configured: skip quietly, as the push trigger does.
  IF v_key IS NULL OR v_key = '' OR v_key LIKE '<%' THEN
    RETURN NEW;
  END IF;

  -- The notification must never fail because an email couldn't be queued.
  BEGIN
    PERFORM net.http_post(
      url     := 'https://ztrfpfvvejzaysrelmfm.supabase.co/functions/v1/send-booking-update-email',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body    := jsonb_build_object('notificationId', NEW.id),
      timeout_milliseconds := 15000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'queue_booking_update_email: % for notification %', SQLERRM, NEW.id;
  END;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.queue_booking_update_email() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS queue_booking_update_email_trigger ON public.notifications;
CREATE TRIGGER queue_booking_update_email_trigger
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  WHEN (NEW.type IN ('address_released', 'booking_reminder'))
  EXECUTE FUNCTION public.queue_booking_update_email();

COMMIT;
