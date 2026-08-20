-- ⚠️ NOT APPLIED LIVE — and deliberately left that way pending a decision.
--
-- Confirmed 2026-08-20: public.bookings has no bookings_user_insert policy;
-- its only INSERT policy is bookings_provider_insert. So clients cannot insert
-- booking rows directly, and this file has never taken effect.
--
-- What that means today: EXPO_PUBLIC_STRIPE_PAYMENTS_ENABLED is unset, so the
-- mock checkout path is live. It books through the SECURITY DEFINER RPCs
-- (hold_cart_booking_slots / claim_cart_booking_slots), which is fine — but
-- BookingContext falls back to a direct createBooking() insert when the claim
-- fails, and that fallback can now only produce an RLS error. The comment
-- there ("never surface as a checkout failure") no longer describes reality.
--
-- Do NOT apply this just to make the fallback work again: a blanket
-- authenticated INSERT policy on bookings lets a client forge rows with
-- arbitrary price, status and snapshot fields, bypassing every validation the
-- RPC performs. The safer fix is to make the fallback fail loudly or remove
-- it. Owner decision — see the 2026-08-20 reconciliation notes.

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
