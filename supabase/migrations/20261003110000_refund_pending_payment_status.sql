-- Lets a booking say "Refund pending" while Stripe is still processing a
-- refund (reconcileRefund writes it; a succeeded refund moves the booking on to
-- partially_refunded / refunded, a failed one puts it back). The client's
-- booking details show this as the first of two steps: pending, then refunded.
--
-- Frontier at authoring: 20261003100000.

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_payment_status_check
  CHECK (payment_status IN (
    'pending', 'deposit_paid', 'fully_paid', 'refund_pending', 'refunded', 'partially_refunded', 'failed'
  ));
