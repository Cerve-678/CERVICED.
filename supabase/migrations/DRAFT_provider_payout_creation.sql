-- DRAFT — NOT YET APPLIED. Rename above the live max(version) at apply time;
-- claim the migration lock first (CLAUDE.md migration-ownership rule). Apply
-- AFTER both DRAFT_stripe_connect_account_columns.sql (adds
-- providers.stripe_account_id) and DRAFT_provider_payouts.sql (the ledger
-- table) — this migration depends on both existing.
--
-- Step 2 of the Connect build (handoff: stripe-connect-payouts-build-handoff):
-- write a 'held' payout row the moment a booking is finalised with a real
-- payment. One row per (booking, provider); the release job later turns it
-- into a Stripe Transfer once release_after passes.
--
-- WHY A TRIGGER, NOT AN EDIT TO finalize_checkout: finalize_checkout is a
-- large, live, load-bearing RPC. Adding the payout INSERT inside it would mean
-- restating its entire body under CREATE OR REPLACE — the exact footgun
-- CLAUDE.md calls out (any condition silently dropped in the restatement
-- un-gates it). A trigger on the precise on_hold -> pending/confirmed
-- transition is isolated, testable on its own, and idempotent, and
-- finalize_checkout is the ONLY path that makes that transition with a
-- payment_intent_id (reschedules act on already-finalised bookings, never on
-- on_hold rows), so the trigger fires exactly where the money is captured.
--
-- THE SPLIT (all already computed and stored per-booking by the existing
-- apply_checkout_platform_fee trigger — this migration only reads it, never
-- recomputes it, so the ledger can never disagree with what the client paid):
--   gross_amount  = bookings.amount_paid        (total the client paid for this
--                                                 booking, platform fee included)
--   platform_fee  = bookings.service_charge      (that booking's apportioned cut)
--   payout_amount = amount_paid - service_charge  (full: the provider's whole
--                                                  subtotal; deposit-only: their
--                                                  deposit) — the fee is NEVER
--                                                  taken out of the provider's
--                                                  money, matching the
--                                                  "fee added on top" rule.

CREATE OR REPLACE FUNCTION public.create_held_payout_on_finalize()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- ⚠️ PRODUCT DECISION (flag for the user): how long AFTER the appointment
  -- ends the payout stays held before the release job may transfer it. The
  -- cancellation window closes BEFORE the appointment, so the appointment end
  -- is already the binding "window closed" moment; this buffer is the extra
  -- safety margin that lets a no-show / quality dispute be raised before the
  -- provider is paid (CERVICED already has a no-show dispute flow). 24h is a
  -- sensible default, not a locked decision — change this one literal to
  -- retune it. 0 would release as soon as the appointment passes.
  v_dispute_hold interval := interval '24 hours';

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

  SELECT p.stripe_account_id INTO v_stripe_account_id
  FROM public.providers p WHERE p.id = NEW.provider_id;

  -- TRANSITION WINDOW: before the hard go-live gate
  -- (DRAFT_stripe_connect_gate_go_live.sql) is applied, a not-yet-onboarded
  -- provider can still be booked, so there may be no connected account to pay
  -- into yet. We do NOT block the client's booking over that — we skip the
  -- ledger row and log it. Once the hard gate is live, every bookable provider
  -- has charges_enabled = true and therefore an account, so this branch stops
  -- being reachable. Until then, these are the bookings whose payout must be
  -- reconciled by hand if the provider onboards later.
  IF v_stripe_account_id IS NULL THEN
    RAISE WARNING '[create_held_payout] booking % finalised for provider % with no stripe_account_id — no payout row created (onboard the provider or reconcile manually)',
      NEW.id, NEW.provider_id;
    RETURN NEW;
  END IF;

  -- Pence, from the already-priced per-booking columns. round() guards against
  -- float noise on the numeric->integer step.
  v_gross := round(NEW.amount_paid * 100)::integer;
  v_fee := round(COALESCE(NEW.service_charge, 0) * 100)::integer;
  v_payout := v_gross - v_fee;

  -- Defensive: a negative payout would mean the fee exceeded what was paid,
  -- which can't happen with the current pricing but would corrupt the ledger
  -- if it ever did. Refuse rather than write a nonsense money row.
  IF v_payout < 0 THEN
    RAISE EXCEPTION '[create_held_payout] computed negative payout for booking % (gross=%, fee=%)', NEW.id, v_gross, v_fee;
  END IF;

  -- Appointment end as an absolute instant. Booking date/time are stored as
  -- UK wall-clock; anchor them to Europe/London so the hold is measured from
  -- the real appointment, not a UTC-shifted one. Fall back to booking_time if
  -- end_time is somehow null (see memory: null end_time has bitten this app).
  v_release_after := ((NEW.booking_date + COALESCE(NEW.end_time, NEW.booking_time)) AT TIME ZONE 'Europe/London')
                     + v_dispute_hold;

  -- Idempotent: the unique (booking_id, provider_id) constraint plus DO
  -- NOTHING means a redelivered/duplicated finalise can never double-create a
  -- payout row.
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

DROP TRIGGER IF EXISTS on_booking_finalized_create_payout ON public.bookings;
CREATE TRIGGER on_booking_finalized_create_payout
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW
  WHEN (OLD.status = 'on_hold' AND NEW.status IN ('pending', 'confirmed'))
  EXECUTE FUNCTION public.create_held_payout_on_finalize();
