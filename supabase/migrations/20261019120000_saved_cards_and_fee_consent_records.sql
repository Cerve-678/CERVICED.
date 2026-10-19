-- Saved cards on a private customer table, and a full record of every
-- late/no-show fee agreement.
--
-- User decisions 2026-10-19: use the private-table version of saved cards
-- (feat/combined-saved-cards-fees), and give fee consent a proper record
-- instead of the bare checkout_batches.fee_consent_at timestamp.
--
-- 1. client_stripe_customers — the Stripe Customer that holds a client's saved
--    cards. Service role only: RLS on, no policies, no client grants. Copies
--    any users.stripe_customer_id values across (none live at authoring).
--    users.stripe_customer_id itself stays until the new functions are
--    deployed; the follow-up migration that drops it must run AFTER that, or
--    the live create-payment-intent / booking-fee fail on a missing column.
-- 2. fee_terms_versions — the exact wording a client is shown (heading, body,
--    tick-box line) per version, with its sha256 set by the database.
--    Seeded with '2026-10-18', the text in src/constants/feeTerms.ts.
-- 3. fee_consent_records — one row per agreement: who, when (database clock),
--    which checkout, which wording version, and the fee amounts per provider
--    exactly as frozen on the held bookings. Clients can read their own;
--    nobody can write except accept_checkout_fees() and the service role.
--    No foreign key to the user on purpose: the record must outlive the
--    checkout and stay readable for a fee dispute or chargeback.
-- 4. booking_fee_charges.fee_consent_record_id — every fee charge names the
--    agreement it relies on.
-- 5. accept_checkout_fees(batch, version, sha256, platform, app_version)
--    replaces accept_checkout_fees(batch). It refuses an unknown version or a
--    hash that doesn't match that version's text, so the app can't record
--    agreement to wording the database doesn't hold. Still stamps
--    fee_consent_at, which the currently deployed functions read.
--
-- Frontier at authoring: 20261019011825. Apply by pasting into the Supabase
-- SQL editor (apply_migration can't parse function bodies here —
-- MIGRATION_OWNER.md), then record the version.

BEGIN;

