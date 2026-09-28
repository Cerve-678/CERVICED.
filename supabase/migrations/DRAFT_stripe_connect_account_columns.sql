-- DRAFT — NOT YET APPLIED. Rename to a real version number ABOVE the live
-- max(version) in supabase_migrations.schema_migrations at apply time (never
-- off the wall clock), and claim the lock in supabase/MIGRATION_OWNER.md
-- first. See CLAUDE.md's migration-ownership rule.
--
-- Stripe Connect (Express) — provider connected-account columns + go-live
-- plumbing. This file is ADDITIVE and SAFE to apply on its own: it only adds
-- nullable/defaulted columns and a re-check trigger. It deliberately does NOT
-- make charges_enabled a hard go-live requirement yet — that flip is a
-- separate migration (see companion DRAFT_stripe_connect_gate_go_live.sql),
-- because turning it on before providers have onboarded would take every
-- currently-live provider dark the moment it applies.
--
-- Chosen model (user decision, 2026-09-27): "Buyers purchase from you" +
-- "Payouts split between sellers" (Stripe's Uber-Eats/DoorDash pattern).
-- CERVICED is merchant of record: the client is charged into the PLATFORM
-- account (the existing create-payment-intent flow already does this), and
-- each provider is paid out by a later Transfer to their connected account,
-- minus the platform fee. These columns model the provider's connected
-- account and its onboarding/eligibility state.

ALTER TABLE public.providers
  -- The Stripe connected account id (acct_...). NULL until onboarding starts.
  -- Unique so two provider rows can never share one connected account.
  ADD COLUMN IF NOT EXISTS stripe_account_id text UNIQUE,
  -- Mirrors of the Stripe account's capability flags, kept in sync by the
  -- stripe-webhook function on `account.updated`. The app trusts THESE, never
  -- a value the client sends — they are the source of truth for "can this
  -- provider take money / receive payouts yet".
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled boolean NOT NULL DEFAULT false,
  -- True once the provider has finished the hosted onboarding form. Lets the
  -- UI distinguish "never started" from "submitted, pending Stripe review".
  ADD COLUMN IF NOT EXISTS stripe_details_submitted boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.providers.stripe_account_id IS
  'Stripe Connect (Express) connected-account id (acct_...). Written by create-connect-account; NULL before onboarding.';
COMMENT ON COLUMN public.providers.stripe_charges_enabled IS
  'Stripe account.charges_enabled, synced by stripe-webhook. Source of truth for whether this provider may be paid out. Never client-writable.';
COMMENT ON COLUMN public.providers.stripe_payouts_enabled IS
  'Stripe account.payouts_enabled, synced by stripe-webhook.';
COMMENT ON COLUMN public.providers.stripe_details_submitted IS
  'Stripe account.details_submitted, synced by stripe-webhook. Distinguishes "not started" from "submitted, under review".';

-- These columns are set only server-side (create-connect-account writes the
-- id with the service role; stripe-webhook writes the flags with the service
-- role). Clients must never be able to write them, or a provider could mark
-- themselves payout-eligible without passing KYC. Revoke column-level write
-- from the client roles; SELECT on providers is governed by existing RLS.
REVOKE UPDATE (
  stripe_account_id,
  stripe_charges_enabled,
  stripe_payouts_enabled,
  stripe_details_submitted
) ON public.providers FROM anon, authenticated;

-- Re-fire the go-live check when Stripe flips charges_enabled (via the
-- webhook). Harmless until the companion gate migration makes has_gone_live
-- actually depend on charges_enabled — until then this just re-runs the
-- existing check with no new condition. Mirrors on_provider_policies_change.
CREATE OR REPLACE FUNCTION public.handle_provider_stripe_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.check_and_set_provider_live(NEW.id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_provider_stripe_change ON public.providers;
CREATE TRIGGER on_provider_stripe_change
  AFTER UPDATE OF stripe_charges_enabled ON public.providers
  FOR EACH ROW
  WHEN (NEW.stripe_charges_enabled IS DISTINCT FROM OLD.stripe_charges_enabled)
  EXECUTE FUNCTION public.handle_provider_stripe_change();
