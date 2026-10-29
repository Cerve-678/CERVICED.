-- The provider-profile bell promised "We'll tell you when <name> releases new
-- slots" to every client, but only providers with a release day ever sent
-- anything. For everyone else the bell saved, turned green and did nothing.
-- And turning the bell OFF only cleared a flag, so the follow row stayed and
-- kept the client in that provider's promotion/announcement audience.
--
-- The definition (decided 2026-10-29):
--   • SAVING a provider (bookmarks) is just a list. It sends nothing.
--   • The BELL is the one switch for everything from that provider: "has
--     space again", their monthly release, promotions and announcements.
--     (Past clients still get a provider's promotions/announcements too.)
--
-- 1. Bell off = no follow. The bell is the only thing in the app that creates
--    a provider_follows row (followProvider/unfollowProvider had no callers),
--    so a row with the bell off means nothing except "used to have it on".
--    Existing bell-off rows are deleted; the app now deletes instead of
--    clearing the flag.
--
-- 2. "Has space again" for every belled provider. Hourly, for each live
--    provider that has a bell-on follower, check
--    whether a client could book ANY of their active services anywhere up to
--    their last bookable date, with get_services_open_within — the same
--    check the profile's "Fully Booked" button and Search use, so they can't
--    disagree. Record the answer.
--    When a provider who was fully booked at the last check now has an
--    opening, tell their bell-on followers. The message is true at send time
--    because it is caused by the check, not by a calendar date.
--      • Never on the first observation (no "again" without a "before").
--      • At most one alert per provider per 24h, so a hold expiring or a
--        cancellation flapping can't spam.
--      • Only 08:00–20:59 UK time. Outside that, the provider's state is left
--        at "fully booked" so the alert goes out at the next daytime check
--        if the opening is still there (and not at all if it's gone).
--      • Not on a provider's own release day: the release message covers
--        that day, and next month opening would otherwise read as "space
--        again". The day's checks just record the state quietly.
--
-- 3. Saved-only clients leave the promotion/announcement audience:
--    get_promotion_audience is bell followers + past clients (no bookmarks),
--    and the recipient guards in send_provider_client_notifications and
--    queue_scheduled_announcement no longer accept a bookmark as a reason.
--
-- 4. process_follow_availability_nudges() is dropped. Its cron was replaced by
--    the release-day job on 2026-08-08 and nothing has called it since.

BEGIN;

-- ── 1. bell off = no follow ─────────────────────────────────────────────────
DELETE FROM public.provider_follows WHERE notify_enabled = FALSE;

DROP FUNCTION IF EXISTS public.process_follow_availability_nudges();

-- ── 2a. the last date a client may book this provider ───────────────────────
-- Exactly enforce_booking_bookability's rule: booking_date > CURRENT_DATE +
-- booking_window_days is rejected (NULL window = 60). A 0 window means no
-- limit, returned as NULL — callers that scan day by day cap it themselves.
-- One place to change when a provider's horizon gets another shape.
CREATE OR REPLACE FUNCTION public.provider_last_bookable_date(p_provider_id uuid)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
           WHEN COALESCE(p.booking_window_days, 60) > 0 THEN CURRENT_DATE + COALESCE(p.booking_window_days, 60)
           ELSE NULL
         END
    FROM public.providers p
   WHERE p.id = p_provider_id;
$$;

-- ── 2b. ONE "is there a free slot" check, for any number of days ──────────
-- get_services_availability's slot rules (working windows/overrides/blocked
-- dates, busy spans incl. live holds, per-service buffers, slot interval,
-- minimum notice), with the horizon as a parameter and never past what the
-- provider has opened (provider_last_bookable_date). The profile's "Fully
-- Booked" button, Search's 7-day badge and the bell's "has space again" all
-- ask THIS function, so they can't disagree about whether a provider is full.
CREATE OR REPLACE FUNCTION public.get_services_open_within(p_service_ids uuid[], p_within_days int)
RETURNS TABLE(service_id uuid, has_slot boolean, next_available date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
WITH clock AS (
  SELECT (now() AT TIME ZONE 'Europe/London') AS local_now,
         GREATEST(1, LEAST(COALESCE(p_within_days, 7), 180)) AS within_days
),
svc AS (
  SELECT
    s.id,
    s.provider_id,
    s.duration_minutes AS dur,
    COALESCE(s.buffer_before_mins, 0) AS buf_before,
    COALESCE(s.buffer_after_mins, p.buffer_mins, 0) AS buf_after,
    CASE WHEN p.slot_interval_mins IN (15, 30, 60) THEN p.slot_interval_mins ELSE 60 END AS step,
    COALESCE(p.min_booking_notice_hrs, 0) AS notice_hrs,
    -- Days to look at, today included: the asked-for span, never past the
    -- provider's last bookable date. NULL last date = no limit.
    CASE
      WHEN public.provider_last_bookable_date(p.id) IS NULL THEN (SELECT within_days FROM clock)
      ELSE GREATEST(0, LEAST((SELECT within_days FROM clock),
                             public.provider_last_bookable_date(p.id) - (SELECT local_now::date FROM clock) + 1))
    END AS horizon
  FROM public.services s
  JOIN public.providers p ON p.id = s.provider_id
  WHERE s.id = ANY(p_service_ids[1:300])
    AND s.is_active = TRUE
    AND p.has_gone_live = TRUE
    AND p.is_active = TRUE
),
svc_days AS (
  SELECT sv.id AS service_id, sv.provider_id,
         (c.local_now::date + g.n) AS day,
         EXTRACT(DOW FROM (c.local_now::date + g.n))::int AS dow
  FROM svc sv
  CROSS JOIN clock c
  CROSS JOIN LATERAL generate_series(0, sv.horizon - 1) AS g(n)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.provider_blocked_dates bd
    WHERE bd.provider_id = sv.provider_id AND bd.blocked_date = (c.local_now::date + g.n)
  )
),
windows AS (
  SELECT sd.service_id, sd.provider_id, sd.day, w.start_time, w.end_time
  FROM svc_days sd
  CROSS JOIN LATERAL (
    SELECT o.start_time, o.end_time
    FROM public.provider_availability_overrides o
    WHERE o.provider_id = sd.provider_id AND o.availability_date = sd.day
      AND o.is_closed = FALSE AND o.start_time IS NOT NULL AND o.end_time IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.provider_availability_overrides c
        WHERE c.provider_id = sd.provider_id AND c.availability_date = sd.day AND c.is_closed = TRUE)
    UNION ALL
    SELECT pw.start_time, pw.end_time
    FROM public.provider_availability_windows pw
    WHERE pw.provider_id = sd.provider_id AND pw.day_of_week = sd.dow
      AND NOT EXISTS (
        SELECT 1 FROM public.provider_availability_overrides o
        WHERE o.provider_id = sd.provider_id AND o.availability_date = sd.day
          AND (o.is_closed = TRUE OR (o.start_time IS NOT NULL AND o.end_time IS NOT NULL)))
    UNION ALL
    SELECT a.open_time, a.close_time
    FROM public.provider_availability a
    WHERE a.provider_id = sd.provider_id AND a.day_of_week = sd.dow AND a.is_closed = FALSE
      AND NOT EXISTS (
        SELECT 1 FROM public.provider_availability_windows pw
        WHERE pw.provider_id = sd.provider_id AND pw.day_of_week = sd.dow)
      AND NOT EXISTS (
        SELECT 1 FROM public.provider_availability_overrides o
        WHERE o.provider_id = sd.provider_id AND o.availability_date = sd.day
          AND (o.is_closed = TRUE OR (o.start_time IS NOT NULL AND o.end_time IS NOT NULL)))
  ) AS w
),
busy AS (
  SELECT b.provider_id, b.booking_date AS day,
    FLOOR(EXTRACT(EPOCH FROM (
      GREATEST(COALESCE(b.effective_start, b.booking_date + b.booking_time), b.booking_date::timestamp)
    )::time) / 60)::int AS s_min,
    FLOOR(EXTRACT(EPOCH FROM (
      LEAST(COALESCE(b.effective_end, b.booking_date + COALESCE(b.end_time, b.booking_time + INTERVAL '1 hour')),
            b.booking_date::timestamp + INTERVAL '1 day' - INTERVAL '1 second')
    )::time) / 60)::int AS e_min
  FROM public.bookings b
  WHERE b.provider_id IN (SELECT provider_id FROM svc)
    AND b.booking_date BETWEEN (SELECT local_now::date FROM clock)
                           AND (SELECT local_now::date + within_days - 1 FROM clock)
    AND b.status IN ('pending', 'confirmed', 'in_progress', 'on_hold')
    AND (b.status <> 'on_hold' OR b.hold_expires_at IS NULL OR b.hold_expires_at > NOW())
    AND NOT (b.status = 'on_hold' AND b.hold_batch_id IS NOT NULL
             AND auth.uid() IS NOT NULL AND b.user_id = auth.uid())
),
slots AS (
  SELECT wd.service_id, wd.provider_id, wd.day, m.start_min,
         sv.dur, sv.buf_before, sv.buf_after, sv.notice_hrs
  FROM windows wd
  JOIN svc sv ON sv.id = wd.service_id
  CROSS JOIN LATERAL generate_series(
    FLOOR(EXTRACT(EPOCH FROM wd.start_time) / 60)::int,
    FLOOR(EXTRACT(EPOCH FROM wd.end_time) / 60)::int - 1,
    sv.step
  ) AS m(start_min)
  WHERE m.start_min + sv.dur <= FLOOR(EXTRACT(EPOCH FROM wd.end_time) / 60)::int
),
open_slots AS (
  SELECT sl.service_id, sl.day
  FROM slots sl
  CROSS JOIN clock c
  WHERE (sl.day + (sl.start_min * INTERVAL '1 minute')) >= (c.local_now + (sl.notice_hrs * INTERVAL '1 hour'))
    AND NOT EXISTS (
      SELECT 1 FROM busy bz
      WHERE bz.provider_id = sl.provider_id AND bz.day = sl.day
        AND (sl.start_min - sl.buf_before) < bz.e_min
        AND bz.s_min < (sl.start_min + sl.dur + sl.buf_after)
    )
)
SELECT sv.id AS service_id,
       (MIN(os.day) IS NOT NULL) AS has_slot,
       MIN(os.day) AS next_available
