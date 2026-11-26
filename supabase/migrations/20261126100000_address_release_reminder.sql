-- Remind a provider on Manual release who hasn't sent their address.
--
-- With address_release_policy = 'manual' nothing is sent for them: the address
-- reaches the client only when the provider taps "Send address to client" on
-- that booking. One who forgets can leave a client with nowhere to go, and
-- nothing reminded them until now.
--
-- A new provider notification, 'address_release_reminder' (in-app row + push,
-- under the "Appointment Reminders" switch, providerReminders), at three
-- points before a confirmed booking whose address hasn't been sent:
--   3 days before, 1 day before, 4 hours before (the user's pick, 2026-11-26).
-- Each point is sent once per booking (metadata.stage, keyed to the booking's
-- date and time so a rescheduled booking is reminded again). A point that had
-- already passed when the booking was confirmed is skipped, so a booking made
-- two days out gets the 1-day and 4-hour ones, never two at once. The 4-hour
-- one is the exception: a booking confirmed later than that still gets it
-- straight away, because that client needs the address soonest.
--
-- Everyone on Manual is reminded, mobile included (the user's call,
-- 2026-11-26). Salons and studios can't pick Manual. Booking times are UK
-- wall-clock time, read as Europe/London, the same as the timed release
-- (20261124220000).
--
-- Nothing is redefined: a new function and cron job, and one type added to
-- notifications_type_check, read from live.

BEGIN;

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
  -- 59 types live at authoring. Far fewer means the definition wasn't read
  -- the way this expects; stop rather than shrink the list.
  IF COALESCE(array_length(v_types, 1), 0) < 50 THEN
    RAISE EXCEPTION 'read only % types from notifications_type_check; refusing to rebuild it',
      COALESCE(array_length(v_types, 1), 0);
  END IF;

  v_types := ARRAY(
    SELECT DISTINCT t FROM unnest(v_types || ARRAY['address_release_reminder']) AS t ORDER BY t
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
  v_today date := (now() AT TIME ZONE 'Europe/London')::date;
  v_sent  integer;
BEGIN
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
  RETURN v_sent;
END;
$function$;

REVOKE ALL ON FUNCTION public.process_address_release_reminders() FROM PUBLIC, anon, authenticated;

-- Every 10 minutes, off the minutes the other crons use.
SELECT cron.unschedule('address-release-reminders')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'address-release-reminders');
SELECT cron.schedule('address-release-reminders', '7,17,27,37,47,57 * * * *',
                     'SELECT public.process_address_release_reminders();');

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261126100000', 'address_release_reminder')
ON CONFLICT DO NOTHING;

COMMIT;
