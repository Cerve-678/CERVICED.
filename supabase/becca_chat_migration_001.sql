-- Migration 001: Fix becca_chat_messages.id column type
-- The app uses string-based IDs (not UUID format).
-- Change the column from UUID to TEXT so any string ID is accepted.
-- Run this in Supabase SQL Editor → New query.

ALTER TABLE public.becca_chat_messages ALTER COLUMN id TYPE TEXT;