-- 1. Private customer mapping -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_stripe_customers (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.client_stripe_customers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_stripe_customers FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.client_stripe_customers IS
  'Stripe Customer id (cus_...) per client for saved cards. Read and written '
  'only by edge functions with the service role.';

INSERT INTO public.client_stripe_customers (user_id, stripe_customer_id)
SELECT u.id, u.stripe_customer_id
  FROM public.users u
  JOIN auth.users a ON a.id = u.id
 WHERE u.stripe_customer_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 2. The wording, per version -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fee_terms_versions (
  version text PRIMARY KEY,
  heading text NOT NULL,
  body text NOT NULL,
  consent_line text NOT NULL,
  sha256 text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now()
);

-- The hash is always the database's own, never supplied. (A generated column
-- can't use convert_to, which Postgres marks STABLE.)
CREATE OR REPLACE FUNCTION public.set_fee_terms_sha256()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  NEW.sha256 := encode(sha256(convert_to(
    NEW.heading || E'\n\n' || NEW.body || E'\n\n' || NEW.consent_line, 'UTF8')), 'hex');
  RETURN NEW;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.set_fee_terms_sha256() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS before_fee_terms_sha256 ON public.fee_terms_versions;
CREATE TRIGGER before_fee_terms_sha256
  BEFORE INSERT OR UPDATE ON public.fee_terms_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_fee_terms_sha256();
ALTER TABLE public.fee_terms_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fee_terms_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fee_terms_versions TO authenticated;
DROP POLICY IF EXISTS fee_terms_versions_read ON public.fee_terms_versions;
CREATE POLICY fee_terms_versions_read ON public.fee_terms_versions
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.fee_terms_versions (version, heading, body, consent_line, sha256)
VALUES (
  '2026-10-18',
  'Late Arrival & No-Show Fees',
  'Some providers set a late arrival fee, a no-show fee, or both. Any fee is shown to you before you pay, and you must agree to it at checkout to book. If you agree, your card is saved securely by Stripe, and the provider may charge the agreed fee to it within 24 hours of your appointment: the late arrival fee if you arrive after the provider''s stated grace period, or the no-show fee if you do not attend. Each fee is fixed at the amount shown when you book, can be charged only once per booking, and can never be more than half the price of the booking. You will be notified whenever a fee is charged. If you believe a fee is wrong, you can dispute it with the provider in the app within 7 days of the charge, and the provider decides whether to refund it. Fees are paid to the provider, not to Cerviced, and Cerviced does not decide fee disputes. This does not affect your statutory rights, including your right to contact your bank.',
  'I agree to these fees and to the Late Arrival & No-Show Fees terms, and that my card will be saved so the provider can charge an agreed fee within 24 hours of my appointment.',
  ''  -- replaced by before_fee_terms_sha256
)
ON CONFLICT (version) DO NOTHING;

-- 3. One record per agreement -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fee_consent_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  checkout_batch_id uuid NOT NULL UNIQUE,
  terms_version text NOT NULL REFERENCES public.fee_terms_versions(version),
  terms_sha256 text NOT NULL,
  -- [{provider_id, provider_name, late_fee_pence, no_show_fee_pence, grace_minutes}]
  fees jsonb NOT NULL CHECK (jsonb_typeof(fees) = 'array' AND jsonb_array_length(fees) > 0),
  app_platform text CHECK (app_platform IS NULL OR length(app_platform) <= 20),
  app_version text CHECK (app_version IS NULL OR length(app_version) <= 40),
  consented_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fee_consent_records_user_idx ON public.fee_consent_records (user_id);
ALTER TABLE public.fee_consent_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fee_consent_records FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fee_consent_records TO authenticated;
DROP POLICY IF EXISTS fee_consent_records_own_read ON public.fee_consent_records;
CREATE POLICY fee_consent_records_own_read ON public.fee_consent_records
  FOR SELECT TO authenticated USING (user_id = auth.uid());
COMMENT ON TABLE public.fee_consent_records IS
  'A client''s agreement to late/no-show fees at checkout: who, when (DB clock), '
  'which wording version, and the frozen fee amounts per provider. Written only '
  'by accept_checkout_fees(); kept for fee disputes and chargebacks.';

-- 4. Each fee charge names its agreement ----------------------------------------
ALTER TABLE public.booking_fee_charges
  ADD COLUMN IF NOT EXISTS fee_consent_record_id uuid REFERENCES public.fee_consent_records(id);

-- 5. Recording the agreement ----------------------------------------------------
DROP FUNCTION IF EXISTS public.accept_checkout_fees(uuid);

CREATE OR REPLACE FUNCTION public.accept_checkout_fees(
  p_checkout_batch_id uuid,
  p_terms_version text,
  p_terms_sha256 text,
  p_app_platform text DEFAULT NULL,
  p_app_version text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_sha text;
  v_fees jsonb;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in is required'; END IF;

  SELECT t.sha256 INTO v_sha FROM public.fee_terms_versions t WHERE t.version = p_terms_version;
  IF v_sha IS NULL OR v_sha IS DISTINCT FROM p_terms_sha256 THEN
    RAISE EXCEPTION 'These fee terms have been updated. Please update the app and try again.';
  END IF;

  PERFORM 1 FROM public.checkout_batches c
   WHERE c.id = p_checkout_batch_id AND c.user_id = v_uid AND c.status = 'prepared'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checkout has expired. Please review your booking and try again.';
  END IF;

  -- Same amounts get_checkout_fees shows, read from the held rows themselves.
  SELECT jsonb_agg(jsonb_build_object(
           'provider_id', f.provider_id,
           'provider_name', f.provider_name,
           'late_fee_pence', f.late_fee_pence,
           'no_show_fee_pence', f.no_show_fee_pence,
           'grace_minutes', f.grace_minutes) ORDER BY f.provider_id)
    INTO v_fees
    FROM (
      SELECT b.provider_id,
             MAX(COALESCE(NULLIF(BTRIM(b.provider_name_snapshot), ''), p.display_name)) AS provider_name,
             MAX(b.late_fee_pence) AS late_fee_pence,
             MAX(b.no_show_fee_pence) AS no_show_fee_pence,
             MAX(CASE WHEN p.booking_policies->>'noShowGraceMinutes' ~ '^\d{1,3}$'
                      THEN (p.booking_policies->>'noShowGraceMinutes')::integer ELSE 0 END) AS grace_minutes
        FROM public.bookings b
        JOIN public.providers p ON p.id = b.provider_id
       WHERE b.hold_batch_id = p_checkout_batch_id
         AND b.status = 'on_hold'
         AND (b.late_fee_pence IS NOT NULL OR b.no_show_fee_pence IS NOT NULL)
       GROUP BY b.provider_id
    ) f;
  IF v_fees IS NULL THEN
    RAISE EXCEPTION 'There are no fees to agree to on this checkout.';
  END IF;

  INSERT INTO public.fee_consent_records
    (user_id, checkout_batch_id, terms_version, terms_sha256, fees, app_platform, app_version)
  VALUES
    (v_uid, p_checkout_batch_id, p_terms_version, v_sha, v_fees,
     left(p_app_platform, 20), left(p_app_version, 40))
  ON CONFLICT (checkout_batch_id) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT r.id INTO v_id FROM public.fee_consent_records r WHERE r.checkout_batch_id = p_checkout_batch_id;
  END IF;

  UPDATE public.checkout_batches
     SET fee_consent_at = COALESCE(fee_consent_at, now())
   WHERE id = p_checkout_batch_id;

  RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.accept_checkout_fees(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_checkout_fees(uuid, text, text, text, text) TO authenticated;

COMMIT;
