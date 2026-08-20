-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260817115657
-- Remote name: fix_vague_notification_copy
-- Do not edit this recovery archive; create a new tracked migration for changes.

-- ============================================================
-- CERVICED — Fix: vague notification copy for 3 types
-- Found by a notification-copy audit (2026-08-17): these three templates
-- were the only ones in the whole notification system that didn't use data
-- already available in their own query, reading as generic filler that's
-- identical regardless of the actual situation.
-- ============================================================

BEGIN;

-- 1. process_provider_unread_message_reminders — add "waiting Xh" to the body
CREATE OR REPLACE FUNCTION public.process_provider_unread_message_reminders()
RETURNS VOID AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.id AS conversation_id, c.provider_id, c.updated_at,
           p.user_id AS provider_user_id, u.name AS client_name
    FROM public.provider_conversations c
    JOIN public.providers p ON p.id = c.provider_id
    JOIN public.users u ON u.id = c.user_id
    WHERE c.unread_count_provider > 0
      AND c.updated_at < NOW() - INTERVAL '2 hours'
      AND p.reminder_notifications_enabled = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.provider_id = c.provider_id AND n.user_id = p.user_id
          AND n.type = 'provider_message'
          AND (n.metadata->>'conversation_id') = c.id::text
          AND n.created_at > NOW() - INTERVAL '4 hours'
      )
  LOOP
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, provider_id, metadata, recipient_role)
    VALUES (
      r.provider_user_id, 'provider_message',
      COALESCE(r.client_name, 'A client') || ' is waiting on a reply',
      COALESCE(r.client_name, 'A client') || ' has been waiting ' ||
        GREATEST(1, ROUND(EXTRACT(EPOCH FROM (NOW() - r.updated_at)) / 3600)::INT) ||
        ' hour' || CASE WHEN GREATEST(1, ROUND(EXTRACT(EPOCH FROM (NOW() - r.updated_at)) / 3600)::INT) = 1 THEN '' ELSE 's' END ||
        ' for a reply from you.',
      'medium', TRUE, r.provider_id,
      jsonb_build_object('conversation_id', r.conversation_id),
      'provider'
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. process_rebooking_nudges — add the actual service name + elapsed weeks
CREATE OR REPLACE FUNCTION public.process_rebooking_nudges()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      b.user_id,
      b.provider_id,
      p.display_name,
      (p.automation_settings->>'rebookingNudgeWeeks')::INT AS nudge_weeks,
      (ARRAY_AGG(b.service_name_snapshot ORDER BY b.booking_date DESC))[1] AS last_service_name
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
    WHERE p.automation_settings->>'rebookingNudgeWeeks' ~ '^[0-9]+$'
      AND b.status = 'completed'
    GROUP BY b.user_id, b.provider_id, p.display_name, p.automation_settings
    HAVING MAX(b.booking_date) = CURRENT_DATE
      - ((p.automation_settings->>'rebookingNudgeWeeks')::INT * 7)
      AND NOT EXISTS (
        SELECT 1 FROM public.bookings up
         WHERE up.user_id = b.user_id
           AND up.provider_id = b.provider_id
           AND up.status IN ('pending', 'confirmed')
           AND up.booking_date >= CURRENT_DATE
      )
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.notifications n
       WHERE n.user_id     = r.user_id
         AND n.provider_id = r.provider_id
         AND n.type        = 'rebooking_nudge'
         AND n.created_at  > NOW() - INTERVAL '21 days'
    ) THEN CONTINUE; END IF;

    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, provider_id, metadata)
    VALUES (
      r.user_id,
      'rebooking_nudge',
      COALESCE(r.display_name, 'Your provider') || ' misses you!',
      'It''s been ' || r.nudge_weeks || ' week' || CASE WHEN r.nudge_weeks = 1 THEN '' ELSE 's' END ||
        ' since your last ' || COALESCE(r.last_service_name, 'appointment') ||
        ' with ' || COALESCE(r.display_name, 'them') || ' — book your next one now.',
      'medium',
      TRUE,
      r.provider_id,
      jsonb_build_object('kind', 'rebooking_nudge')
    );
  END LOOP;
END;
$function$;

-- 3. process_birthday_greetings — add the customer's own name
CREATE OR REPLACE FUNCTION public.process_birthday_greetings()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT
      u.id AS user_id,
      u.name AS customer_name,
      p.id AS provider_id,
      p.display_name
    FROM public.users u
    JOIN public.bookings b  ON b.user_id = u.id AND b.status = 'completed'
    JOIN public.providers p ON p.id = b.provider_id
    WHERE u.dob IS NOT NULL
      AND TO_CHAR(u.dob::DATE, 'MM-DD') = TO_CHAR(CURRENT_DATE, 'MM-DD')
      AND COALESCE((p.automation_settings->>'birthdayGreeting')::BOOLEAN, FALSE) = TRUE
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.notifications n
       WHERE n.user_id     = r.user_id
         AND n.provider_id = r.provider_id
         AND n.metadata->>'kind' = 'birthday_greeting'
         AND n.created_at  > NOW() - INTERVAL '300 days'
    ) THEN CONTINUE; END IF;

    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, provider_id, metadata)
    VALUES (
      r.user_id,
      'birthday_greeting',
      COALESCE(r.display_name, 'Your provider') || ' — Happy Birthday! 🎂',
      'Happy birthday' || CASE WHEN r.customer_name IS NOT NULL THEN ', ' || r.customer_name ELSE '' END ||
        '! Treat yourself — your next appointment with ' || COALESCE(r.display_name, 'them') || ' is just a tap away.',
      'low',
      TRUE,
      r.provider_id,
      jsonb_build_object('kind', 'birthday_greeting')
    );
  END LOOP;
END;
$function$;

COMMIT;
