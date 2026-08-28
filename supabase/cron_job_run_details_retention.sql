-- ============================================================
-- cron_job_run_details_retention.sql
--
-- cron.job_run_details grows without bound: pg_cron writes one INSERT and
-- three UPDATEs per job run, and nothing ever purges it. With 24 active jobs
-- (nine on */5 or */15 schedules) this reached ~27k rows / 6.2 MB in six
-- weeks, costing ~121s of CPU on the inserts alone.
--
-- pg_cron does not ship a retention policy, so schedule one.
-- Safe to re-run: unschedules any prior copy of the job first.
-- ============================================================

-- Drop a previously-scheduled copy so this file stays idempotent.
DO $$
BEGIN
  PERFORM cron.unschedule('purge-cron-run-history');
EXCEPTION WHEN OTHERS THEN
  NULL; -- not scheduled yet
END $$;

SELECT cron.schedule(
  'purge-cron-run-history',
  '17 4 * * *',  -- daily, off-peak, offset from the 0/8/9/10 job cluster
  $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days'$$
);

-- One-off catch-up for the existing backlog. The scheduled job above keeps it
-- trimmed from here on.
DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days';

-- ============================================================
-- DONE — cron_job_run_details_retention.sql applied.
-- ============================================================
