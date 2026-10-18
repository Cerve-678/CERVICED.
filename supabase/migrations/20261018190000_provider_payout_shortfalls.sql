-- APPLIED 2026-10-18 (SQL editor, recorded as 20261018190000). Written 2026-10-18 on feat/refund-payout-protection.
-- Apply AFTER 20261018180000_beauty_maintenance, and after 20261018165835 (payout timing) and 20261018165847 (refund
-- requests): the release job deployed with this reads refund_requests.
--
-- When Cerviced has to take money back from a provider who was already paid
-- (a refund, a cancellation settlement, a refunded late/no-show fee, a bank
-- dispute), it reverses the Stripe transfer. If the provider's Stripe balance
-- can't cover the reversal, Stripe refuses it, and until now that error simply
-- failed the request. This records what the provider still owes as a
-- shortfall, and the release job takes it out of their next booking payout
-- before transferring the rest.
--
-- Verified live before writing (2026-10-18): provider_payouts still carries
-- provider_payouts_split_adds_up, CHECK (payout_amount = gross_amount -
-- platform_fee). Every refund path lowers payout_amount (reconcileRefund,
-- apply-cancellation-refund, the transfer.reversed webhook sets it to 0), so
-- each of those writes has been failing that check. Only one refund exists
-- live and it needed no payout change, so nothing has been lost yet. It is
-- replaced with "never more than the split".

BEGIN;

ALTER TABLE public.provider_payouts DROP CONSTRAINT IF EXISTS provider_payouts_split_adds_up;
ALTER TABLE public.provider_payouts ADD CONSTRAINT provider_payouts_within_split
  CHECK (payout_amount <= gross_amount - platform_fee);

-- How much of this payout went to settling earlier shortfalls instead of to
-- the provider. The Stripe transfer is payout_amount - deducted_pence.
ALTER TABLE public.provider_payouts
  ADD COLUMN IF NOT EXISTS deducted_pence integer NOT NULL DEFAULT 0
  CONSTRAINT provider_payouts_deducted_pence_check CHECK (deducted_pence >= 0);

-- Set when a release starts sending this payout. A refund can't lower a held
-- payout once it's set (reconcileRefund filters on it), so the amount being
-- transferred can't change under the release; the refund retries and then
-- reverses from the transfer instead.
ALTER TABLE public.provider_payouts
  ADD COLUMN IF NOT EXISTS release_claimed_at timestamptz;

CREATE TABLE IF NOT EXISTS public.provider_shortfalls (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id      uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  booking_id       uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  source           text NOT NULL CHECK (source IN ('refund', 'cancellation', 'fee_refund', 'bank_dispute')),
  -- The idempotency key of the reversal that failed, so a retried webhook or
  -- request records the same shortfall once.
  source_key       text NOT NULL UNIQUE,
  stripe_transfer_id text,
  amount_pence     integer NOT NULL CHECK (amount_pence > 0),
  -- The part Stripe refused to reverse, which is therefore still inside
  -- stripe_transfer_id (the rest was never in the transfer). The webhook's
  -- transfer check adds it back.
  unreversed_pence integer NOT NULL DEFAULT 0,
  recovered_pence  integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  settled_at       timestamptz,
  CONSTRAINT provider_shortfalls_recovered_range CHECK (recovered_pence BETWEEN 0 AND amount_pence),
  CONSTRAINT provider_shortfalls_unreversed_range CHECK (unreversed_pence BETWEEN 0 AND amount_pence)
);

CREATE INDEX IF NOT EXISTS provider_shortfalls_open_idx
  ON public.provider_shortfalls (provider_id, created_at) WHERE recovered_pence < amount_pence;

-- Which payout settled how much of which shortfall.
CREATE TABLE IF NOT EXISTS public.provider_shortfall_recoveries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shortfall_id  uuid NOT NULL REFERENCES public.provider_shortfalls(id) ON DELETE CASCADE,
  payout_id     uuid NOT NULL REFERENCES public.provider_payouts(id) ON DELETE CASCADE,
  amount_pence  integer NOT NULL CHECK (amount_pence > 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_shortfall_recoveries_once UNIQUE (shortfall_id, payout_id)
);
CREATE INDEX IF NOT EXISTS provider_shortfall_recoveries_payout_idx
  ON public.provider_shortfall_recoveries (payout_id);

