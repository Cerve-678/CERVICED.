-- Announcements can reach people who saved you or have your bell on
-- (user request 2026-11-18: "add to announcement the people who saved or have
-- their bell on").
--
-- This reverses the 2026-10-29 rule "saving a provider sends nothing" for
-- ANNOUNCEMENTS ONLY. Promotions and every other provider -> client message
-- keep the old boundary: someone who only saved you still gets none of them.
--
-- 1. get_my_announcement_followers(): the signed-in provider's savers and bell
--    followers, as user ids with which of the two applies. Ids only — no names,
--    no contact details. Capped at 5000.
-- 2. send_provider_client_notifications: a saver (bookmarks) now counts as
--    related when p_type = 'announcement'. Everything else is unchanged.
-- 3. queue_scheduled_announcement: only ever queues announcements, so a saver
--    counts as related there too.
--
-- Both functions are redefined from live, guarded by md5 so a newer live
-- definition is never silently overwritten.

BEGIN;

DO $$
BEGIN
  IF (SELECT md5(pg_get_functiondef('public.send_provider_client_notifications(uuid[],text,text,text,text,boolean,uuid,jsonb)'::regprocedure)))
       <> 'feba3ffc2b3f551f40bf382dbacea217' THEN
    RAISE EXCEPTION 'send_provider_client_notifications changed since this migration was written';
  END IF;
  IF (SELECT md5(pg_get_functiondef('public.queue_scheduled_announcement(text,text,uuid[],timestamptz)'::regprocedure)))
       <> '5d606b50be53b5c71be5f3e329723ad3' THEN
    RAISE EXCEPTION 'queue_scheduled_announcement changed since this migration was written';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_my_announcement_followers()
RETURNS TABLE (user_id uuid, saved boolean, bell boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH me AS (
    SELECT p.id FROM public.providers p
     WHERE p.user_id = auth.uid()
     ORDER BY p.is_active DESC, p.created_at ASC
     LIMIT 1
  ),
  people AS (
    SELECT b.user_id, TRUE AS saved, FALSE AS bell
      FROM public.bookmarks b JOIN me ON b.provider_id = me.id
    UNION ALL
    SELECT f.user_id, FALSE, TRUE
      FROM public.provider_follows f JOIN me ON f.provider_id = me.id
     WHERE f.notify_enabled IS NOT FALSE
  )
  SELECT people.user_id, bool_or(people.saved), bool_or(people.bell)
    FROM people
   WHERE people.user_id IS NOT NULL AND people.user_id <> auth.uid()
   GROUP BY people.user_id
   LIMIT 5000;
$function$;

REVOKE ALL ON FUNCTION public.get_my_announcement_followers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_announcement_followers() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.send_provider_client_notifications(p_recipient_user_ids uuid[], p_type text, p_title text, p_message text, p_priority text DEFAULT 'medium'::text, p_is_actionable boolean DEFAULT false, p_booking_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- Saving a provider (bookmarks) is not a relationship that receives
  -- messages; the bell is (2026-10-29). The one exception is announcements,
  -- which reach people who saved you too (2026-11-18).
  SELECT recipient.user_id
    INTO v_invalid_recipient
  FROM unnest(p_recipient_user_ids) AS recipient(user_id)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.bookings AS booking
    WHERE booking.provider_id = v_provider_id AND booking.user_id = recipient.user_id
    UNION ALL
    SELECT 1 FROM public.provider_follows AS follow
    WHERE follow.provider_id = v_provider_id AND follow.user_id = recipient.user_id
    UNION ALL
    SELECT 1 FROM public.provider_waitlist AS waitlist
    WHERE waitlist.provider_id = v_provider_id AND waitlist.user_id = recipient.user_id
    UNION ALL
    SELECT 1 FROM public.bookmarks AS bookmark
    WHERE p_type = 'announcement'
      AND bookmark.provider_id = v_provider_id AND bookmark.user_id = recipient.user_id
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
$function$;

CREATE OR REPLACE FUNCTION public.queue_scheduled_announcement(p_title text, p_body text, p_recipient_ids uuid[], p_scheduled_for timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_provider_id UUID;
  v_id UUID;
  v_invalid_recipient UUID;
BEGIN
  SELECT id INTO v_provider_id FROM public.providers WHERE user_id = auth.uid();
  IF v_provider_id IS NULL THEN
    RAISE EXCEPTION 'No provider profile';
  END IF;
  IF p_scheduled_for <= NOW() THEN
    RAISE EXCEPTION 'scheduled_for must be in the future';
  END IF;
  IF array_length(p_recipient_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'recipient_ids must not be empty';
  END IF;

  -- Same ownership check as send_provider_client_notifications for an
  -- announcement: past clients, bell followers, waitlist, and people who
  -- saved you (2026-11-18).
  SELECT recipient.user_id
    INTO v_invalid_recipient
  FROM unnest(p_recipient_ids) AS recipient(user_id)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.bookings AS booking
    WHERE booking.provider_id = v_provider_id AND booking.user_id = recipient.user_id
    UNION ALL
    SELECT 1 FROM public.provider_follows AS follow
    WHERE follow.provider_id = v_provider_id AND follow.user_id = recipient.user_id
    UNION ALL
    SELECT 1 FROM public.provider_waitlist AS waitlist
    WHERE waitlist.provider_id = v_provider_id AND waitlist.user_id = recipient.user_id
    UNION ALL
    SELECT 1 FROM public.bookmarks AS bookmark
    WHERE bookmark.provider_id = v_provider_id AND bookmark.user_id = recipient.user_id
  )
  LIMIT 1;

  IF v_invalid_recipient IS NOT NULL THEN
    RAISE EXCEPTION 'Recipient is not related to this provider';
  END IF;

  INSERT INTO public.scheduled_announcements (provider_id, title, body, recipient_ids, scheduled_for)
  VALUES (v_provider_id, p_title, p_body, p_recipient_ids, p_scheduled_for)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261118140000', 'announce_to_savers_and_bell')
ON CONFLICT DO NOTHING;

COMMIT;
