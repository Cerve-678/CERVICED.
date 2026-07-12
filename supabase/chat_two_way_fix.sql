-- ============================================================
-- CERVICED — Two-Way Chat Fix
-- Run in Supabase SQL editor AFTER provider_chat_schema.sql and
-- notifications_full_matrix.sql. Safe to re-run.
--
-- Fixes:
--   1. update_conversation_last_message only took 2 args, but the
--      provider app calls it with p_sender_type — so every provider
--      reply failed the RPC silently: the conversation preview never
--      updated and the client's unread count never incremented.
--      It also ALWAYS bumped unread_count_provider, even for the
--      provider's own messages.
--   2. No notification fired on new messages — the recipient only saw
--      a message if they already had the chat open. The new trigger
--      inserts a 'new_message' notification, which rides the existing
--      push webhook (notifications INSERT → send-push-notification).
--   3. Realtime publication adds are made idempotent (the original
--      schema's plain ALTER PUBLICATION fails on re-run).
-- ============================================================

-- ───────────────────────────────────────────────────────────
-- 1. Replace the RPC with a sender-aware, 3-argument version
--    (drop the old 2-arg overload first, or PostgREST calls
--    become ambiguous between the two signatures)
-- ───────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.update_conversation_last_message(UUID, TEXT);

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

-- ───────────────────────────────────────────────────────────
-- 2. Allow the 'new_message' notification type
--    (full list copied from notifications_full_matrix.sql + new_message)
-- ───────────────────────────────────────────────────────────
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Full SUPERSET copied from notifications_full_matrix.sql + 'new_message'.
-- Keep in sync — a narrower list here breaks inserts of the missing types.
-- NOT VALID: enforce on new rows only, so legacy rows can't fail the
-- migration with error 23514.
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'booking_pending',
    'booking_confirmed',
    'booking_declined',
    'booking_cancelled',
    'booking_reminder',
    'booking_in_progress',
    'booking_not_started',
    'no_show',
    'payment_success',
    'new_provider',
    'reschedule_request',
    'reschedule_provider_response',
    'reschedule_confirmed',
    'review_request',
    'review_received',
    'promotion',
    'intake_form_reminder',
    'intake_form_received',   -- client got a form to fill in (client_automation_jobs.sql)
    'intake_form_completed',  -- client sent a filled form back (info_packs_bookings.sql)
    'info_pack_received',     -- client got prep/aftercare info (info_packs_bookings.sql)
    'provider_message',
    'announcement',           -- provider broadcast to clients (client_automation_jobs.sql)
    'balance_collected',
    'balance_reminder',
    'waitlist_slot_available',
    'new_message'             -- chat message received
  )) NOT VALID;

-- ───────────────────────────────────────────────────────────
-- 3. Notify the recipient when a chat message arrives.
--    Debounced: if the recipient already has an unread new_message
--    notification for this conversation partner from the last 10
--    minutes, skip — one ping per burst, not one per message.
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_new_chat_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id          UUID;
  v_provider_id      UUID;
  v_provider_user_id UUID;
  v_provider_name    TEXT;
  v_recipient        UUID;
  v_sender_name      TEXT;
BEGIN
  SELECT c.user_id, c.provider_id, p.user_id, p.display_name
    INTO v_user_id, v_provider_id, v_provider_user_id, v_provider_name
    FROM public.provider_conversations c
    JOIN public.providers p ON p.id = c.provider_id
   WHERE c.id = NEW.conversation_id;

  IF v_user_id IS NULL THEN
    RETURN NEW; -- conversation vanished; nothing to notify
  END IF;

  IF NEW.sender_type = 'user' THEN
    v_recipient := v_provider_user_id;
    SELECT COALESCE(u.name, 'A client') INTO v_sender_name
      FROM public.users u WHERE u.id = v_user_id;
  ELSE
    v_recipient := v_user_id;
    v_sender_name := v_provider_name;
  END IF;

  IF v_recipient IS NULL THEN
    RETURN NEW;
  END IF;

  -- Debounce burst messages
  IF EXISTS (
    SELECT 1 FROM public.notifications n
     WHERE n.user_id     = v_recipient
       AND n.type        = 'new_message'
       AND n.provider_id = v_provider_id
       AND n.is_read     = FALSE
       AND n.created_at  > NOW() - INTERVAL '10 minutes'
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
  VALUES (
    v_recipient,
    'new_message',
    'New message from ' || COALESCE(v_sender_name, 'your conversation'),
    LEFT(NEW.content, 120) || CASE WHEN LENGTH(NEW.content) > 120 THEN '…' ELSE '' END,
    'medium',
    TRUE,
    NULL,
    v_provider_id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_chat_message ON public.provider_messages;
CREATE TRIGGER trg_notify_new_chat_message
  AFTER INSERT ON public.provider_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_chat_message();

-- ───────────────────────────────────────────────────────────
-- 4. Idempotent realtime publication (safety net for fresh setups)
-- ───────────────────────────────────────────────────────────
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

-- ============================================================
-- DONE — provider replies now update previews + unread counts,
-- and both sides get push/in-app notifications for new messages
-- ============================================================