-- Providers can see their own shortfalls; only the server writes them.
ALTER TABLE public.provider_shortfalls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_shortfall_recoveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS provider_shortfalls_owner_read ON public.provider_shortfalls;
CREATE POLICY provider_shortfalls_owner_read ON public.provider_shortfalls
  FOR SELECT TO authenticated
  USING (provider_id IN (SELECT p.id FROM public.providers p WHERE p.user_id = auth.uid()));
REVOKE ALL ON public.provider_shortfalls FROM anon, authenticated;
REVOKE ALL ON public.provider_shortfall_recoveries FROM anon, authenticated;
-- Not source_key or stripe_transfer_id: those are internal.
GRANT SELECT (id, provider_id, booking_id, source, amount_pence, recovered_pence, created_at, settled_at)
  ON public.provider_shortfalls TO authenticated;

-- Called just before a held payout is transferred (release-payouts, and
-- apply-cancellation-refund's late-cancel settlement). Takes what the provider
-- owes (oldest first) out of this payout, records it, and returns the amount
-- to TRANSFER (payout_amount - deducted_pence), read under the row lock. Safe
-- to repeat: a payout that already had deductions returns the same figure.
-- If the transfer then fails, release_provider_shortfalls() gives it back.
CREATE OR REPLACE FUNCTION public.apply_provider_shortfalls(p_payout_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_payout record;
  v_left integer;
  v_take integer;
  v_total integer := 0;
  v_shortfall record;
BEGIN
  SELECT id, provider_id, status, payout_amount, deducted_pence
    INTO v_payout
    FROM public.provider_payouts WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND OR v_payout.status <> 'held' THEN
    RAISE EXCEPTION 'payout % is not held', p_payout_id;
  END IF;
  UPDATE public.provider_payouts SET release_claimed_at = COALESCE(release_claimed_at, now()) WHERE id = p_payout_id;
  IF EXISTS (SELECT 1 FROM public.provider_shortfall_recoveries WHERE payout_id = p_payout_id) THEN
    RETURN GREATEST(v_payout.payout_amount - v_payout.deducted_pence, 0);
  END IF;

  v_left := v_payout.payout_amount;
  FOR v_shortfall IN
    SELECT id, amount_pence - recovered_pence AS owed
      FROM public.provider_shortfalls
     WHERE provider_id = v_payout.provider_id AND recovered_pence < amount_pence
     ORDER BY created_at
     FOR UPDATE
  LOOP
    EXIT WHEN v_left <= 0;
    v_take := LEAST(v_shortfall.owed, v_left);
    INSERT INTO public.provider_shortfall_recoveries (shortfall_id, payout_id, amount_pence)
      VALUES (v_shortfall.id, p_payout_id, v_take);
    UPDATE public.provider_shortfalls
       SET recovered_pence = recovered_pence + v_take,
           settled_at = CASE WHEN recovered_pence + v_take >= amount_pence THEN now() ELSE settled_at END
     WHERE id = v_shortfall.id;
    v_left := v_left - v_take;
    v_total := v_total + v_take;
  END LOOP;

  IF v_total > 0 THEN
    UPDATE public.provider_payouts SET deducted_pence = v_total WHERE id = p_payout_id;
  END IF;
  RETURN v_payout.payout_amount - v_total;
END;
$function$;

-- Undoes apply_provider_shortfalls() for a payout whose transfer failed, so
-- the provider still owes it and the next payout tries again.
CREATE OR REPLACE FUNCTION public.release_provider_shortfalls(p_payout_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_recovery record;
BEGIN
  PERFORM 1 FROM public.provider_payouts WHERE id = p_payout_id FOR UPDATE;
  FOR v_recovery IN
    SELECT id, shortfall_id, amount_pence FROM public.provider_shortfall_recoveries
     WHERE payout_id = p_payout_id FOR UPDATE
  LOOP
    UPDATE public.provider_shortfalls
       SET recovered_pence = recovered_pence - v_recovery.amount_pence, settled_at = NULL
     WHERE id = v_recovery.shortfall_id;
    DELETE FROM public.provider_shortfall_recoveries WHERE id = v_recovery.id;
  END LOOP;
  UPDATE public.provider_payouts SET deducted_pence = 0, release_claimed_at = NULL WHERE id = p_payout_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_provider_shortfalls(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_provider_shortfalls(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_provider_shortfalls(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_provider_shortfalls(uuid) TO service_role;

COMMIT;
