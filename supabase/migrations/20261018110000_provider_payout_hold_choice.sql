-- NOT APPLIED. Written 2026-10-18 on feat/provider-payout-timing while the
-- migration lock (MIGRATION_OWNER.md) was held by feat/late-no-show-fees for
-- 20261018100000. Numbered above that one on purpose; re-check
-- max(version) in supabase_migrations.schema_migrations before applying.
--
-- Lets a provider choose how long after an appointment CERVICED holds their
-- share before releasing it to their Stripe account: 24 hours, 3, 7, 14 or 30
-- days. Every option is at least the 24-hour safety window
-- create_held_payout_on_finalize used to hard-code. A shorter choice applies
-- to new bookings only; it never brings forward a payout already waiting, so
-- a held payout can't be moved earlier than the window it was created with. Stripe's own payout from
-- their Stripe balance to their bank is untouched and still on Stripe's
-- default schedule.
--
-- Verified against live before writing: the live body of
-- create_held_payout_on_finalize matched
-- 20260929050324_provider_payout_creation_trigger.sql exactly, apart from
-- comments, so restating it here drops nothing.

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS payout_hold_days smallint NOT NULL DEFAULT 1
  CONSTRAINT providers_payout_hold_days_check CHECK (payout_hold_days IN (1, 3, 7, 14, 30));

COMMENT ON COLUMN public.providers.payout_hold_days IS
  'Days after the appointment ends before the provider''s share is released to their Stripe account. The app writes it through set_payout_hold_days(); a direct owner UPDATE is possible (providers_owner_all) but the CHECK keeps it >= 1 day and it never re-times held payouts.';

CREATE OR REPLACE FUNCTION public.create_held_payout_on_finalize()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- How long after the appointment ends the payout stays held before the
  -- release job may transfer it. The provider's own choice
  -- (providers.payout_hold_days), never less than 24 hours.
  v_hold_days smallint;
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

  SELECT p.stripe_account_id, p.payout_hold_days
    INTO v_stripe_account_id, v_hold_days
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

  -- Appointment end as an absolute instant, anchored to UK wall-clock.
  v_release_after := ((NEW.booking_date + COALESCE(NEW.end_time, NEW.booking_time)) AT TIME ZONE 'Europe/London')
                     + make_interval(days => GREATEST(COALESCE(v_hold_days, 1), 1));

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

-- The provider's own write path. A LONGER choice also pushes back payouts that
-- are still held; a shorter one only affects new bookings, so nobody can pull
-- a held payout forward past a refund or no-show window that's still open.
CREATE OR REPLACE FUNCTION public.set_payout_hold_days(p_days integer)
 RETURNS smallint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_provider_id uuid;
BEGIN
  IF p_days IS NULL OR p_days NOT IN (1, 3, 7, 14, 30) THEN
    RAISE EXCEPTION 'Choose 24 hours, 3, 7, 14 or 30 days.' USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_provider_id FROM public.providers WHERE user_id = auth.uid();
  IF v_provider_id IS NULL THEN
    RAISE EXCEPTION 'Only a professional account can change payout timing.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.providers SET payout_hold_days = p_days WHERE id = v_provider_id;

  UPDATE public.provider_payouts pp
     SET release_after = ((b.booking_date + COALESCE(b.end_time, b.booking_time)) AT TIME ZONE 'Europe/London')
                         + make_interval(days => p_days)
    FROM public.bookings b
   WHERE pp.booking_id = b.id
     AND pp.provider_id = v_provider_id
     AND pp.status = 'held'
     AND pp.release_after < ((b.booking_date + COALESCE(b.end_time, b.booking_time)) AT TIME ZONE 'Europe/London')
                            + make_interval(days => p_days);

  RETURN p_days::smallint;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_payout_hold_days(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_payout_hold_days(integer) TO authenticated;
