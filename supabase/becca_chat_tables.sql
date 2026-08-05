-- ============================================================
-- Becca AI Chat Persistence
-- Run this in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.becca_chat_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT 'New Chat',
  preview     TEXT,
  -- Which Becca this belongs to. A user with both hats has two separate
  -- assistants answering from different data, so their histories are separate
  -- lists — without this a provider sees their client-side chats in their
  -- business history. Applied live 2026-08-04; existing rows backfilled to
  -- 'client' (provider Becca never persisted sessions before then).
  hat         TEXT NOT NULL DEFAULT 'client' CHECK (hat IN ('client', 'provider')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Safe to re-run against an environment created before `hat` existed.
ALTER TABLE public.becca_chat_sessions
  ADD COLUMN IF NOT EXISTS hat TEXT NOT NULL DEFAULT 'client'
  CHECK (hat IN ('client', 'provider'));

CREATE TABLE IF NOT EXISTS public.becca_chat_messages (
  id          UUID PRIMARY KEY,
  session_id  UUID NOT NULL REFERENCES public.becca_chat_sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  image_uri   TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast queries. Every session list query filters user_id + hat.
CREATE INDEX IF NOT EXISTS idx_becca_sessions_user_hat ON public.becca_chat_sessions(user_id, hat, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_becca_messages_session ON public.becca_chat_messages(session_id, created_at ASC);

-- RLS
ALTER TABLE public.becca_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.becca_chat_messages ENABLE ROW LEVEL SECURITY;

-- Sessions: users can only see/edit their own
DROP POLICY IF EXISTS "Users manage own sessions" ON public.becca_chat_sessions;
CREATE POLICY "Users manage own sessions" ON public.becca_chat_sessions
  FOR ALL USING (auth.uid() = user_id);

-- Messages: users can only see/edit messages in their own sessions
DROP POLICY IF EXISTS "Users manage own messages" ON public.becca_chat_messages;
CREATE POLICY "Users manage own messages" ON public.becca_chat_messages
  FOR ALL USING (
    session_id IN (
      SELECT id FROM public.becca_chat_sessions WHERE user_id = auth.uid()
    )
  );
