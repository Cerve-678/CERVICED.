-- Lets a provider see where a bank dispute on their own bookings stands.
-- payment_disputes / payment_dispute_bookings (20261115090000) are server-only,
-- so the provider's payout list could only say "Returned" for a payout taken
-- back for a dispute, and kept saying it after CERVICED won and paid them
-- back. Provider Terms §9 promises that payback; this lets the app show it,
-- and show a payout waiting on a dispute instead of "Awaiting release".
--
-- Returns one row per dispute touching the caller's OWN bookings (booking
-- payments through payment_dispute_bookings; late/no-show fees, which have a
-- payment of their own, through the fee's payment intent). Nothing about the
-- dispute itself (amount, reason, Stripe ids) and nothing about another
-- provider's booking is returned. Read-only.

BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public.payment_dispute_bookings') IS NULL THEN
    RAISE EXCEPTION 'payment_dispute_bookings is missing; apply 20261115090000 first';
  END IF;
  IF to_regprocedure('public.provider_bank_dispute_states(uuid[])') IS NOT NULL THEN
    RAISE EXCEPTION 'provider_bank_dispute_states already exists; this migration has run';
  END IF;
END
$guard$;

CREATE FUNCTION public.provider_bank_dispute_states(p_booking_ids uuid[])
RETURNS TABLE (
  booking_id      uuid,
  fee_charge_id   uuid,     -- NULL for the booking's own payment
  role            text,     -- 'disputed' (this booking) or 'frozen' (waiting for CERVICED to match it)
  closed          boolean,
  outcome         text,     -- 'won' | 'lost' | NULL while open
  paid_back_pence integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  -- The caller's own bookings only: a provider reading their own record.
  WITH mine AS (
    SELECT b.id, b.provider_id
    FROM bookings b
    JOIN providers p ON p.id = b.provider_id
    WHERE p.user_id = auth.uid()
      AND b.id = ANY ((p_booking_ids)[1:100])
  )
  SELECT l.booking_id, NULL::uuid, l.role, d.closed_at IS NOT NULL, d.outcome, l.paid_back_pence
  FROM payment_dispute_bookings l
  JOIN payment_disputes d ON d.id = l.dispute_id
  WHERE l.booking_id IN (SELECT id FROM mine)
  UNION ALL
  SELECT f.booking_id, f.id, 'disputed', d.closed_at IS NOT NULL, d.outcome, 0
  FROM booking_fee_charges f
  JOIN mine m ON m.id = f.booking_id AND m.provider_id = f.provider_id
  JOIN payment_disputes d ON d.payment_intent_id = f.payment_intent_id
  LIMIT 500;
$function$;

REVOKE EXECUTE ON FUNCTION public.provider_bank_dispute_states(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provider_bank_dispute_states(uuid[]) TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261116120000', 'provider_bank_dispute_states')
ON CONFLICT (version) DO NOTHING;

COMMIT;
