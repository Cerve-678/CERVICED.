-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260810093439
-- Remote name: fix_client_policy_acceptance
-- Do not edit this recovery archive; create a new tracked migration for changes.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS policy_accepted_at TIMESTAMPTZ;
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS policy_snapshot JSONB;

COMMENT ON COLUMN public.bookings.policy_accepted_at IS
  'When the client agreed to the provider''s cancellation/booking policy at checkout (BookingSheet/MultiBookingSheet). Null for bookings made before this column existed, or via CartScreen (separate, deferred Cerviced-terms checkbox).';
COMMENT ON COLUMN public.bookings.policy_snapshot IS
  'Copy of providers.booking_policies at the moment the client accepted it — frozen so later provider edits do not silently rewrite what this client agreed to. Null for bookings made before this column existed.';
