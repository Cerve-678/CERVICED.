-- Allow 'partially_refunded' as a bookings.payment_status.
--
-- A cancellation-policy penalty where the provider keeps the deposit / their
-- share refunds only PART of the client's payment (apply-cancellation-refund +
-- reconcileRefund). The payout release job keys its "already refunded, don't
-- pay" skip on payment_status = 'refunded' specifically, so a partial penalty
-- refund must be a DISTINCT status rather than reusing 'refunded'.
--
-- WRITTEN, NOT YET APPLIED. Apply in the Supabase SQL editor (the
-- apply_migration MCP tool mis-parses; see MIGRATION_OWNER.md). This recreates
-- the payment_status CHECK with the full documented value set — verify the live
-- constraint's current values before running in case of drift, so no existing
-- row is left violating it.

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_check;

ALTER TABLE public.bookings ADD CONSTRAINT bookings_payment_status_check
  CHECK (payment_status IN (
    'pending', 'deposit_paid', 'fully_paid', 'refunded', 'partially_refunded', 'failed'
  ));
