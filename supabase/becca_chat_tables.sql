-- ============================================================
-- Becca AI Chat Persistence
-- Run this in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.becca_chat_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT 'New Chat',
  preview     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.becca_chat_messages (
  id          UUID PRIMARY KEY,
  session_id  UUID NOT NULL REFERENCES public.becca_chat_sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  image_uri   TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_becca_sessions_user ON public.becca_chat_sessions(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_becca_messages_session ON public.becca_chat_messages(session_id, created_at ASC);

-- RLS
ALTER TABLE public.becca_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.becca_chat_messages ENABLE ROW LEVEL SECURITY;

-- Sessions: users can only see/edit their own
CREATE POLICY "Users manage own sessions" ON public.becca_chat_sessions
  FOR ALL USING (auth.uid() = user_id);

-- Messages: users can only see/edit messages in their own sessions
CREATE POLICY "Users manage own messages" ON public.becca_chat_messages
  FOR ALL USING (
    session_id IN (
      SELECT id FROM public.becca_chat_sessions WHERE user_id = auth.uid()
    )
  );
