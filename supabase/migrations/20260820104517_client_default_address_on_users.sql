-- The cart's "Confirm Your Details" step asked a mobile-provider client for
-- their address on every checkout because there was nowhere to keep it:
-- bookings.client_address stores it per booking, but nothing carried it
-- forward, so "Set as default for future bookings" silently ignored the
-- address field entirely while saving name and phone.
--
-- Home address is PII. This column is safe on `users` only because that table
-- is owner-only: every SELECT policy on it is (auth.uid() = id), with no anon
-- or public read path (the old users_public_profile_read leak is gone). The
-- only select("*") against users is getUserProfileById, called in exactly one
-- place with the session user's own id; every other users query names its
-- columns explicitly. It is never joined into a provider-facing query —
-- providers read the client's address from bookings.client_address, which the
-- existing address-release policy governs.
--
-- Read/written app-side by updateUserContactDetails() and prefilled at
-- checkout in CartScreen; clients predating this column fall back to their
-- last mobile booking's address via getMyLastClientAddress().
--
-- APPLIED LIVE 2026-08-20.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS client_address text;

COMMENT ON COLUMN public.users.client_address IS
  'Client''s saved default address for mobile bookings. Owner-readable only; providers see the per-booking snapshot in bookings.client_address, not this column.';
