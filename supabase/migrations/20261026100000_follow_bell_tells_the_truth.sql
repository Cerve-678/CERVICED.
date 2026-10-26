-- The provider-profile bell promised "We'll tell you when <name> releases new
-- slots" to every client, but only providers with a release day ever sent
-- anything. For everyone else the bell saved, turned green and did nothing.
-- And turning the bell OFF only cleared a flag, so the follow row stayed and
-- kept the client in that provider's promotion/announcement audience.
--
-- 1. Bell off = no follow. The bell is the only thing in the app that creates
--    a provider_follows row (followProvider/unfollowProvider had no callers),
--    so a row with the bell off means nothing except "used to have it on".
--    Existing bell-off rows are deleted; the app now deletes instead of
--    clearing the flag. Promotions, announcements and follower counts all
--    read provider_follows, so they respect the bell with no further change.
--
-- 2. "Openings again" for providers WITHOUT a release day. Hourly, for each
--    live provider that has a bell-on follower and no release day, check
--    whether a client could book ANY of their active services anywhere up to
--    their last bookable date (same rules as get_services_availability:
--    working windows/overrides/blocked dates, busy spans incl. live holds,
--    per-service buffers, slot interval, minimum notice). Record the answer.
--    When a provider who was fully booked at the last check now has an
--    opening, tell their bell-on followers. The message is true at send time
--    because it is caused by the check, not by a calendar date.
--      • Never on the first observation (no "again" without a "before").
--      • At most one alert per provider per 24h, so a hold expiring or a
--        cancellation flapping can't spam.
--      • Only 08:00–20:59 UK time. Outside that, the provider's state is left
--        at "fully booked" so the alert goes out at the next daytime check
--        if the opening is still there (and not at all if it's gone).
--    Release-day providers are left to process_follow_schedule_release_nudges.
--
-- 3. process_follow_availability_nudges() is dropped. Its cron was replaced by
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

-- ── 2b. can a client book anything with this provider before p_through? ─────
-- get_services_availability's rules, for every active service of one
-- provider, over today..p_through instead of a fixed 7 days.
CREATE OR REPLACE FUNCTION public.provider_has_bookable_opening(p_provider_id uuid, p_through date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
WITH clock AS (
  SELECT (now() AT TIME ZONE 'Europe/London') AS local_now
),
svc AS (
  SELECT
    s.id,
    s.duration_minutes AS dur,
    COALESCE(s.buffer_before_mins, 0) AS buf_before,
    COALESCE(s.buffer_after_mins, p.buffer_mins, 0) AS buf_after,
    CASE WHEN p.slot_interval_mins IN (15, 30, 60) THEN p.slot_interval_mins ELSE 60 END AS step,
    COALESCE(p.min_booking_notice_hrs, 0) AS notice_hrs
  FROM public.services s
  JOIN public.providers p ON p.id = s.provider_id
  WHERE s.provider_id = p_provider_id
    AND s.is_active = TRUE
    AND s.duration_minutes > 0
    AND p.has_gone_live = TRUE
    AND p.is_active = TRUE
),
days AS (
  SELECT d::date AS day, EXTRACT(DOW FROM d)::int AS dow
  FROM clock c
  CROSS JOIN LATERAL generate_series(c.local_now::date, p_through, INTERVAL '1 day') AS d
  WHERE NOT EXISTS (
    SELECT 1 FROM public.provider_blocked_dates bd
    WHERE bd.provider_id = p_provider_id AND bd.blocked_date = d::date
  )
),
windows AS (
  SELECT dd.day, w.start_time, w.end_time
  FROM days dd
  CROSS JOIN LATERAL (
    SELECT o.start_time, o.end_time
    FROM public.provider_availability_overrides o
    WHERE o.provider_id = p_provider_id AND o.availability_date = dd.day
      AND o.is_closed = FALSE AND o.start_time IS NOT NULL AND o.end_time IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.provider_availability_overrides c
        WHERE c.provider_id = p_provider_id AND c.availability_date = dd.day AND c.is_closed = TRUE)
    UNION ALL
    SELECT pw.start_time, pw.end_time
    FROM public.provider_availability_windows pw
    WHERE pw.provider_id = p_provider_id AND pw.day_of_week = dd.dow
      AND NOT EXISTS (
        SELECT 1 FROM public.provider_availability_overrides o
        WHERE o.provider_id = p_provider_id AND o.availability_date = dd.day
          AND (o.is_closed = TRUE OR (o.start_time IS NOT NULL AND o.end_time IS NOT NULL)))
    UNION ALL
    SELECT a.open_time, a.close_time
    FROM public.provider_availability a
    WHERE a.provider_id = p_provider_id AND a.day_of_week = dd.dow AND a.is_closed = FALSE
      AND NOT EXISTS (
        SELECT 1 FROM public.provider_availability_windows pw
        WHERE pw.provider_id = p_provider_id AND pw.day_of_week = dd.dow)
      AND NOT EXISTS (
        SELECT 1 FROM public.provider_availability_overrides o
        WHERE o.provider_id = p_provider_id AND o.availability_date = dd.day
          AND (o.is_closed = TRUE OR (o.start_time IS NOT NULL AND o.end_time IS NOT NULL)))
  ) AS w
),
busy AS (
  SELECT b.booking_date AS day,
    FLOOR(EXTRACT(EPOCH FROM (
      GREATEST(COALESCE(b.effective_start, b.booking_date + b.booking_time), b.booking_date::timestamp)
    )::time) / 60)::int AS s_min,
    FLOOR(EXTRACT(EPOCH FROM (
      LEAST(COALESCE(b.effective_end, b.booking_date + COALESCE(b.end_time, b.booking_time + INTERVAL '1 hour')),
            b.booking_date::timestamp + INTERVAL '1 day' - INTERVAL '1 second')
    )::time) / 60)::int AS e_min
  FROM public.bookings b
  WHERE b.provider_id = p_provider_id
    AND b.booking_date BETWEEN (SELECT local_now::date FROM clock) AND p_through
    AND b.status IN ('pending', 'confirmed', 'in_progress', 'on_hold')
    AND (b.status <> 'on_hold' OR b.hold_expires_at IS NULL OR b.hold_expires_at > NOW())
)
SELECT EXISTS (
  SELECT 1
  FROM windows wd
  CROSS JOIN svc sv
  CROSS JOIN clock c
  CROSS JOIN LATERAL generate_series(
    FLOOR(EXTRACT(EPOCH FROM wd.start_time) / 60)::int,
    FLOOR(EXTRACT(EPOCH FROM wd.end_time) / 60)::int - 1,
    sv.step
  ) AS m(start_min)
  WHERE m.start_min + sv.dur <= FLOOR(EXTRACT(EPOCH FROM wd.end_time) / 60)::int
    AND (wd.day + (m.start_min * INTERVAL '1 minute')) >= (c.local_now + (sv.notice_hrs * INTERVAL '1 hour'))
    AND NOT EXISTS (
      SELECT 1 FROM busy bz
      WHERE bz.day = wd.day
        AND (m.start_min - sv.buf_before) < bz.e_min
        AND bz.s_min < (m.start_min + sv.dur + sv.buf_after)
    )
);
$$;

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
  -- Forget any provider who has left the audience (gained a release day,
  -- went offline, lost every bell follower, or has nothing set up). Their
  -- state stops updating while they're out, so a stale "fully booked" would
  -- otherwise send a false "has space again" the moment they come back.
  -- They re-enter with a fresh first observation instead.
  DELETE FROM public.provider_follow_openings_state s
   WHERE NOT EXISTS (
     SELECT 1 FROM public.providers p
      WHERE p.id = s.provider_id
        AND p.has_gone_live = TRUE
        AND p.is_active = TRUE
        AND NOT COALESCE((p.automation_settings->>'scheduleReleaseDay') ~ '^[0-9]+$', FALSE)
        AND EXISTS (SELECT 1 FROM public.provider_follows f WHERE f.provider_id = p.id AND f.notify_enabled = TRUE)
        AND EXISTS (SELECT 1 FROM public.services sv WHERE sv.provider_id = p.id AND sv.is_active = TRUE AND sv.duration_minutes > 0)
        AND (
          EXISTS (SELECT 1 FROM public.provider_availability_windows w WHERE w.provider_id = p.id)
          OR EXISTS (SELECT 1 FROM public.provider_availability a WHERE a.provider_id = p.id AND a.is_closed = FALSE)
        )
   );

  FOR r IN
    SELECT p.id AS provider_id, p.display_name
      FROM public.providers p
     WHERE p.has_gone_live = TRUE
       AND p.is_active = TRUE
       -- COALESCE: no release day is NULL, and NOT NULL would skip exactly
       -- the providers this is for.
       AND NOT COALESCE((p.automation_settings->>'scheduleReleaseDay') ~ '^[0-9]+$', FALSE)
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
    -- No limit = look 180 days ahead, like the profile's own "Fully Booked" check.
    v_open := public.provider_has_bookable_opening(
      r.provider_id,
      LEAST(COALESCE(public.provider_last_bookable_date(r.provider_id), CURRENT_DATE + 180), CURRENT_DATE + 180)
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

REVOKE ALL ON FUNCTION public.provider_last_bookable_date(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.provider_has_bookable_opening(uuid, date) FROM PUBLIC, anon, authenticated;
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
