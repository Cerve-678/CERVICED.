-- Block and report in chat, for App Store guideline 1.2 (user-generated
-- content: people must be able to report content and block abusive users).
--
-- Frontier: live 20261125140000 (2026-11-25). Lock (none) on main, no
-- unapplied migration above it on any open PR. Re-check max(version) and the
-- lock in MIGRATION_OWNER.md before applying.
--
-- What this changes:
--   - Blocking uses the one block list that already exists (client_blocks,
--     block_person / unblock_person, the Circle screen's Blocked list). It now
--     also stops messages: a new message between a client and a provider is
--     refused when either has blocked the other. Checked by a BEFORE INSERT
--     trigger, so every path that writes a message is covered (only
--     send_provider_conversation_message does today).
--   - get_conversation_block_state / set_conversation_block let either side of
--     a chat block or unblock the other without the app ever learning the
--     other person's user id.
--   - support_requests gets three nullable columns naming what was reported
--     (a message, a review or a conversation's other person). The
--     send-support-request function fills them in; nothing else writes them.

BEGIN;

-- ── Messages are refused while either side has blocked the other ────────

CREATE OR REPLACE FUNCTION public.refuse_message_when_blocked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_client uuid;
  v_provider_user uuid;
BEGIN
  SELECT c.user_id, p.user_id
    INTO v_client, v_provider_user
  FROM public.provider_conversations c
  JOIN public.providers p ON p.id = c.provider_id
  WHERE c.id = NEW.conversation_id;

  IF v_client IS NOT NULL AND v_provider_user IS NOT NULL
     AND public.social_blocked_either_way(v_client, v_provider_user) THEN
    RAISE EXCEPTION 'You can''t send messages in this conversation.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.refuse_message_when_blocked() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_refuse_message_when_blocked ON public.provider_messages;
CREATE TRIGGER trg_refuse_message_when_blocked
  BEFORE INSERT ON public.provider_messages
  FOR EACH ROW EXECUTE FUNCTION public.refuse_message_when_blocked();

-- ── Block / unblock from inside a chat ──────────────────────────────────

-- The other person in a conversation the caller is part of, or NULL when the
-- caller isn't part of it.
CREATE OR REPLACE FUNCTION public.conversation_other_person(p_conversation_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
           WHEN c.user_id = auth.uid() THEN p.user_id
           WHEN p.user_id = auth.uid() THEN c.user_id
         END
  FROM public.provider_conversations c
  JOIN public.providers p ON p.id = c.provider_id
  WHERE c.id = p_conversation_id;
$$;

REVOKE ALL ON FUNCTION public.conversation_other_person(uuid) FROM PUBLIC, anon, authenticated;

-- Whether the caller has blocked the other person in this conversation. Says
-- nothing about whether the other person has blocked the caller: the blocked
-- person isn't told (same rule as block_person).
CREATE OR REPLACE FUNCTION public.get_conversation_block_state(p_conversation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_other uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
  v_other := public.conversation_other_person(p_conversation_id);
  IF v_other IS NULL THEN RAISE EXCEPTION 'Conversation not found.'; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.client_blocks
    WHERE blocker_id = auth.uid() AND blocked_id = v_other
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_conversation_block(p_conversation_id uuid, p_blocked boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_other uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
  v_other := public.conversation_other_person(p_conversation_id);
  IF v_other IS NULL THEN RAISE EXCEPTION 'Conversation not found.'; END IF;
  IF p_blocked THEN
    PERFORM public.block_person(v_other);
  ELSE
    PERFORM public.unblock_person(v_other);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_conversation_block_state(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_conversation_block(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_conversation_block_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_conversation_block(uuid, boolean) TO authenticated;

-- ── What a report is about ──────────────────────────────────────────────

ALTER TABLE public.support_requests
  ADD COLUMN IF NOT EXISTS reported_kind text
    CHECK (reported_kind IN ('message', 'review', 'conversation')),
  ADD COLUMN IF NOT EXISTS reported_id uuid,
  ADD COLUMN IF NOT EXISTS reported_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS support_requests_reported_user_idx
  ON public.support_requests (reported_user_id)
  WHERE reported_user_id IS NOT NULL;

COMMIT;
