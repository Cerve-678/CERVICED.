-- A bank dispute takes money back only from the provider(s) it is about.
--
-- One checkout is one card payment that can pay several bookings with several
-- providers. Until now a dispute on that payment took back every provider's
-- payout and froze every unpaid one, however much was disputed (stripe-webhook
-- passDisputeToProvider; release-payouts skipped any booking on a disputed
-- charge). A client disputing £47.38 for one nail appointment cost the hair
-- and lash providers in the same basket their money too.
--
-- Now the webhook matches the disputed amount to bookings
-- (_shared/disputePlan.ts) and records the result here:
--   payment_disputes          one row per Stripe dispute
--   payment_dispute_bookings  which bookings it covers: 'disputed' (money is
--                             taken back from that provider) or 'frozen'
--                             (no match yet; the unpaid payout waits and
--                             nothing is taken back until an admin picks)
-- release-payouts reads these instead of the charge's disputed flag, so the
-- other providers on the payment are paid as normal, and a disputed booking's
-- payout is paid if CERVICED wins and dropped if it loses.
--
-- The owner's 2026-10-17 rule stands: the bank decides and the provider
-- whose booking it is carries the cost. This only makes sure it is the right
-- provider.
--
-- Only the server writes these tables. Admins read the undecided ones through
-- admin_bank_disputes() and decide through the assign-bank-dispute function,
-- which calls assign_bank_dispute() with the service role.

BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public.payment_disputes') IS NOT NULL OR to_regclass('public.payment_dispute_bookings') IS NOT NULL THEN
    RAISE EXCEPTION 'payment_disputes already exists; this migration has run or something else created it';
  END IF;
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint
       WHERE conrelid = 'public.admin_actions'::regclass AND conname = 'admin_actions_action_check')
     <> 'CHECK ((action = ANY (ARRAY[''retry_payout''::text, ''decline_refund_request''::text, ''approve_refund''::text, ''create_account''::text])))' THEN
    RAISE EXCEPTION 'admin_actions_action_check changed live since this migration was written; rebuild it from live';
  END IF;
END
$guard$;

CREATE TABLE public.payment_disputes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_dispute_id  text NOT NULL UNIQUE,
  charge_id          text NOT NULL,
  payment_intent_id  text NOT NULL,
  amount_pence       integer NOT NULL CHECK (amount_pence >= 0),
  reason             text,
  -- Stripe's own status, kept current by charge.dispute.* events.
  stripe_status      text NOT NULL,
  -- How the bookings were chosen. 'needs_admin' until an admin picks ('admin').
  attribution        text NOT NULL CHECK (attribution IN ('single_booking', 'amount', 'whole_charge', 'needs_admin', 'admin')),
  -- 'won' also covers an inquiry closed without a chargeback: no money lost.
  outcome            text CHECK (outcome IN ('won', 'lost')),
  opened_at          timestamptz NOT NULL DEFAULT now(),
  attributed_at      timestamptz,
  -- Kept (as NULL) if the admin's account is later deleted.
  attributed_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_at          timestamptz,
  CONSTRAINT payment_disputes_outcome_when_closed CHECK ((outcome IS NULL) = (closed_at IS NULL))
);
CREATE INDEX payment_disputes_charge_idx ON public.payment_disputes (charge_id);
CREATE INDEX payment_disputes_needs_admin_idx ON public.payment_disputes (opened_at) WHERE attribution = 'needs_admin';

CREATE TABLE public.payment_dispute_bookings (
  dispute_id             uuid NOT NULL REFERENCES public.payment_disputes(id) ON DELETE CASCADE,
  booking_id             uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  role                   text NOT NULL CHECK (role IN ('disputed', 'frozen')),
  -- What was paid back to the provider after CERVICED won (stripe-webhook).
  paid_back_pence        integer NOT NULL DEFAULT 0 CHECK (paid_back_pence >= 0),
  paid_back_transfer_id  text,
  PRIMARY KEY (dispute_id, booking_id)
);
CREATE INDEX payment_dispute_bookings_booking_idx ON public.payment_dispute_bookings (booking_id);

ALTER TABLE public.payment_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_dispute_bookings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_disputes FROM anon, authenticated;
REVOKE ALL ON public.payment_dispute_bookings FROM anon, authenticated;

ALTER TABLE public.admin_actions DROP CONSTRAINT admin_actions_action_check;
ALTER TABLE public.admin_actions ADD CONSTRAINT admin_actions_action_check
  CHECK (action = ANY (ARRAY['retry_payout'::text, 'decline_refund_request'::text, 'approve_refund'::text, 'create_account'::text, 'assign_bank_dispute'::text]));

