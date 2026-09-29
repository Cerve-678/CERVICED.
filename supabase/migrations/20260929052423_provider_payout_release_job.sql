-- APPLIED 20260929052423 (2026-09-29). Applied after provider_payouts_ledger
-- and after the release-payouts edge function was deployed.
--
-- Step 3 of the Connect build: the release job's DB side. release-payouts (the
-- edge function) does the actual Stripe Transfers; this just wakes it on a
-- schedule, using the same vault-secret + net.http_post pattern the
-- booking-confirmation retry job uses (request_booking_confirmation_email).
--
-- The edge function itself picks the due rows and re-checks each booking, so
-- this function passes no ids — it only needs to trigger a run.

CREATE OR REPLACE FUNCTION public.process_due_payouts()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key text;
BEGIN
  -- Short-circuit if there's nothing due, so we don't wake the function (and
  -- pay for an invocation) every 15 minutes for no reason.
  IF NOT EXISTS (
    SELECT 1 FROM public.provider_payouts
     WHERE status = 'held' AND release_after <= now()
  ) THEN
    RETURN false;
  END IF;

  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
   WHERE name = 'service_role_key'
   LIMIT 1;
  IF v_key IS NULL OR v_key = '' OR v_key LIKE '<%' THEN
    RETURN false;
  END IF;

  PERFORM net.http_post(
    url     := 'https://ztrfpfvvejzaysrelmfm.supabase.co/functions/v1/release-payouts',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  RETURN true;
END;
$function$;

-- Idempotent scheduling: drop any prior copy of this job before creating it, so
-- a re-run doesn't error or duplicate the schedule.
DO $$
BEGIN
  PERFORM cron.unschedule('release-due-payouts')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'release-due-payouts');
END $$;

-- Every 15 minutes. Payouts release 24h after the appointment, so this is not
-- time-critical to the minute; a backlog drains over successive runs (the edge
-- function caps each run at 50 rows).
SELECT cron.schedule('release-due-payouts', '*/15 * * * *', 'SELECT public.process_due_payouts();');
