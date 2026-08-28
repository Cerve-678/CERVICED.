-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260817103952
-- Remote name: fix_pending_booking_provider_reminder
-- Do not edit this recovery archive; create a new tracked migration for changes.

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'booking_pending', 'booking_confirmed', 'booking_declined', 'booking_cancelled',
    'booking_reminder', 'booking_in_progress', 'booking_not_started', 'no_show',
    'payment_success', 'new_provider', 'reschedule_request', 'reschedule_provider_response',
    'reschedule_confirmed', 'reschedule_declined', 'review_request', 'review_received', 'promotion',
    'intake_form_reminder', 'intake_form_received', 'intake_form_completed',
    'info_pack_received', 'provider_message', 'announcement', 'balance_reminder',
    'waitlist_slot_available', 'new_message', 'address_released', 'birthday_greeting',
    'post_appt_check_in', 'rebooking_nudge', 'daily_recap', 'schedule_fully_booked',
    'pending_booking_reminder'
  ));

CREATE OR REPLACE FUNCTION public.process_pending_booking_warnings()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT b.id AS booking_id, b.user_id, b.booking_date, b.booking_time,
           b.service_name_snapshot, b.provider_name_snapshot, b.provider_id
    FROM public.bookings b
    JOIN public.users u ON u.id = b.user_id
    WHERE b.status = 'pending'
      AND (b.booking_date::TIMESTAMP + b.booking_time) BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
      AND u.pending_warning_enabled = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.booking_id = b.id AND n.user_id = b.user_id
          AND n.type = 'booking_pending' AND n.recipient_role = 'client'
          AND n.created_at > NOW() - INTERVAL '25 hours'
      )
  LOOP
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      r.user_id, 'booking_pending', 'Booking Still Awaiting Confirmation',
      'Your ' || r.service_name_snapshot ||
        ' with ' || r.provider_name_snapshot ||
        ' on ' || TO_CHAR(r.booking_date, 'DD Mon YYYY') ||
        ' at ' || TO_CHAR(r.booking_time, 'HH12:MI AM') ||
        ' has not been confirmed yet. You may want to contact the provider.',
      'high', TRUE, r.booking_id, r.provider_id, 'client'
    );
  END LOOP;

  FOR r IN
    SELECT b.id AS booking_id, b.booking_date, b.booking_time,
           b.service_name_snapshot, b.customer_name, b.provider_id,
           p.user_id AS provider_user_id
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
    WHERE b.status = 'pending'
      AND (b.booking_date::TIMESTAMP + b.booking_time) BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
      AND p.user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.booking_id = b.id AND n.user_id = p.user_id
          AND n.type = 'pending_booking_reminder' AND n.recipient_role = 'provider'
          AND n.created_at > NOW() - INTERVAL '25 hours'
      )
  LOOP
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      r.provider_user_id, 'pending_booking_reminder', 'Booking Awaiting Your Response',
      r.customer_name || '''s ' || r.service_name_snapshot ||
        ' on ' || TO_CHAR(r.booking_date, 'DD Mon YYYY') ||
        ' at ' || TO_CHAR(r.booking_time, 'HH12:MI AM') ||
        ' is still pending confirmation — it will auto-cancel if not confirmed or declined in time.',
      'high', TRUE, r.booking_id, r.provider_id, 'provider'
    );
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.process_pending_booking_warnings() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_pending_booking_warnings() FROM anon;
GRANT EXECUTE ON FUNCTION public.process_pending_booking_warnings() TO authenticated, service_role;
