-- Scheduling settings — provider-level rules that control when clients can book.
-- Run in Supabase SQL editor. All IF NOT EXISTS — safe to re-run.

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS booking_window_days    INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS slot_interval_mins     INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS buffer_mins            INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_booking_notice_hrs INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN providers.booking_window_days    IS 'How many days ahead clients can book (0 = unlimited)';
COMMENT ON COLUMN providers.slot_interval_mins     IS 'Slot start-time step: 15, 30, or 60 minutes';
COMMENT ON COLUMN providers.buffer_mins            IS 'Gap blocked after each appointment ends';
COMMENT ON COLUMN providers.min_booking_notice_hrs IS 'Minimum hours of notice required to make a booking';
