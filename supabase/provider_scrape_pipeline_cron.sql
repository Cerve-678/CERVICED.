-- ============================================================
-- CERVICED — Provider Scrape Pipeline: cron trigger
-- Run in Supabase SQL editor AFTER claimable_provider_profiles.sql.
--
-- run-scrape-job only processes one batch (BATCH_SIZE sources) per
-- invocation and leaves the job in 'running' if more are pending. This
-- schedules a periodic sweep that re-invokes it for any job still not
-- 'done'/'failed' — same net.http_post + Vault-secret pattern already used
-- for push notifications, see push_token_setup.sql.
--
-- Prerequisite: push_token_setup.sql must already have stored the real
-- service_role key under the 'service_role_key' Vault secret. If it
-- hasn't, this sweep silently does nothing (same fail-safe posture as the
-- push trigger) rather than erroring.
--
-- IMPORTANT — this migration does NOT start any scraping on its own. It
-- only wires up the mechanism; scraping begins when a provider_scrape_jobs
-- row + its provider_scrape_sources are inserted (a separate, deliberate
-- action — see the seed example at the bottom).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.process_pending_scrape_jobs()
RETURNS VOID AS $$
DECLARE
  v_key TEXT;
  r     RECORD;
BEGIN
  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
   WHERE name = 'service_role_key'
   LIMIT 1;

  IF v_key IS NULL OR v_key = '' OR v_key LIKE '<%' THEN
    RETURN; -- key not configured yet — skip quietly, see push_token_setup.sql
  END IF;

  FOR r IN
    SELECT j.id
    FROM public.provider_scrape_jobs j
    WHERE j.status IN ('pending', 'running')
      AND EXISTS (
        SELECT 1 FROM public.provider_scrape_sources s
         WHERE s.job_id = j.id AND s.status = 'pending'
      )
  LOOP
    PERFORM net.http_post(
      url     := 'https://ztrfpfvvejzaysrelmfm.supabase.co/functions/v1/run-scrape-job',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body    := jsonb_build_object('jobId', r.id),
      -- Each batch does BATCH_SIZE sequential page-fetch + Claude calls —
      -- give it real headroom rather than the pg_net default.
      timeout_milliseconds := 120000
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Sweep every 5 minutes — cheap no-op when nothing is queued.
SELECT cron.schedule(
  'process-pending-scrape-jobs',
  '*/5 * * * *',
  $$ SELECT public.process_pending_scrape_jobs(); $$
);

-- ───────────────────────────────────────────────────────────
-- To actually start a scrape run, insert a job + its sources, e.g.:
--
--   WITH job AS (
--     INSERT INTO public.provider_scrape_jobs (source_site, total_sources)
--     VALUES ('example-directory', 2)
--     RETURNING id
--   )
--   INSERT INTO public.provider_scrape_sources (job_id, source_url)
--   SELECT job.id, url
--   FROM job, unnest(ARRAY[
--     'https://example.com/provider/one',
--     'https://example.com/provider/two'
--   ]) AS url;
--
-- The next cron sweep (within 5 minutes) picks it up automatically, or
-- call run-scrape-job directly with { "jobId": "<id>" } to run it now.
-- ───────────────────────────────────────────────────────────

-- ============================================================
-- DONE — scrape pipeline sweep scheduled. No sources queued by this file.
-- ============================================================
