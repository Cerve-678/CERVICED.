-- ════════════════════════════════════════════════════════════════════════════
-- fix_client_policy_acceptance.sql
--
-- Extends the persisted-acceptance work started in
-- fix_provider_terms_acceptance.sql to the client side, scoped specifically
-- to a PROVIDER's own cancellation/booking policy (providers.booking_policies)
-- — NOT the general Cerviced Terms & Conditions, which stays a separate,
-- deferred item tied to CartScreen.tsx's own checkbox.
--
-- BookingSheet.tsx / MultiBookingSheet.tsx already show a required "I agree
-- to ... this provider's cancellation policy" checkbox before a client can
-- book, but it was local component state only — never persisted, and never
-- surfaced back to the client afterwards. This adds:
--   - policy_accepted_at: when the client ticked the checkbox for this booking
--   - policy_snapshot: a copy of providers.booking_policies AS IT WAS at that
--     moment — same rationale as provider_name_snapshot/service_name_snapshot
--     (bookings.*_snapshot columns): the provider can edit their policy later,
--     but this booking should keep showing what the client actually agreed to.
--
-- Idempotent / safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS policy_accepted_at TIMESTAMPTZ;
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS policy_snapshot JSONB;

COMMENT ON COLUMN public.bookings.policy_accepted_at IS
  'When the client agreed to the provider''s cancellation/booking policy at checkout (BookingSheet/MultiBookingSheet). Null for bookings made before this column existed, or via CartScreen (separate, deferred Cerviced-terms checkbox).';
COMMENT ON COLUMN public.bookings.policy_snapshot IS
  'Copy of providers.booking_policies at the moment the client accepted it — frozen so later provider edits do not silently rewrite what this client agreed to. Null for bookings made before this column existed.';
