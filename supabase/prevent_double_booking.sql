-- Prevent double-bookings at the database level.
-- A partial unique index ensures no two active bookings can occupy the same
-- (provider, date, time) slot. Cancelled and no-show rows are excluded so
-- the slot can be rebooked after a cancellation.
CREATE UNIQUE INDEX IF NOT EXISTS bookings_no_double_book_idx
  ON bookings (provider_id, booking_date, booking_time)
  WHERE status NOT IN ('cancelled', 'no_show');