-- Records a new dispute and the bookings it covers in one go, so a dispute is
-- never on file without them (release-payouts would then pay everyone). A
-- redelivered event finds the dispute already there and changes nothing.
-- p_links: [{ "booking_id": uuid, "role": "disputed" | "frozen" }]. Server only.
CREATE FUNCTION public.record_bank_dispute(
  p_stripe_dispute_id text, p_charge_id text, p_payment_intent_id text,
  p_amount_pence integer, p_reason text, p_stripe_status text,
  p_attribution text, p_links jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO payment_disputes (stripe_dispute_id, charge_id, payment_intent_id, amount_pence, reason, stripe_status, attribution)
  VALUES (p_stripe_dispute_id, p_charge_id, p_payment_intent_id, p_amount_pence, p_reason, p_stripe_status, p_attribution)
  ON CONFLICT (stripe_dispute_id) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM payment_disputes WHERE stripe_dispute_id = p_stripe_dispute_id;
    RETURN v_id;
  END IF;
  INSERT INTO payment_dispute_bookings (dispute_id, booking_id, role)
  SELECT v_id, (l->>'booking_id')::uuid, l->>'role'
    FROM jsonb_array_elements(COALESCE(p_links, '[]'::jsonb)) l;
  RETURN v_id;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.record_bank_dispute(text, text, text, integer, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;

-- Disputes the amount couldn't be matched to, with the bookings on each
-- payment, for the admin Money screen. Admin-only.
CREATE FUNCTION public.admin_bank_disputes()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_cerviced_admin() THEN
    RAISE EXCEPTION 'Only CERVICED admins can see this.';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(d) ORDER BY d.opened_at) FROM (
      SELECT pd.id AS dispute_id, pd.amount_pence, pd.reason, pd.stripe_status, pd.opened_at,
             (pd.closed_at IS NOT NULL) AS closed, pd.outcome,
             COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                        'booking_id', b.id,
                        'provider_name', p.display_name,
                        'client_name', b.customer_name,
                        'service_name', b.service_name_snapshot,
                        'booking_date', b.booking_date,
                        'paid_pence', ROUND(COALESCE(b.amount_paid, 0) * 100)::integer,
                        'refunded_pence', ROUND(COALESCE(b.refunded_amount, 0) * 100)::integer
                      ) ORDER BY b.booking_date, b.booking_time)
                 FROM payment_dispute_bookings l
                 JOIN bookings b ON b.id = l.booking_id
                 LEFT JOIN providers p ON p.id = b.provider_id
                WHERE l.dispute_id = pd.id), '[]'::jsonb) AS bookings
        FROM payment_disputes pd
       -- A dispute won before anyone picked needs nothing: no money was lost.
       WHERE pd.attribution = 'needs_admin' AND pd.outcome IS DISTINCT FROM 'won'
       ORDER BY pd.opened_at
       LIMIT 50) d), '[]'::jsonb);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.admin_bank_disputes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_bank_disputes() TO authenticated;

-- An admin's answer to "which bookings is this dispute about?". Called by the
-- assign-bank-dispute function (service role) after it has taken the money
-- back from the chosen providers, so a failed take-back leaves the dispute
-- waiting on the admin screen to try again. The chosen bookings become
-- 'disputed'; the rest stop being frozen and their payouts carry on.
-- Repeating the same answer is a no-op, so a retry is safe.
CREATE FUNCTION public.assign_bank_dispute(p_dispute_id uuid, p_booking_ids uuid[], p_admin_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_dispute payment_disputes%ROWTYPE;
  v_chosen uuid[];
BEGIN
  SELECT * INTO v_dispute FROM payment_disputes WHERE id = p_dispute_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That dispute no longer exists.';
  END IF;
  SELECT array_agg(DISTINCT x ORDER BY x) INTO v_chosen FROM unnest(p_booking_ids) x;
  IF v_chosen IS NULL THEN
    RAISE EXCEPTION 'Pick at least one booking.';
  END IF;

  IF v_dispute.outcome = 'won' AND v_dispute.attribution = 'needs_admin' THEN
    RAISE EXCEPTION 'CERVICED won this dispute, so nothing needs taking back.';
  END IF;
  IF v_dispute.attribution <> 'needs_admin' THEN
    -- Already answered: fine if it's the same answer (a retry), refused otherwise.
    IF v_dispute.attribution = 'admin' AND v_chosen = (
         SELECT array_agg(booking_id ORDER BY booking_id) FROM payment_dispute_bookings
          WHERE dispute_id = p_dispute_id AND role = 'disputed') THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'This dispute has already been decided.';
  END IF;

  IF EXISTS (SELECT 1 FROM unnest(v_chosen) x
              WHERE NOT EXISTS (SELECT 1 FROM payment_dispute_bookings
                                 WHERE dispute_id = p_dispute_id AND booking_id = x)) THEN
    RAISE EXCEPTION 'Those bookings weren''t paid by the disputed payment.';
  END IF;

  UPDATE payment_dispute_bookings SET role = 'disputed'
   WHERE dispute_id = p_dispute_id AND booking_id = ANY (v_chosen);
  DELETE FROM payment_dispute_bookings
   WHERE dispute_id = p_dispute_id AND NOT (booking_id = ANY (v_chosen));
  UPDATE payment_disputes
     SET attribution = 'admin', attributed_at = now(), attributed_by = p_admin_user_id
   WHERE id = p_dispute_id;

  INSERT INTO admin_actions (admin_user_id, action, target_id, detail)
  VALUES (p_admin_user_id, 'assign_bank_dispute', p_dispute_id,
          jsonb_build_object('stripe_dispute_id', v_dispute.stripe_dispute_id,
                             'booking_ids', to_jsonb(v_chosen),
                             'amount_pence', v_dispute.amount_pence));
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.assign_bank_dispute(uuid, uuid[], uuid) FROM PUBLIC, anon, authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261115090000', 'bank_dispute_per_booking')
ON CONFLICT (version) DO NOTHING;

COMMIT;
