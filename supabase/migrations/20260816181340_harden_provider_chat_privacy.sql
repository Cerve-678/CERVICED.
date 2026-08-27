-- PROVENANCE: applied out-of-band (SQL editor), so it has NO row in
-- supabase_migrations.schema_migrations and does NOT appear in
-- supabase/remote-migrations/. Confirmed live 2026-08-20 during the
-- migration-record reconciliation: public.send_provider_conversation_message exists live.
-- BACKFILLED 2026-08-27: it now HAS a schema_migrations row at the version
-- above, so it no longer reads as unapplied to a ledger diff. Leaving it
-- un-backfilled had cost three separate re-investigations (2026-08-20,
-- 08-25, 08-27), which is what the missing row actually buys you. The row's
-- `statements` records only a pointer back to this file plus how it was
-- verified -- no SQL was re-executed to create it, because the text actually
-- run out-of-band was never captured. THIS FILE remains the authoritative
-- body; the ledger row is a record that it ran, not a copy of what ran.
--
-- RE-VERIFIED LIVE 2026-08-26, including the parts a "does the function exist"
-- check would miss. All four functions: SECURITY DEFINER, search_path pinned to
-- (public, pg_temp), EXECUTE revoked from anon, granted to authenticated, and
-- each body derives the caller from auth.uid(). Nothing to apply.
--
-- Because it has no schema_migrations row it reads as "unapplied" to any audit
-- that diffs supabase/migrations/ against that table -- it was re-flagged that
-- way on 2026-08-25. It is not. Check the live grants before believing
-- otherwise.

-- Provider ↔ client chat privacy boundary
--
-- A conversation is strictly one client and one provider. These RPCs derive
-- the sender/recipient from auth.uid() rather than trusting values supplied by
-- the mobile app. They also make sending a message and updating the inbox
-- preview/unread count one transaction, so a second open chat cannot bleed
-- state into this thread.

CREATE OR REPLACE FUNCTION public.get_or_create_provider_conversation(
  p_provider_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_conversation_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  -- Providers may only start chats with a client who has booked them.
  IF EXISTS (
    SELECT 1 FROM public.providers p
    WHERE p.id = p_provider_id AND p.user_id = v_user_id
  ) THEN
    IF p_user_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.provider_id = p_provider_id AND b.user_id = p_user_id
    ) THEN
      RAISE EXCEPTION 'Providers can only message their own booked clients';
    END IF;
    v_user_id := p_user_id;
  ELSIF p_user_id IS NOT NULL AND p_user_id <> v_user_id THEN
    RAISE EXCEPTION 'Clients can only create their own conversations';
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.providers p
    WHERE p.id = p_provider_id AND p.is_active = true AND p.has_gone_live = true
  ) THEN
    RAISE EXCEPTION 'Provider is not available for messaging';
  END IF;

  SELECT c.id INTO v_conversation_id
  FROM public.provider_conversations c
  WHERE c.provider_id = p_provider_id AND c.user_id = v_user_id;

  IF v_conversation_id IS NULL THEN
    INSERT INTO public.provider_conversations (provider_id, user_id)
    VALUES (p_provider_id, v_user_id)
    ON CONFLICT (provider_id, user_id) DO UPDATE
      SET updated_at = public.provider_conversations.updated_at
    RETURNING id INTO v_conversation_id;
  END IF;

  RETURN v_conversation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_provider_conversation_message(
  p_conversation_id uuid,
  p_content text
)
RETURNS TABLE (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  sender_type text,
  content text,
  created_at timestamptz,
  read_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sender_id uuid := auth.uid();
  v_sender_type text;
BEGIN
  IF v_sender_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;
  IF p_content IS NULL OR char_length(btrim(p_content)) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Messages must be between 1 and 1000 characters';
  END IF;

  SELECT CASE
    WHEN c.user_id = v_sender_id THEN 'user'
    WHEN EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = c.provider_id AND p.user_id = v_sender_id
    ) THEN 'provider'
  END
  INTO v_sender_type
  FROM public.provider_conversations c
  WHERE c.id = p_conversation_id;

  IF v_sender_type IS NULL THEN
    RAISE EXCEPTION 'Conversation not found or not available to caller';
  END IF;

  RETURN QUERY
  INSERT INTO public.provider_messages (conversation_id, sender_id, sender_type, content)
  VALUES (p_conversation_id, v_sender_id, v_sender_type, btrim(p_content))
  RETURNING provider_messages.id, provider_messages.conversation_id,
            provider_messages.sender_id, provider_messages.sender_type,
            provider_messages.content, provider_messages.created_at,
            provider_messages.read_at;

  UPDATE public.provider_conversations c
  SET last_message = btrim(p_content),
      last_message_at = now(),
      updated_at = now(),
      unread_count_provider = CASE WHEN v_sender_type = 'user' THEN c.unread_count_provider + 1 ELSE c.unread_count_provider END,
      unread_count_user = CASE WHEN v_sender_type = 'provider' THEN c.unread_count_user + 1 ELSE c.unread_count_user END
  WHERE c.id = p_conversation_id;
END;
$$;

-- Read receipts are scoped to the recipient's own counter. No participant can
-- modify the other party's unread state.
CREATE OR REPLACE FUNCTION public.mark_conversation_read_by_provider(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.provider_conversations c
  SET unread_count_provider = 0
  WHERE c.id = p_conversation_id
    AND EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = c.provider_id AND p.user_id = auth.uid()
    );
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversation not found or not owned by provider'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_conversation_read_by_user(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.provider_conversations c
  SET unread_count_user = 0
  WHERE c.id = p_conversation_id AND c.user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversation not found or not owned by user'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_provider_conversation(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.send_provider_conversation_message(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_conversation_read_by_provider(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_conversation_read_by_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_provider_conversation(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_provider_conversation_message(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read_by_provider(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read_by_user(uuid) TO authenticated;