FROM svc sv
LEFT JOIN open_slots os ON os.service_id = sv.id
GROUP BY sv.id;
$function$;

REVOKE ALL ON FUNCTION public.get_services_open_within(uuid[], int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_services_open_within(uuid[], int) TO authenticated;

-- Search's 7-day badge is now the same check over 7 days. Same signature,
-- same grants (CREATE OR REPLACE keeps them). One behaviour change, from the
-- shared horizon rule: a rolling window under 7 days now includes its last
-- day (e.g. 4 days for a 3-day window), matching what the booking trigger has
-- always accepted.
CREATE OR REPLACE FUNCTION public.get_services_availability(p_service_ids uuid[])
 RETURNS TABLE(service_id uuid, has_slot boolean, next_available date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT * FROM public.get_services_open_within(p_service_ids, 7);
$function$;

-- ── 2c. last observed state per provider (private) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.provider_follow_openings_state (
  provider_id     uuid PRIMARY KEY REFERENCES public.providers(id) ON DELETE CASCADE,
  is_fully_booked boolean NOT NULL,
  checked_at      timestamptz NOT NULL DEFAULT now(),
  last_alert_at   timestamptz
);
ALTER TABLE public.provider_follow_openings_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provider_follow_openings_state FROM PUBLIC, anon, authenticated;

-- ── 2d. the hourly check ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_follow_openings_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r RECORD;
  v_open boolean;
  v_was_full boolean;
  v_last_alert timestamptz;
  v_local_hour int := EXTRACT(HOUR FROM (now() AT TIME ZONE 'Europe/London'))::int;
  v_daytime boolean := v_local_hour BETWEEN 8 AND 20;
BEGIN
  -- Forget any provider who has left the audience (went offline, lost every
  -- bell follower, or has nothing set up). Their
  -- state stops updating while they're out, so a stale "fully booked" would
  -- otherwise send a false "has space again" the moment they come back.
  -- They re-enter with a fresh first observation instead.
  DELETE FROM public.provider_follow_openings_state s
   WHERE NOT EXISTS (
     SELECT 1 FROM public.providers p
      WHERE p.id = s.provider_id
        AND p.has_gone_live = TRUE
        AND p.is_active = TRUE
        AND EXISTS (SELECT 1 FROM public.provider_follows f WHERE f.provider_id = p.id AND f.notify_enabled = TRUE)
        AND EXISTS (SELECT 1 FROM public.services sv WHERE sv.provider_id = p.id AND sv.is_active = TRUE AND sv.duration_minutes > 0)
        AND (
          EXISTS (SELECT 1 FROM public.provider_availability_windows w WHERE w.provider_id = p.id)
          OR EXISTS (SELECT 1 FROM public.provider_availability a WHERE a.provider_id = p.id AND a.is_closed = FALSE)
        )
   );

  FOR r IN
    SELECT p.id AS provider_id, p.display_name,
           -- Today is this provider's release day (a day past the month's end
           -- means its last day, as everywhere else).
           COALESCE(
             (p.automation_settings->>'scheduleReleaseDay') ~ '^[0-9]{1,2}$'
             AND LEAST((p.automation_settings->>'scheduleReleaseDay')::int,
                       EXTRACT(DAY FROM (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day'))::int)
                 = EXTRACT(DAY FROM CURRENT_DATE)::int,
             FALSE
           ) AS is_release_day
      FROM public.providers p
     WHERE p.has_gone_live = TRUE
       AND p.is_active = TRUE
       AND EXISTS (
         SELECT 1 FROM public.provider_follows f
          WHERE f.provider_id = p.id AND f.notify_enabled = TRUE
       )
       -- Nothing bookable because nothing is SET UP (no active service, or no
       -- working hours at all) isn't "fully booked". Counting it as full
       -- would send "has space again" the day they finish setting up.
       AND EXISTS (
         SELECT 1 FROM public.services s
          WHERE s.provider_id = p.id AND s.is_active = TRUE AND s.duration_minutes > 0
       )
       AND (
         EXISTS (SELECT 1 FROM public.provider_availability_windows w WHERE w.provider_id = p.id)
         OR EXISTS (SELECT 1 FROM public.provider_availability a WHERE a.provider_id = p.id AND a.is_closed = FALSE)
       )
  LOOP
    -- The same question the profile's "Fully Booked" button asks: any free
    -- slot for any active service, up to 180 days and never past what the
    -- provider has opened.
    v_open := EXISTS (
      SELECT 1
        FROM public.get_services_open_within(
               ARRAY(SELECT s.id FROM public.services s
                      WHERE s.provider_id = r.provider_id AND s.is_active = TRUE),
               180) o
       WHERE o.has_slot
    );

    SELECT s.is_fully_booked, s.last_alert_at
      INTO v_was_full, v_last_alert
      FROM public.provider_follow_openings_state s
     WHERE s.provider_id = r.provider_id;

    IF NOT FOUND THEN
      -- First sight of this provider: record only. No "again" without a "before".
      INSERT INTO public.provider_follow_openings_state (provider_id, is_fully_booked)
      VALUES (r.provider_id, NOT v_open);
      CONTINUE;
    END IF;

    IF r.is_release_day THEN
      -- The release message speaks for today; record quietly.
      UPDATE public.provider_follow_openings_state
         SET is_fully_booked = NOT v_open, checked_at = now()
       WHERE provider_id = r.provider_id;
      CONTINUE;
    END IF;

    IF v_was_full AND v_open THEN
      -- Night, or alerted in the last day: hold the state at "fully booked" so
      -- the next eligible check re-tests and sends only if it's still open.
      CONTINUE WHEN NOT v_daytime;
      CONTINUE WHEN v_last_alert IS NOT NULL AND v_last_alert > now() - INTERVAL '24 hours';

      UPDATE public.provider_follow_openings_state
         SET is_fully_booked = FALSE, checked_at = now(), last_alert_at = now()
       WHERE provider_id = r.provider_id;

      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, provider_id, metadata)
      SELECT
        f.user_id,
        'announcement',
        COALESCE(r.display_name, 'Your provider') || ' has space again',
        COALESCE(r.display_name, 'Your provider') || ' was fully booked and now has openings. Take a look before they go.',
        'low',
        TRUE,
        r.provider_id,
        jsonb_build_object('kind', 'follow_openings_again')
      FROM public.provider_follows f
      WHERE f.provider_id = r.provider_id AND f.notify_enabled = TRUE;
    ELSE
      UPDATE public.provider_follow_openings_state
         SET is_fully_booked = NOT v_open, checked_at = now()
       WHERE provider_id = r.provider_id;
    END IF;
  END LOOP;
END;
$$;

-- ── 3. saving is quiet: bell followers + past clients only ──────────────────
-- Each redefined from its live definition (2026-10-29) with the bookmarks
-- branch removed and nothing else changed.
CREATE OR REPLACE FUNCTION public.get_promotion_audience(p_promotion_id uuid)
 RETURNS TABLE(user_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    SELECT follow.user_id
    FROM public.provider_follows AS follow
    WHERE follow.provider_id = v_provider_id
      AND follow.notify_enabled = TRUE
    UNION
    SELECT booking.user_id
    FROM public.bookings AS booking
    WHERE booking.provider_id = v_provider_id
      AND booking.status IN ('completed', 'confirmed');
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

  -- Same ownership check as send_provider_client_notifications (2026-08-15
  -- harden_notification_delivery_authority) — a queued announcement must not
  -- bypass the relationship boundary that immediate sends now enforce.
  -- Saving a provider (bookmarks) is not a relationship that receives
  -- messages; the bell is (2026-10-29).
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
  -- messages; the bell is (2026-10-29).
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

REVOKE ALL ON FUNCTION public.provider_last_bookable_date(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_follow_openings_alerts() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule(
  'provider-follow-openings-alerts',
  '20 * * * *',
  'SELECT public.process_follow_openings_alerts();'
);

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261026100000', 'follow_bell_tells_the_truth')
ON CONFLICT (version) DO NOTHING;

COMMIT;
