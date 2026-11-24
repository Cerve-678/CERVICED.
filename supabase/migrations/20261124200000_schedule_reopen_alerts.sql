-- When a provider's closed schedule opens again, the people who saved them or
-- have their bell on are told: "Sasha is back from holiday" (the reason only if
-- the provider chose to tell clients), or "Sasha is taking bookings again".
--
-- A closure ends three ways: the provider taps Reopen, their chosen date
-- arrives (00:00 UK), or, with no date, their next release day comes round.
-- The last two are worked out from the clock, so nothing happens at that
-- moment. A cron looks every 15 minutes for closures that have ended, sends
-- the alert, and removes the row. Reopen now ends the closure (reopens_on =
-- today) instead of deleting it, so the cron sees that one too; the app only
-- ever reads is_closed, never whether a row exists (availability.ts).
--
-- Only between 08:00 and 20:59 UK: a closure that ends at midnight is told at
-- 08:00. A provider who closes again before then sends nothing (the row is
-- closed again, so it isn't picked up).
--
-- No alert, the row is simply removed:
--   • closed for under 24 hours (most likely a mis-tap);
--   • closed on its own because they were fully booked (auto_closed): that
--     reopens on their release day, and the release message covers it;
--   • not live or not active;
--   • no free slot to book, because "Book now" wouldn't be true. The "has
--     space again" alert picks them up when one frees.
-- On the provider's release day, bell followers are left out: the release
-- message ("December has opened up with Sasha") goes to them instead. People
-- who only saved still get this one.
--
-- Someone who both saved and belled gets one alert. The provider never gets
-- their own. The push goes out even with Offers & Promotions off
-- (send-push-notification, kind 'schedule_reopened'): they chose this provider.
--
-- Redefines from live with an md5 guard: reopen_my_schedule.
-- Frontier at authoring: live 20261124150000 (cerviced-9b's waitlist_offer_outside_hours). Re-check before applying.

BEGIN;

DO $guard$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(pg_get_functiondef('public.reopen_my_schedule()'::regprocedure)) INTO v_md5;
  IF v_md5 <> '93ab36d99655ac360307fa3bb9190bf3' THEN
    RAISE EXCEPTION 'reopen_my_schedule changed since this migration was written (%): rebuild from live', v_md5;
  END IF;
END;
$guard$;

-- ── 1. Reopen ends the closure instead of deleting it ───────────────────────
-- reopens_on = today means provider_schedule_is_closed is false straight away.
CREATE OR REPLACE FUNCTION public.reopen_my_schedule()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  UPDATE public.provider_schedule_closures c
     SET reopens_on = (now() AT TIME ZONE 'Europe/London')::date
    FROM public.providers p
   WHERE p.id = c.provider_id AND p.user_id = auth.uid();
$function$;

-- ── 2. The alert ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_schedule_reopen_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r RECORD;
  v_ended RECORD;
  v_p RECORD;
  v_daytime boolean := EXTRACT(HOUR FROM (now() AT TIME ZONE 'Europe/London'))::int BETWEEN 8 AND 20;
  v_last_day_of_month int := EXTRACT(DAY FROM (date_trunc('month', now() AT TIME ZONE 'Europe/London') + INTERVAL '1 month - 1 day'))::int;
  v_today int := EXTRACT(DAY FROM (now() AT TIME ZONE 'Europe/London'))::int;
  v_title text;
  v_message text;
BEGIN
  -- Night: leave every ended closure where it is, to be told at 08:00.
  IF NOT v_daytime THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT c.provider_id
      FROM public.provider_schedule_closures c
     WHERE NOT public.provider_schedule_is_closed(c.provider_id)
     LIMIT 200
  LOOP
   -- One provider's failure is logged and skipped, not allowed to stop the run.
   BEGIN
    -- Take the row. Still ended at this instant, or someone closed again and
    -- it stays.
    DELETE FROM public.provider_schedule_closures c
     WHERE c.provider_id = r.provider_id
       AND NOT public.provider_schedule_is_closed(c.provider_id)
    RETURNING c.closed_at, c.reason, c.show_reason, c.auto_closed INTO v_ended;
    CONTINUE WHEN NOT FOUND;

    CONTINUE WHEN v_ended.auto_closed;
    CONTINUE WHEN v_ended.closed_at > now() - INTERVAL '24 hours';

    SELECT p.id, p.user_id, p.display_name,
           COALESCE(
             (p.automation_settings->>'scheduleReleaseDay') ~ '^[0-9]{1,2}$'
             AND LEAST((p.automation_settings->>'scheduleReleaseDay')::int, v_last_day_of_month) = v_today,
             FALSE
           ) AS is_release_day
      INTO v_p
      FROM public.providers p
     WHERE p.id = r.provider_id
       AND p.has_gone_live = TRUE
       AND p.is_active = TRUE;
    CONTINUE WHEN NOT FOUND;

    -- "Book now" has to be true.
    CONTINUE WHEN NOT EXISTS (
      SELECT 1
        FROM public.get_services_open_within(
               ARRAY(SELECT s.id FROM public.services s
                      WHERE s.provider_id = v_p.id AND s.is_active = TRUE),
               180) o
       WHERE o.has_slot
    );

    v_title := COALESCE(v_p.display_name, 'Your provider') || CASE
      WHEN v_ended.show_reason AND v_ended.reason = 'holiday'  THEN ' is back from holiday'
      WHEN v_ended.show_reason AND v_ended.reason = 'training' THEN ' is back from training'
      ELSE ' is taking bookings again'
    END;
    v_message := CASE
      WHEN v_ended.show_reason AND v_ended.reason IN ('holiday', 'training') THEN 'Taking bookings again. Book now.'
      ELSE 'Book now.'
    END;

    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, provider_id, recipient_role, metadata)
    SELECT who.user_id, 'announcement', v_title, v_message, 'low', TRUE, v_p.id, 'client',
           jsonb_build_object('kind', 'schedule_reopened')
      FROM (
        -- UNION, not UNION ALL: saved and belled is one person, one alert.
        SELECT b.user_id FROM public.bookmarks b WHERE b.provider_id = v_p.id
        UNION
        SELECT f.user_id FROM public.provider_follows f
         WHERE f.provider_id = v_p.id AND f.notify_enabled = TRUE
      ) who
     WHERE who.user_id IS DISTINCT FROM v_p.user_id
       -- On their release day the release message speaks for anyone belled.
       AND NOT (v_p.is_release_day AND EXISTS (
         SELECT 1 FROM public.provider_follows f2
          WHERE f2.provider_id = v_p.id AND f2.user_id = who.user_id AND f2.notify_enabled = TRUE
       ));
   EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'schedule reopen alert failed for provider %: % (%)', r.provider_id, SQLERRM, SQLSTATE;
   END;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.process_schedule_reopen_alerts() FROM PUBLIC, anon, authenticated;

-- Closures that ended before today are cleared without an alert: they
-- reopened days ago, so "back from holiday" now would be late news.
DELETE FROM public.provider_schedule_closures c
 WHERE NOT public.provider_schedule_is_closed(c.provider_id);

-- Every 15 minutes, off the quarter hours the other crons use.
SELECT cron.unschedule('schedule-reopen-alerts')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'schedule-reopen-alerts');
SELECT cron.schedule('schedule-reopen-alerts', '11,26,41,56 * * * *',
                     'SELECT public.process_schedule_reopen_alerts();');

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261124200000', 'schedule_reopen_alerts');

COMMIT;
