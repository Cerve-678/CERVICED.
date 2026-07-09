-- Cancellation policy — provider-level minimum notice required to cancel.
-- Run in Supabase SQL editor. Safe to re-run (IF NOT EXISTS).

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS cancellation_notice_hours INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN providers.cancellation_notice_hours IS
  'Minimum hours before appointment that a client can cancel (0 = anytime)';
