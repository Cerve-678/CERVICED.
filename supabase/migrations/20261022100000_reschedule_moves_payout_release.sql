-- A moved booking moves its payout.
--
-- Frontier at authoring: 20261021112728 (verified live 2026-10-22). Two
-- unapplied files on other branches sit above it (20261021195500 tip
-- notification, which holds the migration lock, and 20261021200000 refund
-- hold notice), so this is numbered above both. Apply only once the lock in
-- MIGRATION_OWNER.md is free, and re-check max(version) first.
--
-- The gap (PAYMENTS_AND_LOGIC.md §9, spotted 3 Oct, confirmed live 22 Oct):
-- create_held_payout_on_finalize sets release_after once, from the date the
-- client paid for. Nothing re-timed it when the booking moved, so a booking
-- paid for 5 Nov and moved to 20 Nov paid the provider around 6 Nov, before
-- the work. A cancellation of the new date then had to claw that money back
-- (and became a shortfall if their Stripe balance couldn't cover it).
--
-- Decided with the user 2026-10-22: the payout follows the appointment both
-- ways. Moved later, it's held later; moved earlier, it's released earlier.
--
-- How: the payout shifts by exactly as much as the appointment did. That
-- keeps whatever hold the payout already had (the provider's choice when it
-- was created, or a longer one set_payout_hold_days gave it) rather than
-- re-reading providers.payout_hold_days, which only ever applies to new
-- bookings. One trigger on bookings covers every path that moves a date
-- (client and provider reschedules, group reschedules) without touching any
-- of those functions.
--
-- Left alone on purpose:
--   - a payout that isn't 'held' (already sent, cancelled or failed);
--   - a payout the release job has claimed (release_claimed_at set), which
--     is mid-transfer; release_provider_shortfalls clears the claim if that
--     transfer fails, and later moves apply as normal;
--   - fee and tip payouts (booking_fee_charges, booking tips): both are
--     charged after the appointment, when the booking can't be moved.
-- The open-refund-request hold is checked by release-payouts itself, not
-- through release_after, so moving the date can't release a payout early
-- while a request is open.

BEGIN;

CREATE OR REPLACE FUNCTION public.move_held_payout_with_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- Appointment end as an absolute instant, anchored to UK wall-clock, the
  -- same way create_held_payout_on_finalize computes it.
  v_old_end timestamptz := (OLD.booking_date + COALESCE(OLD.end_time, OLD.booking_time)) AT TIME ZONE 'Europe/London';
  v_new_end timestamptz := (NEW.booking_date + COALESCE(NEW.end_time, NEW.booking_time)) AT TIME ZONE 'Europe/London';
BEGIN
  IF v_new_end IS NULL OR v_old_end IS NULL OR v_new_end = v_old_end THEN
    RETURN NEW;
  END IF;

  UPDATE public.provider_payouts
     SET release_after = release_after + (v_new_end - v_old_end)
   WHERE booking_id = NEW.id
     AND status = 'held'
     AND release_claimed_at IS NULL;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.move_held_payout_with_booking() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS after_booking_move_held_payout ON public.bookings;
CREATE TRIGGER after_booking_move_held_payout
  AFTER UPDATE OF booking_date, booking_time, end_time ON public.bookings
  FOR EACH ROW
  WHEN ((OLD.booking_date, OLD.booking_time, OLD.end_time)
        IS DISTINCT FROM (NEW.booking_date, NEW.booking_time, NEW.end_time))
  EXECUTE FUNCTION public.move_held_payout_with_booking();

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261022100000', 'reschedule_moves_payout_release')
ON CONFLICT (version) DO NOTHING;

COMMIT;
