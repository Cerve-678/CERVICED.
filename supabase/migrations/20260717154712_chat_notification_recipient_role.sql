create or replace function public.notify_on_new_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  v_user_id          UUID;
  v_provider_id      UUID;
  v_provider_user_id UUID;
  v_provider_name    TEXT;
  v_recipient        UUID;
  v_recipient_role   TEXT;
  v_sender_name      TEXT;
BEGIN
  SELECT c.user_id, c.provider_id, p.user_id, p.display_name
    INTO v_user_id, v_provider_id, v_provider_user_id, v_provider_name
    FROM public.provider_conversations c
    JOIN public.providers p ON p.id = c.provider_id
   WHERE c.id = NEW.conversation_id;

  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.sender_type = 'user' THEN
    -- client messaged the provider -> notify the provider's owner, provider hat
    v_recipient := v_provider_user_id;
    v_recipient_role := 'provider';
    SELECT COALESCE(u.name, 'A client') INTO v_sender_name
      FROM public.users u WHERE u.id = v_user_id;
  ELSE
    -- provider messaged the client -> notify the client, client hat
    v_recipient := v_user_id;
    v_recipient_role := 'client';
    v_sender_name := v_provider_name;
  END IF;

  IF v_recipient IS NULL THEN
    RETURN NEW;
  END IF;

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
    (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role, target_role)
  VALUES (
    v_recipient,
    'new_message',
    'New message from ' || COALESCE(v_sender_name, 'your conversation'),
    LEFT(NEW.content, 120) || CASE WHEN LENGTH(NEW.content) > 120 THEN '…' ELSE '' END,
    'medium',
    TRUE,
    NULL,
    v_provider_id,
    v_recipient_role,
    v_recipient_role
  );

  RETURN NEW;
END;
$$;;
