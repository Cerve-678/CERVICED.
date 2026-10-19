-- Clear a provider's expired cart holds before any booking for them is saved.
--
-- The bug: a cart hold lasts 10 minutes (hold_expires_at), but the row stays
-- 'on_hold' until the expire-cart-holds cron deletes it, which runs every 5
-- minutes. In that gap the slot picker (get_provider_busy_spans) already
-- shows the time as free, because it ignores lapsed holds, while
-- enforce_booking_bookability()'s overlap check and the bookings_no_overlap
-- exclusion constraint still count the row. So a client could pick a time the
-- picker offered and be told "That time is no longer available" for up to
-- 5 minutes after someone else's hold ran out.
--
-- The fix: a BEFORE trigger that fires ahead of before_booking_enforce_bookability
-- (same events; triggers fire in name order, and "clear" sorts before
-- "enforce") and deletes this provider's EXPIRED cart holds first. The
-- exclusion constraint can't be taught about expiry (it can't reference
-- now()), so the rows have to actually go.
--
-- Deleted rows use the same guards as expire_cart_holds() and
-- cancel_checkout(): on_hold cart holds only (hold_batch_id set, so
-- reschedule holds with no clock are never touched), already past
-- hold_expires_at, no transaction or review. Two stricter guards on top:
-- never the row being written or its own batch's siblings, and never a hold
-- whose checkout already has a payment intent, since money may be in flight
-- and finalize/webhook own that path. Everything deleted here is something
-- the cron would delete within 5 minutes anyway.
--
-- Frontier at authoring: 20261019230000. Adds a function and a trigger;
-- redefines nothing (enforce_booking_bookability md5 before:
-- d38065c2c030dbf211263cee389259e6, unchanged by this file).

CREATE OR REPLACE FUNCTION public.clear_expired_holds_before_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Only a row that will occupy time can collide with a lapsed hold.
  IF NEW.status NOT IN ('pending', 'confirmed', 'in_progress', 'on_hold') THEN
    RETURN NEW;
  END IF;

  DELETE FROM public.notifications n
   USING public.bookings b
   WHERE n.booking_id = b.id
     AND b.provider_id = NEW.provider_id
     AND b.id IS DISTINCT FROM NEW.id
     AND b.status = 'on_hold'
     AND b.hold_batch_id IS NOT NULL
     AND b.hold_batch_id IS DISTINCT FROM NEW.hold_batch_id
     AND b.hold_expires_at IS NOT NULL
     AND b.hold_expires_at < now()
     AND NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.booking_id = b.id)
     AND NOT EXISTS (SELECT 1 FROM public.reviews r WHERE r.booking_id = b.id)
     AND NOT EXISTS (SELECT 1 FROM public.checkout_batches cb
                      WHERE cb.id = b.hold_batch_id AND cb.payment_intent_id IS NOT NULL);

  DELETE FROM public.bookings b
   WHERE b.provider_id = NEW.provider_id
     AND b.id IS DISTINCT FROM NEW.id
     AND b.status = 'on_hold'
     AND b.hold_batch_id IS NOT NULL
     AND b.hold_batch_id IS DISTINCT FROM NEW.hold_batch_id
     AND b.hold_expires_at IS NOT NULL
     AND b.hold_expires_at < now()
     AND NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.booking_id = b.id)
     AND NOT EXISTS (SELECT 1 FROM public.reviews r WHERE r.booking_id = b.id)
     AND NOT EXISTS (SELECT 1 FROM public.checkout_batches cb
                      WHERE cb.id = b.hold_batch_id AND cb.payment_intent_id IS NOT NULL);

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.clear_expired_holds_before_booking() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS before_booking_clear_expired_holds ON public.bookings;
CREATE TRIGGER before_booking_clear_expired_holds
  BEFORE INSERT OR UPDATE OF booking_date, booking_time, end_time, provider_id
  ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.clear_expired_holds_before_booking();

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261019233000', 'clear_expired_holds_before_booking')
ON CONFLICT (version) DO NOTHING;
