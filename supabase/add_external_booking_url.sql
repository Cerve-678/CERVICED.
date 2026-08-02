-- External booking link — lets a provider send clients to their existing
-- booking system (Fresha, Treatwell, Acuity, Booksy, etc.) instead of
-- booking through Cerviced's own cart/checkout flow.
--
-- When set, the app treats this provider as fully external-booking: the
-- client-facing "Book" CTA opens this URL instead of Cerviced's in-app
-- BookingSheet/cart. This is a per-provider choice, not a platform-wide
-- switch — providers with no URL set keep booking entirely in-app, exactly
-- as before.
--
-- Run in the Supabase SQL editor. Safe to re-run.

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS external_booking_url TEXT;
