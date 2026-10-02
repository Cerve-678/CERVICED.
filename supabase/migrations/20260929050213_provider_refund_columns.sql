-- APPLIED 20260929050213 (2026-09-29). Additive (nullable columns + a REVOKE).
-- NOTE: the REVOKE is belt-and-braces only — bookings RLS has no UPDATE policy
-- at all, so clients cannot UPDATE any booking column regardless of grant.
--
-- Step 4 of the Connect build: audit columns for refunds. The refund-payment
-- edge function records the client-side refund here; the provider-side (the
-- payout row moving to 'cancelled' or 'reversed') is tracked in
-- provider_payouts. bookings.payment_status already permits 'refunded' (its
-- CHECK constraint), so nothing there changes.
--
-- Refund model (user decisions 2026-09-29): full refund of what the client
-- paid INCLUDING the platform fee — CERVICED does NOT keep its fee on a
-- refund. Refunds are provider-initiated or admin (service role); never auto.

ALTER TABLE public.bookings
  -- What was refunded to the client, in the same units as amount_paid (£).
  ADD COLUMN IF NOT EXISTS refunded_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  -- The Stripe refund object id, for reconciliation.
  ADD COLUMN IF NOT EXISTS stripe_refund_id text;

COMMENT ON COLUMN public.bookings.refunded_amount IS
  'Amount refunded to the client (£), set by refund-payment. Full refund incl. platform fee in v1.';
COMMENT ON COLUMN public.bookings.stripe_refund_id IS
  'Stripe refund id, set server-side by refund-payment. Never client-writable.';

-- These are set only server-side by the refund function (service role). A
-- client must never be able to fake a refund record, so revoke column-level
-- write from the client roles (SELECT stays governed by the existing bookings
-- RLS so a client can still see their own booking was refunded).
REVOKE UPDATE (
  refunded_amount,
  refunded_at,
  stripe_refund_id
) ON public.bookings FROM anon, authenticated;
