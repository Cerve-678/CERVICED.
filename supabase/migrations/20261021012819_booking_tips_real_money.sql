-- A voluntary tip is a separate card payment after a completed appointment.
-- The provider receives the amount less Stripe's actual processing fee; there
-- is no CERVICED application/platform fee.
CREATE TABLE public.booking_tips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE RESTRICT,
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE RESTRICT,
  client_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  amount_pence integer NOT NULL CHECK (amount_pence BETWEEN 100 AND 50000),
  currency text NOT NULL DEFAULT 'gbp' CHECK (currency = 'gbp'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  payment_intent_id text UNIQUE,
  stripe_fee_pence integer CHECK (stripe_fee_pence IS NULL OR stripe_fee_pence >= 0),
  payout_pence integer CHECK (payout_pence IS NULL OR payout_pence >= 0),
  payout_status text NOT NULL DEFAULT 'pending'
    CHECK (payout_status IN ('pending', 'held', 'transferred', 'failed', 'cancelled', 'reversed')),
  release_after timestamptz,
  stripe_transfer_id text,
  stripe_refund_id text UNIQUE,
  failure_reason text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (payout_pence IS NULL OR payout_pence <= amount_pence)
);

COMMENT ON TABLE public.booking_tips IS
  'Server-owned Stripe tip ledger. Client writes are forbidden; provider payout is the tip less Stripe processing fees.';

CREATE INDEX booking_tips_client_idx ON public.booking_tips (client_user_id, created_at DESC);
CREATE INDEX booking_tips_provider_idx ON public.booking_tips (provider_id, created_at DESC);
CREATE INDEX booking_tips_due_payout_idx ON public.booking_tips (release_after) WHERE payout_status = 'held';

CREATE TRIGGER booking_tips_updated_at
  BEFORE UPDATE ON public.booking_tips
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.booking_tips ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_tips FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.booking_tips FROM authenticated;
GRANT SELECT ON public.booking_tips TO authenticated;

CREATE POLICY booking_tips_client_read ON public.booking_tips
  FOR SELECT TO authenticated USING (client_user_id = (select auth.uid()));
CREATE POLICY booking_tips_provider_read ON public.booking_tips
  FOR SELECT TO authenticated
  USING (provider_id IN (SELECT p.id FROM public.providers p WHERE p.user_id = (select auth.uid())));
