-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260808225655
-- Remote name: provider_scrape_pipeline_cron
-- Do not edit this recovery archive; create a new tracked migration for changes.

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
    RETURN;
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
      timeout_milliseconds := 120000
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

SELECT cron.schedule(
  'process-pending-scrape-jobs',
  '*/5 * * * *',
  $$ SELECT public.process_pending_scrape_jobs(); $$
);
