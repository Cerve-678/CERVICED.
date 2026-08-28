-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260717170407
-- Remote name: quiet_hours_reminder_push
-- Do not edit this recovery archive; create a new tracked migration for changes.

create or replace function public.send_push_on_notification_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  v_key TEXT;
BEGIN
  -- Quiet hours: hold non-urgent RECURRING REMINDER pushes overnight (local time).
  -- The in-app notification row still exists; we just don't buzz the phone. Event
  -- notifications (bookings, messages, payments) are unaffected and push anytime.
  IF NEW.type IN (
        'booking_pending','provider_message','balance_reminder',
        'reschedule_request','intake_form_reminder','booking_not_started'
     )
     AND (
        EXTRACT(HOUR FROM (now() AT TIME ZONE 'Europe/London')) >= 21
        OR EXTRACT(HOUR FROM (now() AT TIME ZONE 'Europe/London')) < 8
     ) THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
   WHERE name = 'service_role_key'
   LIMIT 1;

  IF v_key IS NULL OR v_key = '' OR v_key LIKE '<%' THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := 'https://ztrfpfvvejzaysrelmfm.supabase.co/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := jsonb_build_object(
      'type',   TG_OP,
      'table',  TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', row_to_json(NEW)
    ),
    timeout_milliseconds := 15000
  );
  RETURN NEW;
END;
$$;
