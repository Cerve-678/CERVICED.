-- ============================================================
-- Financial records survive account deletion (Stripe-integration ready)
-- ------------------------------------------------------------
-- Run this in the Supabase SQL editor BEFORE (re-)running
-- delete_account.sql — delete_client_profile()/delete_provider_profile()
-- now rely on transactions no longer cascading/erroring when the
-- users/providers/bookings rows they reference are deleted.
--
-- WHY: most jurisdictions (incl. UK/EU — this app bills in GBP)
-- legally require payment/transaction records to be kept for several
-- years for tax and dispute purposes, regardless of whether the
-- person who made them later deletes their account. Hard-deleting
-- `transactions` on account deletion (the original behaviour) would
-- have silently destroyed that legal record.
--
-- WHAT THIS DOES: drops the enforced foreign keys on
-- transactions.booking_id / user_id / provider_id (keeping the
-- columns themselves, NOT NULL, and their stored UUID values intact)
-- so that deleting a booking/user/provider elsewhere never touches
-- transactions at all. The historical amount / currency / status /
-- type / stripe_payment_intent_id / created_at — and the original
-- user_id / provider_id / booking_id values — stay exactly as they
-- were, forever. They're no longer *enforced* references (the row
-- they pointed at may legitimately be gone), but the UUIDs are still
-- there to manually cross-reference against account_deletion_log
-- below for a support dispute or analytics query.
--
-- This is intentionally NOT full anonymisation: no name/email/phone
-- lives on `transactions` itself (that's all on users/providers,
-- which DO get fully deleted) — a bare UUID with nothing left to
-- join it to is standard pseudonymised data, not identifying on its
-- own. That's what makes this compatible with "right to erasure"
-- while still satisfying financial record-keeping law.
--
-- ── FOR WHOEVER WIRES UP REAL STRIPE INTEGRATION ────────────
-- When live Stripe calls exist, also handle:
--   1. Detach/delete the Stripe customer's saved payment methods when
--      public.payment_methods rows are deleted (they still cascade-
--      delete on account deletion — that's correct, a saved card is
--      not a financial record worth retaining). Deleting the DB row
--      does NOT detach the card on Stripe's side — call the Stripe
--      API (or a pg_net → Edge Function call, same pattern as
--      supabase/push_token_setup.sql's send_push_on_notification_insert)
--      before/alongside the DB delete.
--   2. Cancel any active subscriptions tied to the account being
--      deleted, same reasoning.
--   3. Never delete or mutate `transactions` rows for a Stripe refund/
--      dispute webhook that arrives AFTER an account was deleted —
--      they're intentionally orphaned now; upsert by
--      stripe_payment_intent_id only.
-- ============================================================

ALTER TABLE public.transactions ALTER COLUMN booking_id   DROP NOT NULL;
ALTER TABLE public.transactions ALTER COLUMN user_id      DROP NOT NULL;
ALTER TABLE public.transactions ALTER COLUMN provider_id  DROP NOT NULL;

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_booking_id_fkey;
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_user_id_fkey;
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_provider_id_fkey;

-- ============================================================
-- Account deletion audit log
-- ------------------------------------------------------------
-- Not a soft-delete / undo mechanism — the actual profile data really
-- is gone. This exists purely so support/fraud/analytics can answer
-- "did user X delete their account, when, and what did they have"
-- after the fact, without the account row itself surviving anywhere.
-- user_id is intentionally NOT a foreign key (it must survive the
-- referenced row being deleted) — cross-reference it manually against
-- transactions.user_id / provider_id for a dispute investigation.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.account_deletion_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL,
  provider_id           UUID,
  email                 TEXT,
  deletion_type         TEXT NOT NULL CHECK (deletion_type IN ('client_profile', 'provider_profile', 'full_account')),
  had_client_profile    BOOLEAN NOT NULL,
  had_provider_profile  BOOLEAN NOT NULL,
  account_created_at    TIMESTAMPTZ,
  deleted_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_deletion_log_user_id ON public.account_deletion_log(user_id);

-- Locked down entirely: no client (not even the account being deleted)
-- can read or write this directly. Only the SECURITY DEFINER deletion
-- functions insert into it; only the Supabase dashboard / service role
-- can query it afterwards.
ALTER TABLE public.account_deletion_log ENABLE ROW LEVEL SECURITY;
