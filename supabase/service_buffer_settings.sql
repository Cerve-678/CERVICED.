-- ============================================================
-- CERVICED — Per-service buffer time
-- Run this in the Supabase SQL editor. Safe to re-run.
--
-- Problem: providers.buffer_mins is a single gap-after value applied to
-- EVERY service equally. A 15-minute brow tint and a 3-hour balayage
-- often need different prep/cleanup gaps, and some services (e.g. a
-- patch test) may need a gap BEFORE the appointment too, which the old
-- global setting had no concept of at all.
--
-- Fix: services.buffer_before_mins / buffer_after_mins let a provider
-- override the gap per service. NULL means "no override":
--   - buffer_before_mins NULL -> 0 (there was never a global "before" setting)
--   - buffer_after_mins  NULL -> inherits providers.buffer_mins (preserves
--     existing behaviour for every service that doesn't set its own value)
-- ============================================================

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS buffer_before_mins INTEGER,
  ADD COLUMN IF NOT EXISTS buffer_after_mins INTEGER;

COMMENT ON COLUMN public.services.buffer_before_mins IS
  'Minutes blocked immediately before this service''s appointments. NULL = 0.';
COMMENT ON COLUMN public.services.buffer_after_mins IS
  'Minutes blocked immediately after this service''s appointments. NULL = inherit providers.buffer_mins.';
