-- ⚠️ SUPERSEDED — DO NOT APPLY. Kept as a record of a closed decision.
--
-- Never applied live: public.bookings has only bookings_provider_insert,
-- bookings_provider_read and bookings_user_read. Clients have no INSERT
-- policy, so this file's rollback never took effect.
--
-- RESOLVED 2026-08-20 in the app instead of the database. The only thing that
-- still depended on a client INSERT was BookingContext's post-payment fallback
-- to a direct createBooking() insert when claim_cart_booking_slots returned no
-- row for an item. That call could no longer do anything but fail RLS and show
-- the client Postgres' policy text, so it was removed: an unclaimed item is now
-- reported as "that time slot is no longer available". createBooking() itself
-- had no callers left and was deleted from databaseService.ts in the same pass.
--
-- Do NOT apply this to "restore the fallback". A blanket authenticated INSERT
-- on bookings lets a client forge rows with arbitrary price, status and
-- snapshot fields, bypassing every validation the claim RPC performs. Client
-- bookings go exclusively through hold_cart_booking_slots +
-- claim_cart_booking_slots; provider-side manual bookings go through
-- provider_create_manual_booking / insertDirectBooking.

-- Compatibility rollback while Stripe checkout is deliberately disabled.
-- Revoke these again when EXPO_PUBLIC_STRIPE_PAYMENTS_ENABLED is enabled in a
-- released native build.
CREATE POLICY "bookings_user_insert" ON public.bookings
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "booking_add_ons_user_insert" ON public.booking_add_ons
  FOR INSERT TO authenticated
  WITH CHECK (
    booking_id IN (SELECT b.id FROM public.bookings b WHERE b.user_id = (select auth.uid()))
  );

CREATE POLICY "booking_add_ons_owner_all" ON public.booking_add_ons
  FOR ALL TO authenticated
  USING (
    (select auth.uid()) = (SELECT b.user_id FROM public.bookings b WHERE b.id = booking_add_ons.booking_id)
  )
  WITH CHECK (
    (select auth.uid()) = (SELECT b.user_id FROM public.bookings b WHERE b.id = booking_add_ons.booking_id)
  );
