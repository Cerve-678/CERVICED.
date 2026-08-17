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
