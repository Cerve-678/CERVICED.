-- PROVIDER FOLLOW — AVAILABILITY NOTIFY TOGGLE
-- Adds an opt-in recurring nudge to the existing provider_follows table.
-- Fixed cadence for every follower: once per calendar month.

-- STEP 0: Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;
GRANT USAGE ON SCHEMA cron TO postgres;

-- STEP 1: notify_enabled / last_notified_at columns
ALTER TABLE public.provider_follows
  ADD COLUMN IF NOT EXISTS notify_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMPTZ;

-- STEP 2: process_follow_availability_nudges()
-- Runs daily at 09:00 UTC. Sends to every follow row with notify_enabled = TRUE
-- whose last_notified_at is NULL or more than a calendar month old.
CREATE OR REPLACE FUNCTION public.process_follow_availability_nudges()
RETURNS VOID AS $$
DECLARE
  r RECORD;
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
      AND (f.last_notified_at IS NULL OR f.last_notified_at <= NOW() - INTERVAL '1 month')
  LOOP
    UPDATE public.provider_follows
       SET last_notified_at = NOW()
     WHERE id = r.follow_id
       AND (last_notified_at IS NULL OR last_notified_at <= NOW() - INTERVAL '1 month');
    IF NOT FOUND THEN CONTINUE; END IF;

    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, provider_id, metadata)
    VALUES (
      r.user_id,
      'announcement',
      COALESCE(r.display_name, 'Your provider') || ' — New Availability',
      'Check ' || COALESCE(r.display_name, 'your provider') || '''s latest slots — new availability may have opened up.',
      'low',
      TRUE,
      r.provider_id,
      jsonb_build_object('kind', 'follow_availability_nudge')
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- STEP 3: Schedule the cron job — daily 09:00 UTC
SELECT cron.schedule(
  'provider-follow-availability-nudges',
  '0 9 * * *',
  $$ SELECT public.process_follow_availability_nudges(); $$
);
;
