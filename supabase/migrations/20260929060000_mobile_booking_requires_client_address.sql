-- 20260929060000_mobile_booking_requires_client_address.sql
--
-- WRITTEN, NOT YET APPLIED. See supabase/MIGRATION_OWNER.md. Do NOT apply until
-- the Stripe checkout path captures the client address (see "BEFORE APPLYING"
-- below) -- applied as-is it would convert the Stripe path's silent data loss
-- into a paid-but-rolled-back booking.
--
-- WHAT THIS ENFORCES
-- A mobile provider travels TO the client, so a *committed* mobile booking with
-- no client address is a provider committed to turning up nowhere. This makes
-- the database refuse that, so no code path -- present or future -- can confirm
-- a mobile booking with no destination.
--
-- WHY THE DATABASE, WHEN THE APP ALREADY GUARDS IT
-- CartScreen.handleCheckout() already fails closed: checkout is blocked unless
-- every cart provider resolved in getProviderCheckoutMetadata(), and the
-- mobile/address requirement is read from that same resolved metadata, frozen
-- into checkoutSnapshot.mobileProviderNames. That guarantee is real but lives
-- entirely in one screen on the live (claim) route. It does not cover:
--   * the Stripe checkout path -- see below;
--   * any future second client, seed script, or admin tool that writes bookings.
--
-- THE STRIPE PATH, SPECIFICALLY (the reason this exists)
-- The address is written to the bookings.client_address funnel column by
-- claim_cart_booking_slots() and relocated into booking_client_addresses by the
-- on_booking_client_address_written trigger (AFTER INSERT OR UPDATE OF
-- client_address). Verified live on 2026-10-01 against pg_get_functiondef():
-- prepare_checkout(), hold_cart_booking_slots() and finalize_checkout() -- the
-- Stripe prepare/hold/finalize route -- never write client_address at all.
-- USE_STRIPE_PAYMENTS is off today so that route is not live, but the day the
-- flag flips, every mobile booking it confirms would ship with no address and
-- no error. This guard turns that silent loss into a loud, fail-closed refusal.
--
-- DESIGN: a DEFERRABLE INITIALLY DEFERRED constraint trigger, so the check runs
-- at COMMIT -- after on_booking_client_address_written has already relocated the
-- address into booking_client_addresses within the same transaction. Checked any
-- sooner it would race that relocation and reject the legitimate claim path.
--
-- SCOPE: fires only when a row ENTERS a committed appointment status
-- (confirmed / in_progress / completed) from outside that set. That single
-- moment is when the invariant must hold, and scoping to the transition keeps
-- the guard off:
--   * every non-mobile provider (business_type <> 'mobile'),
--   * holds and pending / cancelled rows,
--   * legacy pre-migration rows updated for unrelated reasons (notes, no-show,
--     reschedule): their status does not re-enter the set, so they are never
--     re-checked and can never become unmodifiable.
-- business_type is read live from providers (bookings carry no venue-type
-- snapshot), so a provider who flips to mobile does NOT retroactively invalidate
-- their already-committed bookings -- those rows are not transitioning.
--
-- BEFORE APPLYING (whoever takes the migration lock):
--   1. Teach the Stripe path to capture the client address for mobile bookings
--      -- write bookings.client_address in hold_cart_booking_slots() /
--      finalize_checkout() the same way claim_cart_booking_slots() does, so the
--      relocate trigger fires -- OR confirm USE_STRIPE_PAYMENTS stays off.
--   2. Check for legacy committed mobile bookings with no address row that a
--      future status change could trip:
--        SELECT b.id, b.status FROM bookings b JOIN providers p
--          ON p.id = b.provider_id AND p.business_type = 'mobile'
--         WHERE b.status IN ('confirmed','in_progress','completed')
--           AND NOT EXISTS (SELECT 1 FROM booking_client_addresses bca
--                           WHERE bca.booking_id = b.id);
--      (On 2026-10-01 there were 4 such rows, all one test provider -- see the
--      session that wrote this. They are untouched until their status changes.)
--   3. apply_migration stamps its own clock version -- rename this file to match
--      and record the live version in MIGRATION_OWNER.md. Verify afterwards with
--      pg_get_functiondef / pg_get_triggerdef, not by trusting the file ran.

CREATE OR REPLACE FUNCTION public.enforce_mobile_booking_has_client_address()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_is_mobile boolean;
BEGIN
  -- Only a fresh ENTRY into a committed appointment status is checked.
  IF NEW.status NOT IN ('confirmed', 'in_progress', 'completed') THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.status IN ('confirmed', 'in_progress', 'completed') THEN
    -- Already committed before this update; not a transition. Leaves legacy
    -- rows and ordinary edits (notes, no-show, reschedule) alone.
    RETURN NULL;
  END IF;

  -- Venue type is read live from the provider; bookings carry no snapshot of it.
  SELECT (p.business_type = 'mobile')
    INTO v_is_mobile
    FROM public.providers p
   WHERE p.id = NEW.provider_id;

  IF NOT COALESCE(v_is_mobile, false) THEN
    RETURN NULL;
  END IF;

  -- The address lives in booking_client_addresses (the funnel column is NULL at
  -- rest). An empty-string row counts as no address.
  IF NOT EXISTS (
    SELECT 1
      FROM public.booking_client_addresses bca
     WHERE bca.booking_id = NEW.id
       AND btrim(COALESCE(bca.address, '')) <> ''
  ) THEN
    RAISE EXCEPTION
      'Mobile booking % cannot be confirmed without a client address: a mobile provider has no destination to travel to.',
      NEW.id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NULL;
END;
$function$;

-- Not granted to anon (2026-08-20 hardening): a trigger function is invoked by
-- the trigger mechanism, not called directly, and this one is SECURITY DEFINER.
DROP TRIGGER IF EXISTS enforce_mobile_booking_has_client_address ON public.bookings;
CREATE CONSTRAINT TRIGGER enforce_mobile_booking_has_client_address
  AFTER INSERT OR UPDATE ON public.bookings
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_mobile_booking_has_client_address();
