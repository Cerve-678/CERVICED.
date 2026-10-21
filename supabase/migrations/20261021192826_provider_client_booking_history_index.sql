-- Provider Booking Detail's History button filters this exact pair and sorts
-- by date. The existing provider/date index still makes Postgres scan every
-- client booking for a busy provider before it can apply user_id.
CREATE INDEX IF NOT EXISTS bookings_provider_client_history_idx
  ON public.bookings (provider_id, user_id, booking_date DESC)
  WHERE status <> 'on_hold';
