-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260820104517
-- Remote name: client_default_address_on_users
-- Do not edit this recovery archive; create a new tracked migration for changes.

-- The cart's "Confirm Your Details" step asked a mobile-provider client for
-- their address on every checkout because there was nowhere to keep it:
-- bookings.client_address stores it per booking, but nothing carried it
-- forward, so "Set as default for future bookings" silently ignored it.
--
-- Home address is PII. This column is safe on `users` only because that table
-- is owner-only: every SELECT policy on it is (auth.uid() = id), with no anon
-- or public read path (the old users_public_profile_read leak is gone). It is
-- never joined into a provider-facing query — providers read the client's
-- address from bookings.client_address, which the existing address-release
-- policy already governs.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS client_address text;

COMMENT ON COLUMN public.users.client_address IS
  'Client''s saved default address for mobile bookings. Owner-readable only; providers see the per-booking snapshot in bookings.client_address, not this column.';
