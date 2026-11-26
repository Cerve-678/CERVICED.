-- 20261109170000_post_appt_check_in_asks_for_feedback.sql
--
-- The provider's automated day-after check-in now asks the client to leave
-- personal feedback on their visit, which is where tapping it lands since
-- PR #408 (that booking's review form). Before, it said "just send a
-- message" while the tap opened something else.
--
-- The wording deliberately asks for feedback, not *good* feedback: asking
-- only for positive reviews is a problem under the UK's fake-review rules
-- (DMCC Act 2024).
--
-- CREATE OR REPLACE of the live definition (applied by
-- client_automation_jobs.sql, last touched by 20260820095951) with only the
-- message changed, plus a fallback so a provider without a display name
-- doesn't null the whole message. The md5 guard refuses to run if the live
-- definition has moved on since 2026-11-09. Grants (revoked from PUBLIC by
-- 20260820095951) are kept by CREATE OR REPLACE.

BEGIN;

DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.process_post_appt_check_ins()'::regprocedure)) <> '57641a16b46f97a2688ca28af153aa79' THEN
    RAISE EXCEPTION 'process_post_appt_check_ins changed since this was written; rebuild it from the live definition';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.process_post_appt_check_ins()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      b.id AS booking_id,
      b.user_id,
      b.provider_id,
      b.service_name_snapshot,
      p.display_name
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
    WHERE b.status = 'completed'
      AND b.booking_date = CURRENT_DATE - 1
      AND COALESCE((p.automation_settings->>'postApptCheckIn')::BOOLEAN, FALSE) = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
         WHERE n.booking_id = b.id
           AND n.user_id    = b.user_id
           AND n.metadata->>'kind' = 'post_appt_check_in'
      )
  LOOP
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, metadata)
    VALUES (
      r.user_id,
      'post_appt_check_in',
      COALESCE(r.display_name, 'Your provider') || ' — Checking In',
      'How are you getting on after your ' || COALESCE(r.service_name_snapshot, 'appointment') ||
        '? If you have a moment, leave ' || COALESCE(r.display_name, 'them') ||
        ' some personal feedback on your visit.',
      'low',
      TRUE,
      r.booking_id,
      r.provider_id,
      jsonb_build_object('kind', 'post_appt_check_in')
    );
  END LOOP;
END;
$function$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261109170000', 'post_appt_check_in_asks_for_feedback')
ON CONFLICT (version) DO NOTHING;

COMMIT;
