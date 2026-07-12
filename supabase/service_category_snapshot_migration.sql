-- Snapshot the provider's service category (HAIR, NAILS, AESTHETICS, etc.) on each
-- booking, so booking lists can display the real category instead of guessing it
-- from the service name.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS service_category_snapshot TEXT;
