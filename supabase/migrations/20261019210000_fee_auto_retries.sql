-- Retry a declined late/no-show fee on the saved card, and the wording that
-- allows it (user decision 2026-10-19, "adjust wording").
--
-- When the off-session charge is DECLINED (not when the bank wants the client
-- to approve it — retrying that never works), booking-fee still asks the client
-- to pay (20261019170000) and also schedules up to three automatic retries of
-- the same Stripe invoice with the saved card, about 1, 3 and 6 days later,
-- inside the request's 7 days. Paying the invoice — by retry, in the app or
-- from the email — is one payment, so the fee can't be taken twice.
--
-- 1. booking_fee_charges: retry_payment_method_id, retry_count, next_retry_at.
-- 2. process_due_payouts() also wakes release-payouts when a retry is due.
--    Reproduced from the live definition (20261019170000, verified 2026-10-19);
--    only the "anything due?" check changes.
-- 3. fee_terms_versions '2026-10-19-retries': the wording that says the card
--    may be tried again. Earlier versions stay, so each agreement keeps pointing
--    at what that client was shown. Retries are only scheduled for agreements
--    on this version (booking-fee checks), never on older ones.
--
-- Frontier at authoring: 20261019170000 (above the unapplied 20261019150000 and
-- 20261019190000 on other branches). Paste into the SQL editor, then record
-- the version. Apply BEFORE deploying booking-fee / release-payouts from
-- feat/fee-auto-retry, and before the app build with this wording ships.

BEGIN;

-- 1. Retry state -----------------------------------------------------------------
ALTER TABLE public.booking_fee_charges
  ADD COLUMN IF NOT EXISTS retry_payment_method_id text,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count BETWEEN 0 AND 3),
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;

COMMENT ON COLUMN public.booking_fee_charges.next_retry_at IS
  'While awaiting_client: when the saved card is next tried again (at most 3 retries, inside pay_by). NULL = no more retries.';

CREATE INDEX IF NOT EXISTS booking_fee_charges_next_retry_idx
  ON public.booking_fee_charges (next_retry_at) WHERE status = 'awaiting_client' AND next_retry_at IS NOT NULL;

-- 2. Wake the payout job for due retries too --------------------------------------
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

-- 3. The wording that allows retries ------------------------------------------------
INSERT INTO public.fee_terms_versions (version, heading, body, consent_line, sha256)
VALUES (
  '2026-10-19-retries',
  'Late Arrival & No-Show Fees',
  'Some providers set a late arrival fee, a no-show fee, or both. Any fee is shown to you before you pay, and you must agree to it at checkout to book. If you agree, your card is saved securely by Stripe, and the provider may charge the agreed fee to it within 24 hours of your appointment: the late arrival fee if you arrive after the provider''s stated grace period, or the no-show fee if you do not attend. If the charge is declined, we will ask you to pay the fee in the app or by email within 7 days, and we may try your saved card again up to three more times in those 7 days. If your bank asks you to approve the charge, we won''t try the card again; you can pay it yourself within the 7 days. Each fee is fixed at the amount shown when you book, can be collected only once per booking, and can never be more than half the price of the booking. You will be notified whenever a fee is charged or retried. If you believe a fee is wrong, you can dispute it with the provider in the app within 7 days of the charge, and the provider decides whether to refund it. Fees are paid to the provider, not to Cerviced, and Cerviced does not decide fee disputes. This does not affect your statutory rights, including your right to contact your bank.',
  'I agree that CERVICED may save this card with Stripe and, if the provider records that I arrived more than the stated grace period late or did not attend, may charge this card the applicable fee shown above. Each fee is for this booking only, is first charged no later than 24 hours after the appointment ends, and will not exceed the amount shown. If that charge is declined, it may be tried again up to three times within the following 7 days, and I may pay it myself in that time. I can dispute a charged fee in the app within 7 days; the provider will review the dispute and may refund or keep the fee. This does not affect my statutory rights.',
  ''  -- replaced by before_fee_terms_sha256
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
