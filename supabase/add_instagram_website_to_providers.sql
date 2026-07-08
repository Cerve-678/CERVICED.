-- Migration: add instagram and website columns to providers table
ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS instagram TEXT,
  ADD COLUMN IF NOT EXISTS website  TEXT;
