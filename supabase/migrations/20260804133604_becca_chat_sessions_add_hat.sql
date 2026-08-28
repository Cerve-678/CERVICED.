-- Becca chat history is per-HAT, not just per-user. A user with both hats has
-- two separate assistants (client "Beauty Assistant" vs provider "Business
-- Assistant") answering from different data — sharing one history list meant a
-- provider saw their own client-side chats mixed into their business history.
ALTER TABLE public.becca_chat_sessions
  ADD COLUMN IF NOT EXISTS hat TEXT NOT NULL DEFAULT 'client'
  CHECK (hat IN ('client', 'provider'));

-- Existing rows predate the split. They were all created by the client-hat
-- flow (provider Becca was navigation-only and never persisted a session),
-- so 'client' is the correct backfill, not a guess.

-- Replaces the user-only index: every list query now filters on hat too.
CREATE INDEX IF NOT EXISTS idx_becca_sessions_user_hat
  ON public.becca_chat_sessions(user_id, hat, updated_at DESC);;
