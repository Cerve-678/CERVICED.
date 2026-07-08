-- Migration: Add client_address to bookings for mobile providers
-- When a provider is mobile they travel to the client, so the client's address is stored on the booking.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS client_address TEXT;
