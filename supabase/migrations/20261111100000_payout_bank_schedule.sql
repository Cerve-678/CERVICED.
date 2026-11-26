-- Providers choose how often Stripe pays them, not how long CERVICED holds
-- their money (user decision 2026-11-10).
--
-- Before: each provider picked a hold of 24 hours, 3, 7, 14 or 30 days
-- (providers.payout_hold_days, 20261018165835), and Stripe then paid their
-- bank on its own default schedule.
-- Now: every booking payout is held a fixed 24 hours after the appointment,
-- then released to the provider's Stripe balance; the provider picks daily,
-- weekly or monthly bank payouts, which the create-connect-account function
-- sets on their Stripe account (Balance Settings). Everyone starts on monthly.
--
-- * create_held_payout_on_finalize: fixed 24-hour hold.
-- * set_payout_hold_days and providers.payout_hold_days: dropped.
-- * providers.stripe_payout_schedule_set_at: when the app last set this
--   provider's Stripe schedule. NULL = never, so the default is applied once,
--   on the first Payments read or at account creation. Server-written only.
--
-- Payouts already held keep their release_after: nothing is moved.
-- Redefined from live (md5-guarded), per supabase/MIGRATION_OWNER.md.

BEGIN;

DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.create_held_payout_on_finalize'::regproc)) <> '421a396a74a79acf60e244bca1cef5c8' THEN
    RAISE EXCEPTION 'create_held_payout_on_finalize changed live since this migration was written; rebuild it from live';
  END IF;
  IF md5(pg_get_functiondef('public.set_payout_hold_days'::regproc)) <> 'db904f8ad2f0fe77379b8277baf1402c' THEN
    RAISE EXCEPTION 'set_payout_hold_days changed live since this migration was written';
  END IF;
  IF md5(pg_get_functiondef('public.enforce_provider_stripe_columns_server_only'::regproc)) <> 'ee880d28422144ba536c9bca07635fcc' THEN
    RAISE EXCEPTION 'enforce_provider_stripe_columns_server_only changed live since this migration was written; rebuild it from live';
  END IF;
  IF (SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgname = 'enforce_provider_stripe_columns_server_only' AND tgrelid = 'public.providers'::regclass)
     IS DISTINCT FROM 'CREATE TRIGGER enforce_provider_stripe_columns_server_only BEFORE UPDATE OF stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted ON public.providers FOR EACH ROW EXECUTE FUNCTION enforce_provider_stripe_columns_server_only()' THEN
    RAISE EXCEPTION 'trigger enforce_provider_stripe_columns_server_only changed live since this migration was written';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.create_held_payout_on_finalize()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_stripe_account_id text;
  v_gross integer;
  v_fee integer;
  v_payout integer;
  v_release_after timestamptz;
BEGIN
  -- Fire only on the exact finalise transition, and only for a real in-app
  -- payment (a payment_intent_id present). Anything else is not a capture.
  IF NOT (OLD.status = 'on_hold'
          AND NEW.status IN ('pending', 'confirmed')
          AND NEW.payment_intent_id IS NOT NULL) THEN
    RETURN NEW;
  END IF;

  -- Nothing was actually collected in-app -> no payout to track.
  IF COALESCE(NEW.amount_paid, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT p.stripe_account_id
    INTO v_stripe_account_id
  FROM public.providers p WHERE p.id = NEW.provider_id;

  -- No connected account yet: don't block the client's booking, log it for
  -- manual reconciliation (see 20260929050324 for the full reasoning).
  IF v_stripe_account_id IS NULL THEN
    RAISE WARNING '[create_held_payout] booking % finalised for provider % with no stripe_account_id — no payout row created (onboard the provider or reconcile manually)',
      NEW.id, NEW.provider_id;
    RETURN NEW;
  END IF;

  -- Pence, from the already-priced per-booking columns.
  v_gross := round(NEW.amount_paid * 100)::integer;
  v_fee := round(COALESCE(NEW.service_charge, 0) * 100)::integer;
  v_payout := v_gross - v_fee;

  IF v_payout < 0 THEN
    RAISE EXCEPTION '[create_held_payout] computed negative payout for booking % (gross=%, fee=%)', NEW.id, v_gross, v_fee;
  END IF;

  -- 24 hours after the appointment ends (an absolute instant, anchored to UK
  -- wall-clock). Fixed for every provider: when the money then reaches their
  -- bank is their Stripe payout schedule, chosen in Payment settings.
  v_release_after := ((NEW.booking_date + COALESCE(NEW.end_time, NEW.booking_time)) AT TIME ZONE 'Europe/London')
                     + interval '24 hours';

  -- Idempotent: unique (booking_id, provider_id) + DO NOTHING.
  INSERT INTO public.provider_payouts (
    booking_id, provider_id, stripe_account_id,
    gross_amount, platform_fee, payout_amount, currency,
    status, release_after
  ) VALUES (
    NEW.id, NEW.provider_id, v_stripe_account_id,
    v_gross, v_fee, v_payout, 'gbp',
    'held', v_release_after
  )
  ON CONFLICT (booking_id, provider_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

DROP FUNCTION public.set_payout_hold_days(integer);

ALTER TABLE public.providers DROP CONSTRAINT providers_payout_hold_days_check;
ALTER TABLE public.providers DROP COLUMN payout_hold_days;

ALTER TABLE public.providers ADD COLUMN stripe_payout_schedule_set_at timestamptz;
COMMENT ON COLUMN public.providers.stripe_payout_schedule_set_at IS
  'When the app last set this provider''s Stripe bank payout schedule. NULL = never, so create-connect-account applies the monthly default once. Server-written only.';

-- The new column joins the Stripe columns only the server may change.
CREATE OR REPLACE FUNCTION public.enforce_provider_stripe_columns_server_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF (NEW.stripe_account_id       IS DISTINCT FROM OLD.stripe_account_id
      OR NEW.stripe_charges_enabled   IS DISTINCT FROM OLD.stripe_charges_enabled
      OR NEW.stripe_payouts_enabled   IS DISTINCT FROM OLD.stripe_payouts_enabled
      OR NEW.stripe_details_submitted IS DISTINCT FROM OLD.stripe_details_submitted
      OR NEW.stripe_payout_schedule_set_at IS DISTINCT FROM OLD.stripe_payout_schedule_set_at)
     AND current_user IN ('authenticated', 'anon')
  THEN
    RAISE EXCEPTION 'Payout account status is managed by the payment system and cannot be changed directly.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

-- The trigger only fires for the columns it lists, so the new one is added.
DROP TRIGGER enforce_provider_stripe_columns_server_only ON public.providers;
CREATE TRIGGER enforce_provider_stripe_columns_server_only
  BEFORE UPDATE OF stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted, stripe_payout_schedule_set_at
  ON public.providers FOR EACH ROW EXECUTE FUNCTION public.enforce_provider_stripe_columns_server_only();

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261111100000', 'payout_bank_schedule')
ON CONFLICT (version) DO NOTHING;

COMMIT;
