-- ============================================================
-- CERVICED: Missing client profile columns on users table
-- Run in Supabase SQL Editor
-- ============================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS service_locations    TEXT[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS maintenance_frequency TEXT,
  ADD COLUMN IF NOT EXISTS referral_source       TEXT;
