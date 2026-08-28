-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260820100126
-- Remote name: harden_notification_delivery_authority
-- Do not edit this recovery archive; create a new tracked migration for changes.

-- Notification recipients must be derived from a relationship owned by the
-- caller. Direct client inserts previously let a provider choose any user ID.

CREATE OR REPLACE FUNCTION public.send_provider_client_notifications(
  p_recipient_user_ids uuid[],
  p_type text,
  p_title text,
  p_message text,
  p_priority text DEFAULT 'medium',
  p_is_actionable boolean DEFAULT false,
  p_booking_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_provider_id uuid;
  v_invalid_recipient uuid;
  v_inserted_count integer;
BEGIN
  IF auth.uid() IS NULL OR COALESCE(cardinality(p_recipient_user_ids), 0) = 0 THEN
    RAISE EXCEPTION 'A signed-in provider and at least one recipient are required';
  END IF;

  SELECT provider.id
    INTO v_provider_id
  FROM public.providers AS provider
  WHERE provider.user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Provider profile not found';
  END IF;

  IF p_booking_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.bookings AS booking
    WHERE booking.id = p_booking_id
      AND booking.provider_id = v_provider_id
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(p_recipient_user_ids) AS recipient(user_id)
        WHERE recipient.user_id <> booking.user_id
      )
  ) THEN
    RAISE EXCEPTION 'Booking does not belong to this provider and recipient';
  END IF;

  SELECT recipient.user_id
    INTO v_invalid_recipient
  FROM unnest(p_recipient_user_ids) AS recipient(user_id)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.bookings AS booking
    WHERE booking.provider_id = v_provider_id AND booking.user_id = recipient.user_id
    UNION ALL
    SELECT 1 FROM public.bookmarks AS bookmark
    WHERE bookmark.provider_id = v_provider_id AND bookmark.user_id = recipient.user_id
    UNION ALL
    SELECT 1 FROM public.provider_follows AS follow
    WHERE follow.provider_id = v_provider_id AND follow.user_id = recipient.user_id
    UNION ALL
    SELECT 1 FROM public.provider_waitlist AS waitlist
    WHERE waitlist.provider_id = v_provider_id AND waitlist.user_id = recipient.user_id
  )
  LIMIT 1;

  IF v_invalid_recipient IS NOT NULL THEN
    RAISE EXCEPTION 'Recipient is not related to this provider';
  END IF;

  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    message,
    priority,
    is_actionable,
    booking_id,
    provider_id,
    recipient_role,
    metadata
  )
  SELECT DISTINCT
    recipient.user_id,
    p_type,
    p_title,
    p_message,
    p_priority,
    p_is_actionable,
    p_booking_id,
    v_provider_id,
    'client',
    COALESCE(p_metadata, '{}'::jsonb)
  FROM unnest(p_recipient_user_ids) AS recipient(user_id);

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  RETURN v_inserted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_client_provider_booking_notification(
  p_booking_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_priority text DEFAULT 'medium',
  p_is_actionable boolean DEFAULT false,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_provider_id uuid;
  v_provider_user_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  SELECT booking.provider_id, provider.user_id
    INTO v_provider_id, v_provider_user_id
  FROM public.bookings AS booking
  JOIN public.providers AS provider ON provider.id = booking.provider_id
  WHERE booking.id = p_booking_id
    AND booking.user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found or not owned by caller';
  END IF;

  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    message,
    priority,
    is_actionable,
    booking_id,
    provider_id,
    recipient_role,
    metadata
  ) VALUES (
    v_provider_user_id,
    p_type,
    p_title,
    p_message,
    p_priority,
    p_is_actionable,
    p_booking_id,
    v_provider_id,
    'provider',
    COALESCE(p_metadata, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.send_provider_client_notifications(uuid[], text, text, text, text, boolean, uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_provider_client_notifications(uuid[], text, text, text, text, boolean, uuid, jsonb)
  TO authenticated;

REVOKE ALL ON FUNCTION public.send_client_provider_booking_notification(uuid, text, text, text, text, boolean, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_client_provider_booking_notification(uuid, text, text, text, text, boolean, jsonb)
  TO authenticated;

DROP POLICY IF EXISTS "Providers can send notifications to clients" ON public.notifications;
DROP POLICY IF EXISTS "notifications_participant_insert" ON public.notifications;

DROP POLICY IF EXISTS "notifications_owner_insert" ON public.notifications;

CREATE POLICY "notifications_owner_insert"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK ((select auth.uid()) = user_id);
