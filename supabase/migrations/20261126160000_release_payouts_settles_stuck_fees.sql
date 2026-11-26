-- Fee charges stuck at 'processing' get settled.
--
-- booking-fee inserts a booking_fee_charges row at 'processing', then charges
-- the client's saved card. If the function stops part-way (a timeout, a crash),
-- the row stays 'processing' for good. It blocks every other fee on the visit
-- (booking_fee_charges_one_per_booking counts it), and if Stripe had already
-- taken the money it is never paid out or refundable: recordFeePaid only
-- accepts a payment already bound to the row, so the webhook can't record it.
--
-- release-payouts now settles such rows (settleStuckFees). This lets its gate
-- start a run when one is 15 minutes old, alongside the payouts, fee retries
-- and lapsed requests it already waits for. Nothing else changes. Redefined
-- from live (pg_get_functiondef, read 2026-11-26) with an md5 guard.

BEGIN;

DO $$
BEGIN
  IF md5(pg_get_functiondef('public.process_due_payouts'::regproc)) IS DISTINCT FROM 'f29c2d5620ab980370f4a0382492e7de' THEN
    RAISE EXCEPTION 'public.process_due_payouts is not the version this migration was written against';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.process_due_payouts()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.provider_payouts
     WHERE status = 'held' AND release_after <= now()
  ) AND NOT EXISTS (
    SELECT 1 FROM public.booking_fee_charges
     WHERE payout_status = 'held' AND release_after <= now()
  ) AND NOT EXISTS (
    SELECT 1 FROM public.booking_fee_charges
     WHERE status = 'awaiting_client'
       AND (pay_by <= now() OR next_retry_at <= now())
  ) AND NOT EXISTS (
    -- A fee charge left at 'processing' when booking-fee stopped part-way
    -- (release-payouts' settleStuckFees; same 15 minutes as STUCK_FEE_AFTER_MS).
    SELECT 1 FROM public.booking_fee_charges
     WHERE status = 'processing'
       AND created_at <= now() - interval '15 minutes'
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

REVOKE ALL ON FUNCTION public.process_due_payouts() FROM PUBLIC, anon, authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261126160000', 'release_payouts_settles_stuck_fees')
ON CONFLICT DO NOTHING;

COMMIT;
