-- APPLIED 20260929050657 (2026-09-29). Companion fix to
-- 20260929050150_stripe_connect_account_columns.sql.
--
-- WHY THIS EXISTS: that migration's `REVOKE UPDATE (col...) FROM anon,
-- authenticated` is a NO-OP and enforced nothing. Verified against live:
--   * anon + authenticated both hold a *table-level* UPDATE grant on
--     public.providers (a column-level REVOKE cannot subtract from a
--     table-level grant), and
--   * the providers_owner_all RLS policy is FOR ALL USING (auth.uid()=user_id)
--     WITH CHECK (auth.uid()=user_id) — so a provider may UPDATE their own
--     row's *every* column.
-- Together that let a provider set their own stripe_charges_enabled = true
-- (forging KYC eligibility — a hard bypass once the go-live gate lands) or
-- write a bogus stripe_account_id (misrouting onboarding/payouts). These
-- columns must only ever be written server-side by create-connect-account and
-- stripe-webhook (both service_role). The app is not the enforcement point;
-- the DB is.
--
-- MECHANISM: a BEFORE UPDATE trigger that rejects a change to any stripe_*
-- column when the request role is a client role. It is SECURITY INVOKER (NOT
-- DEFINER) on purpose — the guard must read the REAL request role via
-- current_user, which PostgREST SET ROLEs to 'authenticated' / 'anon' /
-- 'service_role' per request; a DEFINER function would report the owner and
-- defeat the check. It needs no elevated privilege — it only compares and
-- raises. service_role (webhook/onboarding), postgres and SECURITY DEFINER
-- contexts (e.g. check_and_set_provider_live) are all outside the blocked set,
-- so legitimate server writes pass. bookings' refund columns need no
-- equivalent: bookings RLS has NO UPDATE policy at all, so clients cannot
-- UPDATE any booking column regardless of grant.
--
-- Verified functionally (rolled-back): an authenticated own-row write to
-- stripe_charges_enabled is rejected with check_violation.

CREATE OR REPLACE FUNCTION public.enforce_provider_stripe_columns_server_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF (NEW.stripe_account_id       IS DISTINCT FROM OLD.stripe_account_id
      OR NEW.stripe_charges_enabled   IS DISTINCT FROM OLD.stripe_charges_enabled
      OR NEW.stripe_payouts_enabled   IS DISTINCT FROM OLD.stripe_payouts_enabled
      OR NEW.stripe_details_submitted IS DISTINCT FROM OLD.stripe_details_submitted)
     AND current_user IN ('authenticated', 'anon')
  THEN
    RAISE EXCEPTION 'Payout account status is managed by the payment system and cannot be changed directly.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_provider_stripe_columns_server_only ON public.providers;
CREATE TRIGGER enforce_provider_stripe_columns_server_only
  BEFORE UPDATE OF stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted
  ON public.providers
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_provider_stripe_columns_server_only();
