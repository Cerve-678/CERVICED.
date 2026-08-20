-- process_scheduled_announcements() was added (20260815101138_scheduled_announcements.sql)
-- after the batch revoke in 20260815095405, so it kept the default public
-- EXECUTE grant. It inserts notifications and is driven solely by pg_cron
-- job 152, which runs as postgres and is unaffected by this revoke.
REVOKE ALL ON FUNCTION public.process_scheduled_announcements() FROM PUBLIC, anon, authenticated;

-- Every other cron/trigger function pins search_path; this one did not.
ALTER FUNCTION public.process_scheduled_announcements() SET search_path = public, pg_temp;
