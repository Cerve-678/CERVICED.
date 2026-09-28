-- DRAFT — NOT YET APPLIED. Rename above the live max(version) at apply time;
-- claim the migration lock first (CLAUDE.md migration-ownership rule).
--
-- The payout ledger for the "buyers purchase from you + split payouts + HOLD"
-- model (user decisions 2026-09-27/28). One row per provider per paid booking:
-- it records that provider's share, the platform fee retained, and where the
-- money currently is on its journey from the platform balance to the
-- provider's connected account. This is the spine the release job, the
-- webhook, and the refund function all read/write.
--
-- Money flow this models:
--   client pays -> captured into PLATFORM balance (existing flow)
--   -> a 'held' payout row is created here
--   -> release job creates a Stripe Transfer once appt passed + window closed
--   -> 'transferred'
--   Refund before transfer -> 'cancelled' (nothing to claw back)
--   Refund after transfer  -> 'reversed'  (transfer reversal from provider)

CREATE TABLE IF NOT EXISTS public.provider_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What this payout is for. A booking has exactly one payout row per provider;
  -- a multi-provider checkout produces several rows (the "split").
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,

  -- The provider's connected account at the time of payout. Snapshotted so a
  -- later change to providers.stripe_account_id can't misroute an old payout.
  stripe_account_id text NOT NULL,

  -- The split, in pence, all derived server-side from the priced checkout —
  -- never from anything the client sends.
  --   gross_amount   = what the client paid for THIS provider's services
  --   platform_fee   = the cut CERVICED retains (Uber-Eats model)
  --   payout_amount  = gross_amount - platform_fee = what the provider receives
  gross_amount integer NOT NULL CHECK (gross_amount >= 0),
  platform_fee integer NOT NULL CHECK (platform_fee >= 0),
  payout_amount integer NOT NULL CHECK (payout_amount >= 0),
  currency text NOT NULL DEFAULT 'gbp',

  -- Lifecycle. 'held' is the resting state until release is due.
  status text NOT NULL DEFAULT 'held'
    CHECK (status IN ('held', 'transferred', 'cancelled', 'reversed', 'failed')),

  -- When the release job is allowed to transfer this: appointment end +
  -- cancellation window. Set at creation from the booking + provider policy.
  -- The job picks up rows where status='held' AND release_after <= now().
  release_after timestamptz NOT NULL,

  -- Stripe references, filled as the money moves.
  stripe_transfer_id text,        -- set when transferred
  stripe_reversal_id text,        -- set when reversed after a post-transfer refund
  failure_reason text,            -- set when status='failed' (real reason; user sees friendly copy)

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- payout_amount must actually be the remainder — a cheap integrity guard so a
  -- miscomputed split can never be written.
  CONSTRAINT provider_payouts_split_adds_up
    CHECK (payout_amount = gross_amount - platform_fee),
  -- One payout per provider per booking. Makes creation idempotent and stops a
  -- double-transfer if the finalize path ever runs twice.
  CONSTRAINT provider_payouts_one_per_booking_provider
    UNIQUE (booking_id, provider_id)
);

-- The release job's hot path: find due, still-held payouts.
CREATE INDEX IF NOT EXISTS idx_provider_payouts_due
  ON public.provider_payouts (release_after)
  WHERE status = 'held';

-- Provider-facing "my earnings/payouts" reads.
CREATE INDEX IF NOT EXISTS idx_provider_payouts_provider
  ON public.provider_payouts (provider_id, created_at DESC);

ALTER TABLE public.provider_payouts ENABLE ROW LEVEL SECURITY;

-- A provider may READ their own payout rows (for an earnings screen). Nobody
-- may INSERT/UPDATE/DELETE from the client roles — every write is server-side
-- via SECURITY DEFINER RPC / the service role (release job, webhook, refund).
-- Money rows the client could edit would defeat the whole point.
CREATE POLICY provider_payouts_owner_read ON public.provider_payouts
  FOR SELECT TO authenticated
  USING (
    provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
  );

-- No client-role write policies on purpose: with RLS enabled and no permissive
-- INSERT/UPDATE/DELETE policy, those are denied for anon/authenticated. The
-- service role bypasses RLS for the server-side writers.

CREATE TRIGGER set_provider_payouts_updated_at
  BEFORE UPDATE ON public.provider_payouts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
