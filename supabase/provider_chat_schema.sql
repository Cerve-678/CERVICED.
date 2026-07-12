-- ============================================================
-- Provider ↔ Client Chat
-- Run this in Supabase SQL Editor
-- ============================================================

-- One conversation per (provider, user) pair
CREATE TABLE IF NOT EXISTS public.provider_conversations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id          UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  user_id              UUID NOT NULL REFERENCES public.users(id)     ON DELETE CASCADE,
  last_message         TEXT,
  last_message_at      TIMESTAMPTZ,
  unread_count_user    INT NOT NULL DEFAULT 0,
  unread_count_provider INT NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(provider_id, user_id)
);

-- Individual messages
CREATE TABLE IF NOT EXISTS public.provider_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID NOT NULL REFERENCES public.provider_conversations(id) ON DELETE CASCADE,
  sender_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_type      TEXT NOT NULL CHECK (sender_type IN ('user', 'provider')),
  content          TEXT NOT NULL,
  read_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pconv_provider  ON public.provider_conversations(provider_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_pconv_user      ON public.provider_conversations(user_id,     updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_pmsg_conv       ON public.provider_messages(conversation_id,  created_at ASC);

-- RLS
ALTER TABLE public.provider_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_messages      ENABLE ROW LEVEL SECURITY;

-- Conversations: visible to the user or the provider
DROP POLICY IF EXISTS "Users see own conversations" ON public.provider_conversations;
CREATE POLICY "Users see own conversations" ON public.provider_conversations
  FOR ALL USING (
    auth.uid() = user_id
    OR auth.uid() IN (SELECT user_id FROM public.providers WHERE id = provider_id)
  );

-- Messages: visible if user owns the conversation or is the provider
DROP POLICY IF EXISTS "Participants see conversation messages" ON public.provider_messages;
CREATE POLICY "Participants see conversation messages" ON public.provider_messages
  FOR ALL USING (
    conversation_id IN (
      SELECT id FROM public.provider_conversations
      WHERE user_id = auth.uid()
         OR provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
    )
  );

-- Auto-update updated_at on conversations
CREATE OR REPLACE FUNCTION public.touch_conversation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.provider_conversations
  SET updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_conversation ON public.provider_messages;
CREATE TRIGGER trg_touch_conversation
  AFTER INSERT ON public.provider_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_conversation();

-- Helper: update last_message + bump the OTHER side's unread count.
-- p_sender_type defaults to 'user' so 2-arg calls (client app) keep working.
-- Keep ONE function only: an old 2-arg version alongside this one makes the
-- client's 2-arg RPC call ambiguous in PostgREST, so drop it first.
DROP FUNCTION IF EXISTS public.update_conversation_last_message(UUID, TEXT);

-- Definition kept byte-identical to chat_two_way_fix.sql — the same function
-- also lives in provider_reminder_jobs.sql and RUN_ALL_MIGRATIONS.sql; keep all
-- four in sync so behaviour never depends on which script ran last.
CREATE OR REPLACE FUNCTION public.update_conversation_last_message(
  conv_id       UUID,
  msg_text      TEXT,
  p_sender_type TEXT DEFAULT 'user'
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.provider_conversations
  SET last_message    = msg_text,
      last_message_at = NOW(),
      updated_at      = NOW(),
      -- A message is unread for the RECIPIENT, never the sender
      unread_count_provider = unread_count_provider
        + CASE WHEN p_sender_type = 'user'     THEN 1 ELSE 0 END,
      unread_count_user     = unread_count_user
        + CASE WHEN p_sender_type = 'provider' THEN 1 ELSE 0 END
  WHERE id = conv_id;
END;
$$;

-- Enable realtime on messages (guarded — ALTER PUBLICATION errors on re-run)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'provider_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.provider_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'provider_conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.provider_conversations;
  END IF;
END $$;
