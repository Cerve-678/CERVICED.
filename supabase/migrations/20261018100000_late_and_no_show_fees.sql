-- Late-arrival and no-show fees a provider charges AFTER the appointment.
--
-- User decision 2026-10-12/13 (auto-memory late-and-no-show-fees-decision),
-- reversing the 2026-10-02 "refund-only, never charge again" rule:
--   • two fixed £ fees in the provider's policy: booking_policies.lateFee and
--     booking_policies.noShowFee
--   • each capped at 50% of the booking's price
--   • chargeable only within 24 hours of the appointment ending, once per booking
--   • CERVICED takes no cut; Stripe's actual card fee comes out of the provider's share
--   • CERVICED never adjudicates: a client's dispute goes to the PROVIDER, who
--     refunds or keeps it
--
-- 1. bookings.late_fee_pence / no_show_fee_pence — frozen from the provider's
--    LIVE policy by a trigger at insert, never from the app. (policy_snapshot is
--    client-supplied content, so it is not trusted for money.) Updates can't
--    change them.
-- 2. checkout_batches.fee_consent_at + accept_checkout_fees() — the client's
--    agreement that their card may be charged these fees, stamped by the DB
--    clock before payment. create-payment-intent refuses a batch with fees
--    and no consent, and only then saves the card for off-session use.
-- 3. users.stripe_customer_id — the Stripe Customer that holds a client's saved
--    card, plus its server-only write guard. Copied VERBATIM from the saved-cards
--    branch's 20261018120000_client_stripe_customer_id.sql (one store for one
--    fact; every statement is idempotent), so either migration may apply first
--    and the other is a no-op.
-- 4. booking_fee_charges — one row per fee attempt, the provider's payout for
--    it, and the client's dispute + the provider's answer. Written only by edge
--    functions and the two RPCs below. Kept separate from provider_payouts on
--    purpose: six code paths read that table as exactly one row per booking.
-- 5. dispute_booking_fee() (client) and keep_disputed_booking_fee() (provider).
--    A refund outcome is written by the charge-booking-fee function, since it
--    moves money through Stripe.
-- 6. notifications type check gains fee_charged, fee_disputed, fee_dispute_resolved.
--    Rebuilt from the live constraint (verified 2026-10-17) plus the new values.
--
-- Frontier at authoring: 20261011102423. Apply by pasting into the Supabase SQL
-- editor (apply_migration can't parse function bodies here — MIGRATION_OWNER.md).

BEGIN;

-- 1. Fee amounts frozen on the booking ----------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS late_fee_pence integer CHECK (late_fee_pence IS NULL OR late_fee_pence > 0),
  ADD COLUMN IF NOT EXISTS no_show_fee_pence integer CHECK (no_show_fee_pence IS NULL OR no_show_fee_pence > 0);

COMMENT ON COLUMN public.bookings.late_fee_pence IS
  'Late-arrival fee the client agreed to, frozen from providers.booking_policies.lateFee at insert and capped at 50% of base_price. Server-set only.';
COMMENT ON COLUMN public.bookings.no_show_fee_pence IS
  'No-show fee the client agreed to, frozen from providers.booking_policies.noShowFee at insert and capped at 50% of base_price. Server-set only.';

-- A policy value in £ → pence, capped at half the price; NULL when unset/zero.
CREATE OR REPLACE FUNCTION public.booking_fee_pence(p_policy_value text, p_base_price numeric)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_fee integer;
  v_cap integer := floor(COALESCE(p_base_price, 0) * 100 / 2)::integer;
BEGIN
  IF p_policy_value IS NULL OR p_policy_value !~ '^\s*\d+(\.\d{1,2})?\s*$' THEN
    RETURN NULL;
  END IF;
  v_fee := round(p_policy_value::numeric * 100)::integer;
  v_fee := LEAST(v_fee, v_cap);
  RETURN NULLIF(GREATEST(v_fee, 0), 0);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.snapshot_booking_fees()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_policies jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Frozen at booking time: nothing may change what the client agreed to.
    NEW.late_fee_pence := OLD.late_fee_pence;
    NEW.no_show_fee_pence := OLD.no_show_fee_pence;
    RETURN NEW;
  END IF;

  SELECT p.booking_policies INTO v_policies FROM public.providers p WHERE p.id = NEW.provider_id;
  NEW.late_fee_pence := public.booking_fee_pence(v_policies->>'lateFee', NEW.base_price);
  NEW.no_show_fee_pence := public.booking_fee_pence(v_policies->>'noShowFee', NEW.base_price);
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS before_booking_snapshot_fees ON public.bookings;
CREATE TRIGGER before_booking_snapshot_fees
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_booking_fees();

-- 2. The client's agreement, per checkout --------------------------------------
ALTER TABLE public.checkout_batches
  ADD COLUMN IF NOT EXISTS fee_consent_at timestamptz;

CREATE OR REPLACE FUNCTION public.accept_checkout_fees(p_checkout_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in is required'; END IF;
  UPDATE public.checkout_batches
     SET fee_consent_at = COALESCE(fee_consent_at, now())
   WHERE id = p_checkout_batch_id
     AND user_id = auth.uid()
     AND status = 'prepared';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checkout has expired. Please review your booking and try again.';
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION public.accept_checkout_fees(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_checkout_fees(uuid) TO authenticated;

-- What the client is agreeing to, per provider in this checkout: the frozen
-- amounts on the held rows (clients can't read bookings directly), plus the
-- provider's grace minutes so "late" means something concrete.
CREATE OR REPLACE FUNCTION public.get_checkout_fees(p_checkout_batch_id uuid)
RETURNS TABLE (provider_id uuid, provider_name text, late_fee_pence integer, no_show_fee_pence integer, grace_minutes integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT b.provider_id,
         MAX(COALESCE(NULLIF(BTRIM(b.provider_name_snapshot), ''), p.display_name)) AS provider_name,
         MAX(b.late_fee_pence) AS late_fee_pence,
         MAX(b.no_show_fee_pence) AS no_show_fee_pence,
         MAX(CASE WHEN p.booking_policies->>'noShowGraceMinutes' ~ '^\d{1,3}$'
                  THEN (p.booking_policies->>'noShowGraceMinutes')::integer ELSE 0 END) AS grace_minutes
    FROM public.bookings b
    JOIN public.checkout_batches c ON c.id = b.hold_batch_id
    JOIN public.providers p ON p.id = b.provider_id
   WHERE c.id = p_checkout_batch_id
     AND c.user_id = auth.uid()
     AND b.status = 'on_hold'
     AND (b.late_fee_pence IS NOT NULL OR b.no_show_fee_pence IS NOT NULL)
   GROUP BY b.provider_id;
$fn$;

REVOKE ALL ON FUNCTION public.get_checkout_fees(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_checkout_fees(uuid) TO authenticated;

-- 3. Saved-card customer (verbatim from 20261018120000) ------------------------
ALTER TABLE public.users
  -- UNIQUE so two user rows can never share one Stripe Customer.
  ADD COLUMN IF NOT EXISTS stripe_customer_id text UNIQUE;

COMMENT ON COLUMN public.users.stripe_customer_id IS
  'Stripe Customer id (cus_...) for this client''s saved cards. Written '
  'server-side only (client-saved-cards / create-payment-intent, service '
  'role); a client write is rejected by enforce_user_stripe_customer_server_only.';

-- SERVER-ONLY WRITE GUARD. Same reasoning as the provider guard
-- (20260929050657_guard_provider_stripe_columns_server_only): a column-level
-- REVOKE is a no-op here because clients hold a table-level UPDATE grant on
-- public.users and the users-own-row RLS policy lets them update every column
-- of their own row. Left unguarded, a client could point stripe_customer_id at
-- someone else's Customer (reading or paying with another person's saved
-- cards) or clear it. These writes must only ever come from the service role.
--
-- SECURITY INVOKER on purpose: the guard must read the REAL request role via
-- current_user (PostgREST SET ROLEs to 'authenticated'/'anon'/'service_role'
-- per request); a DEFINER function would report the owner and defeat the check.
CREATE OR REPLACE FUNCTION public.enforce_user_stripe_customer_server_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
     AND current_user IN ('authenticated', 'anon')
  THEN
    RAISE EXCEPTION 'Saved-card account is managed by the payment system and cannot be changed directly.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

-- Covers INSERT too: a client creating their own users row must not seed it.
CREATE OR REPLACE FUNCTION public.enforce_user_stripe_customer_server_only_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.stripe_customer_id IS NOT NULL
     AND current_user IN ('authenticated', 'anon')
  THEN
    RAISE EXCEPTION 'Saved-card account is managed by the payment system and cannot be changed directly.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.enforce_user_stripe_customer_server_only() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_user_stripe_customer_server_only_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_user_stripe_customer_server_only ON public.users;
CREATE TRIGGER enforce_user_stripe_customer_server_only
  BEFORE UPDATE OF stripe_customer_id
  ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_user_stripe_customer_server_only();

DROP TRIGGER IF EXISTS enforce_user_stripe_customer_server_only_insert ON public.users;
CREATE TRIGGER enforce_user_stripe_customer_server_only_insert
  BEFORE INSERT
  ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_user_stripe_customer_server_only_insert();

-- 4. Fee charges ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.booking_fee_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  client_user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('late', 'no_show')),
  amount_pence integer NOT NULL CHECK (amount_pence > 0),
  currency text NOT NULL DEFAULT 'gbp',
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'succeeded', 'failed', 'refunded')),
  payment_intent_id text UNIQUE,
  failure_reason text,
  charged_at timestamptz,
  -- The provider's share: amount minus Stripe's actual card fee.
  stripe_fee_pence integer CHECK (stripe_fee_pence IS NULL OR stripe_fee_pence >= 0),
  payout_pence integer CHECK (payout_pence IS NULL OR payout_pence >= 0),
  payout_status text NOT NULL DEFAULT 'pending'
    CHECK (payout_status IN ('pending', 'held', 'transferred', 'cancelled', 'reversed', 'failed')),
  stripe_account_id text,
  release_after timestamptz,
  stripe_transfer_id text,
  payout_failure_reason text,
  -- Client dispute → provider's answer. CERVICED never decides.
  disputed_at timestamptz,
  dispute_reason text,
  dispute_outcome text CHECK (dispute_outcome IS NULL OR dispute_outcome IN ('refunded', 'kept')),
  dispute_response text,
  dispute_resolved_at timestamptz,
  stripe_refund_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One live fee per booking. A failed attempt doesn't block a retry.
CREATE UNIQUE INDEX IF NOT EXISTS booking_fee_charges_one_per_booking
  ON public.booking_fee_charges (booking_id) WHERE status <> 'failed';
CREATE INDEX IF NOT EXISTS booking_fee_charges_provider_idx ON public.booking_fee_charges (provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS booking_fee_charges_client_idx ON public.booking_fee_charges (client_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS booking_fee_charges_due_payout_idx
  ON public.booking_fee_charges (release_after) WHERE payout_status = 'held';

DROP TRIGGER IF EXISTS booking_fee_charges_updated_at ON public.booking_fee_charges;
CREATE TRIGGER booking_fee_charges_updated_at
  BEFORE UPDATE ON public.booking_fee_charges
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.booking_fee_charges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_fee_charges FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.booking_fee_charges FROM authenticated;
GRANT SELECT ON public.booking_fee_charges TO authenticated;

DROP POLICY IF EXISTS booking_fee_charges_client_read ON public.booking_fee_charges;
CREATE POLICY booking_fee_charges_client_read ON public.booking_fee_charges
  FOR SELECT TO authenticated USING (client_user_id = auth.uid());

DROP POLICY IF EXISTS booking_fee_charges_provider_read ON public.booking_fee_charges;
CREATE POLICY booking_fee_charges_provider_read ON public.booking_fee_charges
  FOR SELECT TO authenticated
  USING (provider_id IN (SELECT p.id FROM public.providers p WHERE p.user_id = auth.uid()));

-- 5. Disputes: client raises, provider answers ----------------------------------
CREATE OR REPLACE FUNCTION public.dispute_booking_fee(p_charge_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_window CONSTANT interval := interval '7 days';
  v_charge public.booking_fee_charges%ROWTYPE;
  v_reason text := LEFT(NULLIF(BTRIM(COALESCE(p_reason, '')), ''), 1000);
  v_provider_user uuid;
  v_client_name text;
  v_service_name text;
BEGIN
  IF v_reason IS NULL THEN RAISE EXCEPTION 'Please say why you think this fee is wrong.'; END IF;

  SELECT * INTO v_charge FROM public.booking_fee_charges WHERE id = p_charge_id FOR UPDATE;
  IF NOT FOUND OR v_charge.client_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Fee not found';
  END IF;
  IF v_charge.status <> 'succeeded' THEN RAISE EXCEPTION 'Only a fee that was charged can be disputed.'; END IF;
  IF v_charge.disputed_at IS NOT NULL THEN RAISE EXCEPTION 'You have already disputed this fee.'; END IF;
  IF now() > v_charge.charged_at + v_window THEN
    RAISE EXCEPTION 'The 7 days to dispute this fee have passed. Please contact the provider directly.';
  END IF;

  UPDATE public.booking_fee_charges
     SET disputed_at = now(), dispute_reason = v_reason
   WHERE id = p_charge_id;

  SELECT p.user_id INTO v_provider_user FROM public.providers p WHERE p.id = v_charge.provider_id;
  SELECT b.customer_name, b.service_name_snapshot INTO v_client_name, v_service_name
    FROM public.bookings b WHERE b.id = v_charge.booking_id;

  IF v_provider_user IS NOT NULL THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role, metadata)
    VALUES (
      v_provider_user, 'fee_disputed',
      COALESCE(split_part(NULLIF(BTRIM(v_client_name), ''), ' ', 1), 'Your client') || ' disputed a fee',
      'They say: "' || LEFT(v_reason, 140) || '". Refund it or keep it from the booking.',
      'high', TRUE, v_charge.booking_id, v_charge.provider_id, 'provider',
      jsonb_build_object('fee_charge_id', v_charge.id, 'amount_pence', v_charge.amount_pence, 'kind', v_charge.kind)
    );
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.keep_disputed_booking_fee(p_charge_id uuid, p_response text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_charge public.booking_fee_charges%ROWTYPE;
  v_response text := LEFT(NULLIF(BTRIM(COALESCE(p_response, '')), ''), 1000);
  v_provider_name text;
BEGIN
  IF v_response IS NULL THEN RAISE EXCEPTION 'Please tell the client why the fee stands.'; END IF;

  SELECT * INTO v_charge FROM public.booking_fee_charges WHERE id = p_charge_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.providers p WHERE p.id = v_charge.provider_id AND p.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Fee not found';
  END IF;
  IF v_charge.disputed_at IS NULL OR v_charge.dispute_resolved_at IS NOT NULL OR v_charge.status <> 'succeeded' THEN
    RAISE EXCEPTION 'This fee has no open dispute.';
  END IF;

  UPDATE public.booking_fee_charges
     SET dispute_outcome = 'kept', dispute_response = v_response, dispute_resolved_at = now()
   WHERE id = p_charge_id;

  SELECT b.provider_name_snapshot INTO v_provider_name FROM public.bookings b WHERE b.id = v_charge.booking_id;
  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role, metadata)
  VALUES (
    v_charge.client_user_id, 'fee_dispute_resolved', 'Your fee dispute was answered',
    COALESCE(NULLIF(BTRIM(v_provider_name), ''), 'Your provider') || ' is keeping the fee: "' || LEFT(v_response, 140) || '"',
    'medium', FALSE, v_charge.booking_id, v_charge.provider_id, 'client',
    jsonb_build_object('fee_charge_id', v_charge.id, 'outcome', 'kept')
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.dispute_booking_fee(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.keep_disputed_booking_fee(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dispute_booking_fee(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.keep_disputed_booking_fee(uuid, text) TO authenticated;

-- 5b. Wake the payout job for fee payouts too ----------------------------------
-- Reproduced from the live process_due_payouts() (verified 2026-10-18); only the
-- "anything due?" check changes, so a fee payout alone still triggers a run.
CREATE OR REPLACE FUNCTION public.process_due_payouts()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.provider_payouts
     WHERE status = 'held' AND release_after <= now()
  ) AND NOT EXISTS (
    SELECT 1 FROM public.booking_fee_charges
     WHERE payout_status = 'held' AND release_after <= now()
  ) THEN
    RETURN false;
  END IF;

  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
   WHERE name = 'service_role_key'
   LIMIT 1;
  IF v_key IS NULL OR v_key = '' OR v_key LIKE '<%' THEN
    RETURN false;
  END IF;

  PERFORM net.http_post(
    url     := 'https://ztrfpfvvejzaysrelmfm.supabase.co/functions/v1/release-payouts',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  RETURN true;
END;
$function$;

-- 6. Notification types ---------------------------------------------------------
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'cancel_window_closing', 'booking_pending', 'booking_confirmed', 'booking_declined',
    'booking_cancelled', 'booking_reminder', 'booking_in_progress', 'booking_not_started',
    'no_show', 'payment_success', 'new_provider', 'reschedule_request',
    'reschedule_provider_response', 'reschedule_confirmed', 'reschedule_declined',
    'reschedule_expired', 'review_request', 'review_received', 'promotion',
    'intake_form_reminder', 'intake_form_received', 'intake_form_completed',
    'info_pack_received', 'provider_message', 'announcement', 'balance_reminder',
    'waitlist_slot_available', 'new_message', 'address_released', 'birthday_greeting',
    'post_appt_check_in', 'rebooking_nudge', 'daily_recap', 'schedule_fully_booked',
    'pending_booking_reminder', 'provider_no_show', 'no_show_disputed', 'points_earned',
    'cancellation_settled',
    'fee_charged', 'fee_disputed', 'fee_dispute_resolved'
  ]::text[]));

COMMIT;
