-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260810180302
-- Remote name: revoke_legacy_client_booking_writes
-- Do not edit this recovery archive; create a new tracked migration for changes.

-- Clients create booking intent through prepare_checkout only. Direct client
-- inserts let a modified app choose prices, deposits and add-ons, so remove
-- those legacy policies while retaining provider inserts for provider-run
-- waitlist/manual workflows.
DROP POLICY IF EXISTS "bookings_user_insert" ON public.bookings

DROP POLICY IF EXISTS "booking_add_ons_user_insert" ON public.booking_add_ons

DROP POLICY IF EXISTS "booking_add_ons_owner_all" ON public.booking_add_ons
