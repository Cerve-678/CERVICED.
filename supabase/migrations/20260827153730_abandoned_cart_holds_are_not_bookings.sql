-- An abandoned checkout is not a cancelled booking, and for 16 rows it is.
--
-- hold_cart_booking_slots() reserves each cart slot as a real `bookings` row
-- with status 'on_hold', deliberately: reusing the table means the hold is
-- respected by bookings_no_overlap and every existing conflict check for
-- free. Because the row exists before the client has told us anything, the
-- snapshot columns get a placeholder literal.
--
-- Both paths that end a hold then did this:
--
--   UPDATE bookings
--      SET status = 'cancelled', hold_expires_at = NULL, hold_batch_id = NULL
--
-- which is wrong twice over. It promotes the hold to an ordinary cancelled
-- booking, and in the same statement erases the only two columns that
-- identified it as a hold. getProviderBookings() filters status <> 'on_hold'
-- and never catches these, because by then they are not on_hold.
--
-- Live count before this migration: 25 cancelled bookings, of which 16 are
-- abandoned checkouts carrying the placeholder, three created the same day
-- this was found. Client and provider both see them as real cancellations.
--
-- A hold that is never claimed has no history worth keeping: nobody agreed to
-- anything, no money moved, and the slot should read as though it was never
-- touched. So the row is removed rather than cancelled. That also means no
-- read path in the app needs a new filter, and no future surface can forget
-- to apply one.
--
-- Two guards, because this is not reversible:
--
--   * transactions has NO foreign key to bookings at all, and its booking_id
--     is nullable (verified against live 2026-08-27 -- an earlier draft of
--     this header claimed a NOT NULL FK, which is wrong). The database will
--     therefore NOT stop a delete from orphaning a payment row: the
--     NOT EXISTS guard below is the only thing that does. Do not remove it
--     on the assumption that referential integrity is a backstop here.
--     If money is attached the row is NOT a phantom -- payment succeeded and
--     the claim failed -- and it must survive for someone to look at.
--   * reviews.booking_id IS a real FK with NO ACTION, so a review would
--     block the delete outright; that guard turns an error into a skip. A
--     hold cannot have a review, but it costs nothing and means this cannot
--     be the statement that loses one.
--
-- booking_add_ons, booking_intake_forms and booking_info_packs are all
-- ON DELETE CASCADE, so they go with the row. That intake-form residue is
-- what the other active session is stopping at the source in
-- 20260827120122_hold_rows_skip_booking_side_effects.sql -- the two changes
-- are complementary: theirs stops holds creating the children, this one
-- stops holds surviving as bookings. Neither redefines the other's
-- functions.
--
-- notifications.booking_id is ON DELETE SET NULL. A notification orphaned to
-- a NULL booking_id is exactly the "A client cancelled their <placeholder>"
-- bug already on record (fix_handle_booking_status_change_on_hold_
-- notification.sql), so hold-linked notifications are cleared explicitly
-- rather than left dangling.
--
-- Each notification delete carries the SAME transactions/reviews guards as
-- the booking delete it accompanies. Without them the two would disagree: a
-- hold preserved because money is attached would still have its
-- notifications deleted, stripping context from the one row deliberately
-- kept for a human to investigate.

-- --------------------------------------------------------------------------
-- 1. The 5-minute TTL sweep
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.expire_cart_holds()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.notifications n
   USING public.bookings b
   WHERE n.booking_id = b.id
     AND b.status = 'on_hold'
     AND b.hold_batch_id IS NOT NULL
     AND b.hold_expires_at < NOW()
     AND NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.booking_id = b.id)
     AND NOT EXISTS (SELECT 1 FROM public.reviews r WHERE r.booking_id = b.id);

  DELETE FROM public.bookings b
   WHERE b.status = 'on_hold'
     AND b.hold_batch_id IS NOT NULL
     AND b.hold_expires_at < NOW()
     AND NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.booking_id = b.id)
     AND NOT EXISTS (SELECT 1 FROM public.reviews r WHERE r.booking_id = b.id);
END;
$function$;

-- --------------------------------------------------------------------------
-- 2. The client backing out of the payment sheet
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.release_cart_booking_slots(p_hold_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- auth.uid() is still the authority on whose hold this is: the caller may
  -- only release their own batch, exactly as before.
  DELETE FROM public.notifications n
   USING public.bookings b
   WHERE n.booking_id = b.id
     AND b.hold_batch_id = p_hold_batch_id
     AND b.status = 'on_hold'
     AND b.user_id = auth.uid()
     AND NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.booking_id = b.id)
     AND NOT EXISTS (SELECT 1 FROM public.reviews r WHERE r.booking_id = b.id);

  DELETE FROM public.bookings b
   WHERE b.hold_batch_id = p_hold_batch_id
     AND b.status = 'on_hold'
     AND b.user_id = auth.uid()
     AND NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.booking_id = b.id)
     AND NOT EXISTS (SELECT 1 FROM public.reviews r WHERE r.booking_id = b.id);
END;
$function$;

-- --------------------------------------------------------------------------
-- 3. The rows already sitting in people's booking lists
-- --------------------------------------------------------------------------
-- Matched on the placeholder literal AND on being cancelled AND on having no
-- money attached. The literal alone is not enough of a key: a real service
-- could in principle be named this, so every condition has to hold at once.
-- hold_batch_id/hold_expires_at are useless here -- the buggy UPDATE nulled
-- them. chr(8230) is the ellipsis character the placeholder actually uses.

DELETE FROM public.notifications n
 USING public.bookings b
 WHERE n.booking_id = b.id
   AND b.status = 'cancelled'
   AND b.service_name_snapshot = 'Reserving' || chr(8230)
   AND b.provider_name_snapshot = 'Reserving' || chr(8230)
   AND NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.booking_id = b.id)
   AND NOT EXISTS (SELECT 1 FROM public.reviews r WHERE r.booking_id = b.id);

DELETE FROM public.bookings b
 WHERE b.status = 'cancelled'
   AND b.service_name_snapshot = 'Reserving' || chr(8230)
   AND b.provider_name_snapshot = 'Reserving' || chr(8230)
   AND NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.booking_id = b.id)
   AND NOT EXISTS (SELECT 1 FROM public.reviews r WHERE r.booking_id = b.id);

-- --------------------------------------------------------------------------
-- 4. Grants unchanged from the definitions being replaced
-- --------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.expire_cart_holds() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_cart_booking_slots(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_cart_booking_slots(uuid) TO authenticated;
