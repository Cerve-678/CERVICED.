-- Redesign: day-of-month release nudge (provider-configured), replacing the
-- earlier monthly-since-last-sent design.

CREATE OR REPLACE FUNCTION public.process_follow_schedule_release_nudges()
RETURNS VOID AS $$
DECLARE
  r RECORD;
  v_last_day_of_month INT := EXTRACT(DAY FROM (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day'))::INT;
  v_today INT := EXTRACT(DAY FROM CURRENT_DATE)::INT;
BEGIN
  FOR r IN
    SELECT
      f.id AS follow_id,
      f.user_id,
      f.provider_id,
      p.display_name
    FROM public.provider_follows f
    JOIN public.providers p ON p.id = f.provider_id
    WHERE f.notify_enabled = TRUE
      AND (p.automation_settings->>'scheduleReleaseDay') ~ '^[0-9]+$'
      AND LEAST((p.automation_settings->>'scheduleReleaseDay')::INT, v_last_day_of_month) = v_today
      AND (f.last_notified_at IS NULL OR f.last_notified_at < date_trunc('month', NOW()))
  LOOP
    UPDATE public.provider_follows
       SET last_notified_at = NOW()
     WHERE id = r.follow_id
       AND (last_notified_at IS NULL OR last_notified_at < date_trunc('month', NOW()));
    IF NOT FOUND THEN CONTINUE; END IF;

    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, provider_id, metadata)
    VALUES (
      r.user_id,
      'announcement',
      COALESCE(r.display_name, 'Your provider') || ' — New Availability',
      COALESCE(r.display_name, 'Your provider') || ' just released new availability — check their latest slots.',
      'low',
      TRUE,
      r.provider_id,
      jsonb_build_object('kind', 'follow_schedule_release_nudge')
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'provider-follow-availability-nudges';

SELECT cron.schedule(
  'provider-follow-schedule-release-nudges',
  '0 9 * * *',
  $$ SELECT public.process_follow_schedule_release_nudges(); $$
);
;
