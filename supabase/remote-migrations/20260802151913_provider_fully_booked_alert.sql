-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260802151913
-- Remote name: provider_fully_booked_alert
-- Do not edit this recovery archive; create a new tracked migration for changes.

ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS fully_booked_alert_last_sent_at TIMESTAMPTZ;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'booking_pending', 'booking_confirmed', 'booking_declined', 'booking_cancelled',
    'booking_reminder', 'booking_in_progress', 'booking_not_started', 'no_show',
    'payment_success', 'new_provider', 'reschedule_request', 'reschedule_provider_response',
    'reschedule_confirmed', 'review_request', 'review_received', 'promotion',
    'intake_form_reminder', 'intake_form_received', 'intake_form_completed',
    'info_pack_received', 'provider_message', 'announcement',
    'balance_reminder', 'waitlist_slot_available', 'new_message',
    'address_released', 'birthday_greeting', 'post_appt_check_in',
    'rebooking_nudge', 'daily_recap',
    'schedule_fully_booked'
  ));

CREATE OR REPLACE FUNCTION public.process_provider_fully_booked_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  r RECORD;
  d DATE;
  v_window_end DATE;
  v_open_minutes INT;
  v_booked_minutes INT;
  v_has_open_day BOOLEAN;
  v_fully_booked BOOLEAN;
BEGIN
  FOR r IN
    SELECT
      p.id AS provider_id,
      p.user_id AS provider_user_id,
      GREATEST(1, LEAST(90, COALESCE((p.automation_settings->>'fullyBookedAlertDays')::INT, 7))) AS alert_days
    FROM public.providers p
    WHERE p.is_active = TRUE
      AND p.has_gone_live = TRUE
      AND COALESCE((p.automation_settings->>'fullyBookedAlertEnabled')::BOOLEAN, FALSE) = TRUE
  LOOP
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.providers
       WHERE id = r.provider_id
         AND fully_booked_alert_last_sent_at IS NOT NULL
         AND fully_booked_alert_last_sent_at > NOW() - make_interval(days => r.alert_days)
    );

    v_window_end := CURRENT_DATE + r.alert_days;
    v_has_open_day := FALSE;
    v_fully_booked := TRUE;
    d := CURRENT_DATE;

    WHILE d <= v_window_end LOOP
      IF EXISTS (
        SELECT 1 FROM public.provider_blocked_dates
         WHERE provider_id = r.provider_id AND blocked_date = d
      ) THEN
        d := d + 1;
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1 FROM public.provider_availability_overrides
         WHERE provider_id = r.provider_id AND availability_date = d
      ) THEN
        SELECT COALESCE(SUM(
          CASE WHEN is_closed THEN 0
               ELSE GREATEST(0, EXTRACT(EPOCH FROM (end_time - start_time)) / 60) END
        ), 0)::INT
          INTO v_open_minutes
          FROM public.provider_availability_overrides
         WHERE provider_id = r.provider_id AND availability_date = d;
      ELSIF EXISTS (
        SELECT 1 FROM public.provider_availability_windows
         WHERE provider_id = r.provider_id AND day_of_week = EXTRACT(DOW FROM d)
      ) THEN
        SELECT COALESCE(SUM(GREATEST(0, EXTRACT(EPOCH FROM (end_time - start_time)) / 60)), 0)::INT
          INTO v_open_minutes
          FROM public.provider_availability_windows
         WHERE provider_id = r.provider_id AND day_of_week = EXTRACT(DOW FROM d);
      ELSE
        SELECT COALESCE(
          CASE WHEN is_closed THEN 0
               ELSE GREATEST(0, EXTRACT(EPOCH FROM (close_time - open_time)) / 60) END, 0)::INT
          INTO v_open_minutes
          FROM public.provider_availability
         WHERE provider_id = r.provider_id AND day_of_week = EXTRACT(DOW FROM d);
      END IF;

      IF COALESCE(v_open_minutes, 0) > 0 THEN
        v_has_open_day := TRUE;

        SELECT COALESCE(SUM(GREATEST(0, EXTRACT(EPOCH FROM (b.end_time - b.booking_time)) / 60)), 0)::INT
          INTO v_booked_minutes
          FROM public.bookings b
         WHERE b.provider_id = r.provider_id
           AND b.booking_date = d
           AND b.status IN ('pending', 'confirmed', 'in_progress', 'on_hold');

        IF v_booked_minutes < v_open_minutes THEN
          v_fully_booked := FALSE;
          EXIT;
        END IF;
      END IF;

      d := d + 1;
    END LOOP;

    IF v_has_open_day AND v_fully_booked THEN
      UPDATE public.providers SET fully_booked_alert_last_sent_at = NOW() WHERE id = r.provider_id;

      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, provider_id, recipient_role, metadata)
      VALUES (
        r.provider_user_id,
        'schedule_fully_booked',
        'You''re Fully Booked!',
        'No openings anywhere in your calendar for the next ' || r.alert_days ||
          ' day' || CASE WHEN r.alert_days = 1 THEN '' ELSE 's' END ||
          '. Consider opening more availability, or check your waitlist for who to invite next.',
        'medium',
        TRUE,
        r.provider_id,
        'provider',
        jsonb_build_object('kind', 'schedule_fully_booked')
      );
    END IF;
  END LOOP;
END;
$function$;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'provider-fully-booked-alerts';
SELECT cron.schedule(
  'provider-fully-booked-alerts',
  '0 8 * * *',
  $$ SELECT public.process_provider_fully_booked_alerts(); $$
);
