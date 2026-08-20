-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260820095825
-- Remote name: harden_promotion_and_conversation_rpcs
-- Do not edit this recovery archive; create a new tracked migration for changes.

-- Promotion-audience membership and conversation metadata are private data.
-- These SECURITY DEFINER RPCs must verify the caller owns the requested resource.

-- This lookup returns sensitive profile information (including allergies and
-- medical notes). Its existing provider/booking ownership predicate remains
-- authoritative; remove anonymous execution as an additional boundary.
REVOKE ALL ON FUNCTION public.get_client_beauty_profile_for_provider(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_beauty_profile_for_provider(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_promotion_audience(p_promotion_id uuid)
RETURNS TABLE(user_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_provider_id uuid;
BEGIN
  SELECT promotion.provider_id
    INTO v_provider_id
  FROM public.promotions AS promotion
  JOIN public.providers AS provider
    ON provider.id = promotion.provider_id
  WHERE promotion.id = p_promotion_id
    AND provider.user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Promotion not found or not owned by caller';
  END IF;

  RETURN QUERY
    SELECT bookmark.user_id
    FROM public.bookmarks AS bookmark
    WHERE bookmark.provider_id = v_provider_id
    UNION
    SELECT follow.user_id
    FROM public.provider_follows AS follow
    WHERE follow.provider_id = v_provider_id
    UNION
    SELECT booking.user_id
    FROM public.bookings AS booking
    WHERE booking.provider_id = v_provider_id
      AND booking.status IN ('completed', 'confirmed');
END;
$$;

REVOKE ALL ON FUNCTION public.get_promotion_audience(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_promotion_audience(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_conversation_last_message(
  conv_id uuid,
  msg_text text,
  p_sender_type text DEFAULT 'user'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_sender_type NOT IN ('user', 'provider') THEN
    RAISE EXCEPTION 'Invalid sender type';
  END IF;

  UPDATE public.provider_conversations AS conversation
  SET last_message = msg_text,
      last_message_at = NOW(),
      updated_at = NOW(),
      unread_count_provider = unread_count_provider
        + CASE WHEN p_sender_type = 'user' THEN 1 ELSE 0 END,
      unread_count_user = unread_count_user
        + CASE WHEN p_sender_type = 'provider' THEN 1 ELSE 0 END
  WHERE conversation.id = conv_id
    AND (
      (p_sender_type = 'user' AND conversation.user_id = auth.uid())
      OR (
        p_sender_type = 'provider'
        AND EXISTS (
          SELECT 1
          FROM public.providers AS provider
          WHERE provider.id = conversation.provider_id
            AND provider.user_id = auth.uid()
        )
      )
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation not found or not owned by sender';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_conversation_last_message(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_conversation_last_message(uuid, text, text)
  TO authenticated;
