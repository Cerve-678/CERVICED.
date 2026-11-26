-- The Manual-release address reminder goes to home-based providers only, and
-- the client is told to message their provider if it still hasn't come.
--
-- 1. Mobile providers are no longer reminded (the user's call, 2026-11-26,
--    reversing the morning's "anyone on Manual"). On a mobile booking the
--    client's booking screen shows the CLIENT's address, never the
--    provider's, so a mobile provider who followed the reminder sent
--    something the client couldn't see.
-- 2. A new client notification, 'address_not_sent'. Once the provider's
--    4-hour reminder is an hour old and the address still hasn't been sent,
--    the client is told and asked to message the provider. It opens their
--    chat with that provider. Once per booking and time; clients with no
--    account (web guests) get nothing, as they have no in-app inbox.
--
-- process_address_release_reminders is rebuilt from live, guarded by md5.
-- Live differs from 20261126100000 only by comments: it was re-run from the
-- SQL editor with the comments taken out. This puts the file and live back
-- in step.

BEGIN;

DO $$
BEGIN
  IF (SELECT md5(pg_get_functiondef('public.process_address_release_reminders()'::regprocedure)))
     <> '4d7385ec95b6e36d71fe39733aab8416' THEN
    RAISE EXCEPTION 'process_address_release_reminders changed live since this migration was written';
  END IF;
END $$;

DO $$
DECLARE
  v_def   text;
  v_types text[];
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conrelid = 'public.notifications'::regclass AND conname = 'notifications_type_check';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'notifications_type_check not found; refusing to rebuild it blind';
  END IF;

  IF v_def ~ '''\{[a-z_,]+\}''' THEN
    v_types := (substring(v_def from '''(\{[a-z_,]+\})'''))::text[];
  ELSE
    SELECT array_agg(DISTINCT r.m[1]) INTO v_types
      FROM regexp_matches(v_def, '''([a-z_]+)''::text', 'g') AS r(m);
  END IF;
  -- 60 types live at authoring. Far fewer means the definition wasn't read
  -- the way this expects; stop rather than shrink the list.
  IF COALESCE(array_length(v_types, 1), 0) < 50 THEN
    RAISE EXCEPTION 'read only % types from notifications_type_check; refusing to rebuild it',
      COALESCE(array_length(v_types, 1), 0);
  END IF;

  v_types := ARRAY(
    SELECT DISTINCT t FROM unnest(v_types || ARRAY['address_not_sent']) AS t ORDER BY t
  );
  ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
  EXECUTE format(
    'ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (%L::text[]))',
    v_types);
END $$;

CREATE OR REPLACE FUNCTION public.process_address_release_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_today   date := (now() AT TIME ZONE 'Europe/London')::date;
  v_sent    integer;
  v_clients integer;
BEGIN
  -- The provider: 3 days, 1 day and 4 hours before.
  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable,
     booking_id, provider_id, recipient_role, metadata)
  SELECT
    p.user_id,
    'address_release_reminder',
    CASE s.stage WHEN '4h' THEN 'Send your address now' ELSE 'Address not sent yet' END,
    -- "Ama Jatta's Lash Lift is tomorrow at 2:00pm. Send your address from
    -- the booking."
    COALESCE(NULLIF(btrim(b.customer_name), ''), 'Your client') || '''s '
      || COALESCE(NULLIF(btrim(b.service_name_snapshot), ''), 'appointment') || ' is '
      || CASE
           WHEN b.booking_date = v_today     THEN 'today'
           WHEN b.booking_date = v_today + 1 THEN 'tomorrow'
           ELSE 'on ' || to_char(b.booking_date, 'FMDy FMDD Mon')
         END
      || ' at ' || to_char(b.booking_time, 'FMHH12:MIam') || '. '
      || CASE s.stage
           WHEN '4h' THEN 'Send your address now.'
           ELSE 'Send your address from the booking.'
         END,
    CASE s.stage WHEN '3d' THEN 'medium' ELSE 'high' END,
    TRUE,
    b.id,
    b.provider_id,
    'provider',
    jsonb_build_object('kind', 'address_release_reminder', 'stage', s.stage, 'for', t.slot)
  FROM public.bookings b
  JOIN public.providers p ON p.id = b.provider_id
  CROSS JOIN LATERAL (
    SELECT (b.booking_date + b.booking_time) AT TIME ZONE 'Europe/London' AS starts_at,
           b.booking_date::text || 'T' || b.booking_time::text           AS slot
  ) t
  CROSS JOIN LATERAL (
    SELECT CASE
             WHEN t.starts_at - now() <= interval '4 hours'  THEN '4h'
             WHEN t.starts_at - now() <= interval '24 hours' THEN '1d'
             ELSE '3d'
           END AS stage,
           CASE
             WHEN t.starts_at - now() <= interval '4 hours'  THEN interval '4 hours'
             WHEN t.starts_at - now() <= interval '24 hours' THEN interval '24 hours'
             ELSE interval '72 hours'
           END AS lead
  ) s
  WHERE b.status = 'confirmed'
    AND b.address_released_at IS NULL
    AND b.booking_date BETWEEN v_today AND v_today + 4
    AND t.starts_at > now()
    AND t.starts_at <= now() + interval '72 hours'
    AND p.address_release_policy = 'manual'
    -- A mobile provider's address is never where the appointment is, and the
    -- client's booking screen doesn't show it.
    AND p.business_type = 'home_based'
    AND p.user_id IS NOT NULL
    -- A point that passed before the booking was confirmed is skipped, except
    -- the last one.
    AND (s.stage = '4h' OR COALESCE(b.confirmed_at, b.created_at) <= t.starts_at - s.lead)
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
       WHERE n.booking_id = b.id
         AND n.type = 'address_release_reminder'
         AND n.metadata->>'stage' = s.stage
         AND n.metadata->>'for'   = t.slot
    );
  GET DIAGNOSTICS v_sent = ROW_COUNT;

  -- The client: an hour after the provider's last reminder, if the address
  -- still hasn't come. "Rose Haus hasn't sent their address for your Lash
  -- Lift today at 2:00pm. Message them to ask for it."
  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable,
     booking_id, provider_id, recipient_role, metadata)
  SELECT
    b.user_id,
    'address_not_sent',
    'Address not sent yet',
    COALESCE(NULLIF(btrim(b.provider_name_snapshot), ''), 'Your provider')
      || ' hasn''t sent their address for your '
      || COALESCE(NULLIF(btrim(b.service_name_snapshot), ''), 'appointment') || ' '
      || CASE
           WHEN b.booking_date = v_today     THEN 'today'
           WHEN b.booking_date = v_today + 1 THEN 'tomorrow'
           ELSE 'on ' || to_char(b.booking_date, 'FMDy FMDD Mon')
         END
      || ' at ' || to_char(b.booking_time, 'FMHH12:MIam')
      || '. Message them to ask for it.',
    'high',
    TRUE,
    b.id,
    b.provider_id,
    'client',
    jsonb_build_object('kind', 'address_not_sent', 'for', r.metadata->>'for')
  FROM public.notifications r
  JOIN public.bookings b ON b.id = r.booking_id
  JOIN public.providers p ON p.id = b.provider_id
  WHERE r.type = 'address_release_reminder'
    AND r.metadata->>'stage' = '4h'
    AND r.created_at <= now() - interval '1 hour'
    AND r.created_at >  now() - interval '5 hours'
    AND r.metadata->>'for' = b.booking_date::text || 'T' || b.booking_time::text
    AND b.status = 'confirmed'
    AND b.address_released_at IS NULL
    AND b.user_id IS NOT NULL
    AND p.address_release_policy = 'manual'
    AND ((b.booking_date + b.booking_time) AT TIME ZONE 'Europe/London') > now()
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
       WHERE n.booking_id = b.id
         AND n.type = 'address_not_sent'
         AND n.metadata->>'for' = r.metadata->>'for'
    );
  GET DIAGNOSTICS v_clients = ROW_COUNT;

  RETURN v_sent + v_clients;
END;
$function$;

REVOKE ALL ON FUNCTION public.process_address_release_reminders() FROM PUBLIC, anon, authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261126110000', 'address_reminder_home_based_and_client_notice')
ON CONFLICT DO NOTHING;

COMMIT;
