-- Add max_bookings_per_day column to providers table.
-- 0 means unlimited. Run in Supabase SQL editor. Safe to re-run.

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS max_bookings_per_day INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN providers.max_bookings_per_day IS 'Maximum confirmed bookings allowed per calendar day (0 = unlimited)';
