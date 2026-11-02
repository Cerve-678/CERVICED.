-- Fully Booked: notice when a provider's schedule fills, tell them once, and
-- give them a certificate and the Fully Booked achievements.
--
-- "Fully booked" is the client profile's own check (get_services_open_within):
-- no free slot for any active service on any date they've opened, and at least
-- one booking in that time. Checked every hour by the existing cron job, now
-- hourly instead of daily at 08:00, looking 14 days ahead first and the full 180
-- only when those are taken. Two kinds of fill, both said only during the day
-- (08:00-20:59 UK time, re-checked hourly), both pushing under the provider's
-- Fully Booked switch:
--   • A whole month: no space from today to a month end at least 4 weeks away.
--     Once per calendar month. A notification, the certificate (shown once on
--     My Profile) and the Fully Booked achievements.
--   • A shorter run (7+ days): a notification only. Recorded on the change
--     from space to full, or when first seen already full; again only after a
--     full day with space, and at most once a week, so a rolling window
--     gaining a day at midnight doesn't keep repeating it.
--
-- Not counted, and their state left as it was:
--   • a schedule closed by hand (nothing can be booked, so nothing filled);
--   • fewer than 7 days left to book. A release-day provider near month end has
--     a day or two before next month opens, and a finished day has no slots,
--     which isn't being fully booked.
-- Never counted: link-only providers, anyone with no active service or no hours,
-- and no free slot with no bookings at all (every date blocked for a holiday).
--
-- Replaces the old daily process_provider_fully_booked_alerts, which nothing in
-- the app could switch on (automation_settings.fullyBookedAlertEnabled had no
-- control) and which never sent once. Its cooldown column
-- providers.fully_booked_alert_last_sent_at goes with it.
--
-- Redefines, each from its live definition (2026-11-01), with an md5 guard:
--   process_provider_fully_booked_alerts  (rewritten)
--   get_my_provider_achievements          (adds the Fully Booked group: first
--                                          fill, 3 fills, and 3 months in a row
--                                          for providers with a release day)
--
-- Frontier at authoring: live 20261101190000. Re-check it and open branches
-- before applying.

BEGIN;

DO $guard$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(pg_get_functiondef('public.process_provider_fully_booked_alerts()'::regprocedure)) INTO v_md5;
  IF v_md5 <> '48f02170683db2817224efa5cf2d67db' THEN
    RAISE EXCEPTION 'process_provider_fully_booked_alerts changed since this migration was written (%): rebuild from live', v_md5;
  END IF;
  SELECT md5(pg_get_functiondef('public.get_my_provider_achievements()'::regprocedure)) INTO v_md5;
  IF v_md5 <> '2f7f437aa099e5fa6582eeda4ae5ea29' THEN
    RAISE EXCEPTION 'get_my_provider_achievements changed since this migration was written (%): rebuild from live', v_md5;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'provider-fully-booked-alerts') THEN
    RAISE EXCEPTION 'cron job provider-fully-booked-alerts is missing';
  END IF;
END;
$guard$;

-- ── 1. what's recorded ──────────────────────────────────────────────────────
-- Whether each provider was full at the last check, and since when they've had
-- space. Private: only the job below reads or writes it.
CREATE TABLE IF NOT EXISTS public.provider_fully_booked_state (
  provider_id uuid PRIMARY KEY REFERENCES public.providers(id) ON DELETE CASCADE,
  is_full     boolean NOT NULL,
  open_since  timestamptz,
  checked_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.provider_fully_booked_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provider_fully_booked_state FROM PUBLIC, anon, authenticated;

-- Each time a schedule filled. certificate_month is set for a whole month
-- (the 1st of it), which is what earns a certificate and the achievements;
-- NULL is a shorter run, which only gets a notification. seen_at is when the
-- provider saw the certificate.
CREATE TABLE IF NOT EXISTS public.provider_fully_booked_fills (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id       uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  filled_at         timestamptz NOT NULL DEFAULT now(),
  through_date      date NOT NULL,
  certificate_month date,
  seen_at           timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS provider_fully_booked_fills_one_certificate_a_month
  ON public.provider_fully_booked_fills (provider_id, certificate_month)
  WHERE certificate_month IS NOT NULL;
CREATE INDEX IF NOT EXISTS provider_fully_booked_fills_provider_idx
  ON public.provider_fully_booked_fills (provider_id, filled_at DESC);
ALTER TABLE public.provider_fully_booked_fills ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provider_fully_booked_fills FROM PUBLIC, anon, authenticated;

-- ── 2. the hourly check ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_provider_fully_booked_alerts()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r           RECORD;
  v_open      boolean;
  v_has_state boolean;
  v_was_full  boolean;
  v_open_since timestamptz;
  v_through   date;
  v_month_end date;
  v_new_fill  boolean;
  v_last      date;
  v_horizon   integer;
  v_services  uuid[];
  v_fill_id   uuid;
  v_today     date := (now() AT TIME ZONE 'Europe/London')::date;
  v_daytime   boolean := EXTRACT(HOUR FROM (now() AT TIME ZONE 'Europe/London'))::int BETWEEN 8 AND 20;
BEGIN
  -- Forget anyone who has left (offline, inactive, link-only, nothing set up),
  -- so they come back with a fresh first look instead of a stale "full". A
  -- closed schedule keeps its state: it's only paused.
  DELETE FROM public.provider_fully_booked_state st
   WHERE NOT EXISTS (
     SELECT 1 FROM public.providers p
      WHERE p.id = st.provider_id
        AND p.has_gone_live = TRUE
        AND p.is_active = TRUE
        AND COALESCE(p.booking_mode, '') <> 'external'
        AND EXISTS (SELECT 1 FROM public.services s
                     WHERE s.provider_id = p.id AND s.is_active = TRUE AND s.duration_minutes > 0)
        AND (EXISTS (SELECT 1 FROM public.provider_availability_windows w WHERE w.provider_id = p.id)
             OR EXISTS (SELECT 1 FROM public.provider_availability a WHERE a.provider_id = p.id AND a.is_closed = FALSE))
   );

  FOR r IN
    SELECT p.id AS provider_id, p.user_id
      FROM public.providers p
     WHERE p.has_gone_live = TRUE
       AND p.is_active = TRUE
       -- Link-only providers take their bookings elsewhere.
       AND COALESCE(p.booking_mode, '') <> 'external'
       -- Closed isn't full: nothing can be booked, so there's nothing to fill.
       -- Their state is left as it was.
       AND NOT public.provider_schedule_is_closed(p.id)
       -- Nothing bookable because nothing is set up isn't full either.
       AND EXISTS (
         SELECT 1 FROM public.services s
          WHERE s.provider_id = p.id AND s.is_active = TRUE AND s.duration_minutes > 0
       )
       AND (
         EXISTS (SELECT 1 FROM public.provider_availability_windows w WHERE w.provider_id = p.id)
         OR EXISTS (SELECT 1 FROM public.provider_availability a WHERE a.provider_id = p.id AND a.is_closed = FALSE)
       )
  LOOP
   -- One provider's failure is logged and skipped, not allowed to stop the run.
   BEGIN
    v_last := public.provider_last_bookable_date(r.provider_id);
    v_horizon := CASE WHEN v_last IS NULL THEN 180
                      ELSE LEAST(180, v_last - v_today + 1) END;
    -- Too little left to book to say anything (see the header).
    CONTINUE WHEN v_horizon < 7;

    v_services := ARRAY(SELECT s.id FROM public.services s
                         WHERE s.provider_id = r.provider_id AND s.is_active = TRUE);

    -- The same check as the client profile's Fully Booked: no free slot for
    -- any active service on any date they've opened. The near term first,
    -- which answers it for almost everyone; 180 days only when that's taken.
    v_open := EXISTS (SELECT 1 FROM public.get_services_open_within(v_services, 14) o WHERE o.has_slot)
           OR EXISTS (SELECT 1 FROM public.get_services_open_within(v_services, 180) o WHERE o.has_slot);

    -- No free slot and nothing booked is a blocked-out diary, not a full one.
    v_open := v_open OR NOT EXISTS (
      SELECT 1 FROM public.bookings b
       WHERE b.provider_id = r.provider_id
         AND b.booking_date BETWEEN v_today AND v_today + v_horizon - 1
         AND b.status IN ('pending', 'confirmed', 'in_progress')
    );

    SELECT s.is_full, s.open_since INTO v_was_full, v_open_since
      FROM public.provider_fully_booked_state s
     WHERE s.provider_id = r.provider_id;
    v_has_state := FOUND;

    IF v_open THEN
      INSERT INTO public.provider_fully_booked_state (provider_id, is_full, open_since, checked_at)
      VALUES (r.provider_id, FALSE, now(), now())
      ON CONFLICT (provider_id) DO UPDATE
        SET is_full = FALSE,
            open_since = CASE WHEN provider_fully_booked_state.is_full THEN now()
                              ELSE COALESCE(provider_fully_booked_state.open_since, now()) END,
            checked_at = now();
      CONTINUE;
    END IF;

    -- Full. Nothing is said at night; it's re-checked every hour.
    v_new_fill := FALSE;
    IF v_has_state AND v_was_full THEN
      UPDATE public.provider_fully_booked_state SET checked_at = now() WHERE provider_id = r.provider_id;
    ELSE
      CONTINUE WHEN NOT v_daytime;
      INSERT INTO public.provider_fully_booked_state (provider_id, is_full, open_since, checked_at)
      VALUES (r.provider_id, TRUE, NULL, now())
      ON CONFLICT (provider_id) DO UPDATE SET is_full = TRUE, checked_at = now();
      -- Just filled. One cancellation filled again the same day is the same
      -- fill, and it's said at most once a week.
      v_new_fill := NOT (
        (v_has_state
         AND v_open_since IS NOT NULL
         AND v_open_since > now() - INTERVAL '24 hours'
         AND EXISTS (SELECT 1 FROM public.provider_fully_booked_fills f WHERE f.provider_id = r.provider_id))
        OR EXISTS (SELECT 1 FROM public.provider_fully_booked_fills f
                    WHERE f.provider_id = r.provider_id AND f.filled_at > now() - INTERVAL '7 days')
      );
    END IF;
    CONTINUE WHEN NOT v_daytime;

    -- The last date the check looked at, and the last month end within it.
    v_through := v_today + v_horizon - 1;
    v_month_end := CASE
      WHEN v_through = (date_trunc('month', v_through) + INTERVAL '1 month - 1 day')::date THEN v_through
      ELSE (date_trunc('month', v_through) - INTERVAL '1 day')::date
    END;

    -- A whole month: no space from today to a month end at least 4 weeks off.
    -- Checked on every full run, not only when they first fill, because a
    -- rolling window or a release brings the next month end into range while
    -- they stay full. Once per calendar month.
    IF v_month_end - v_today + 1 >= 28
       AND NOT EXISTS (
         SELECT 1 FROM public.provider_fully_booked_fills f
          WHERE f.provider_id = r.provider_id
            AND f.certificate_month = date_trunc('month', v_month_end)::date
       ) THEN
      INSERT INTO public.provider_fully_booked_fills (provider_id, through_date, certificate_month)
      VALUES (r.provider_id, v_month_end, date_trunc('month', v_month_end)::date)
      RETURNING id INTO v_fill_id;

      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, provider_id, recipient_role, metadata)
      VALUES (
        r.user_id,
        'schedule_fully_booked',
        'You''re Fully Booked!',
        to_char(v_month_end, 'FMMonth') || ' is fully booked. Open My Profile to see your certificate.',
        'medium',
        TRUE,
        r.provider_id,
        'provider',
        jsonb_build_object('kind', 'fully_booked_certificate', 'fill_id', v_fill_id)
      );
      CONTINUE;
    END IF;

    -- A shorter run: a notification, no certificate, no achievement.
    CONTINUE WHEN NOT v_new_fill;

    INSERT INTO public.provider_fully_booked_fills (provider_id, through_date)
    VALUES (r.provider_id, v_through)
    RETURNING id INTO v_fill_id;

    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, provider_id, recipient_role, metadata)
    VALUES (
      r.user_id,
      'schedule_fully_booked',
      'You''re Fully Booked!',
      'Every slot you''ve opened, up to ' || to_char(v_through, 'FMDD FMMonth') || ', is booked.',
      'medium',
      TRUE,
      r.provider_id,
      'provider',
      jsonb_build_object('kind', 'fully_booked', 'fill_id', v_fill_id)
    );
   EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fully booked check failed for provider %: % (%)', r.provider_id, SQLERRM, SQLSTATE;
   END;
  END LOOP;
END;
$function$;

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'provider-fully-booked-alerts'),
  schedule := '40 * * * *'
);

ALTER TABLE public.providers DROP COLUMN IF EXISTS fully_booked_alert_last_sent_at;

-- ── 3. what the app calls ───────────────────────────────────────────────────
-- The newest whole-month fill the provider hasn't seen the certificate for.
CREATE OR REPLACE FUNCTION public.get_my_unseen_fully_booked()
RETURNS TABLE (fill_id uuid, filled_at timestamptz, through_date date)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT f.id, f.filled_at, f.through_date
    FROM public.provider_fully_booked_fills f
    JOIN public.providers p ON p.id = f.provider_id
   WHERE p.user_id = auth.uid()
     AND f.certificate_month IS NOT NULL
     AND f.seen_at IS NULL
   ORDER BY f.filled_at DESC
   LIMIT 1;
$function$;

-- Seen: this fill and any older unseen ones, so one certificate covers them.
CREATE OR REPLACE FUNCTION public.mark_fully_booked_seen(p_fill_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  UPDATE public.provider_fully_booked_fills f
     SET seen_at = now()
    FROM public.providers p, public.provider_fully_booked_fills mine
   WHERE p.id = f.provider_id
     AND p.user_id = auth.uid()
     AND mine.id = p_fill_id
     AND mine.provider_id = f.provider_id
     AND f.certificate_month IS NOT NULL
     AND f.seen_at IS NULL
     AND f.filled_at <= mine.filled_at;
$function$;

-- ── 4. the achievements ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_provider_achievements()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id        uuid := auth.uid();
  v_provider_id    uuid;
  v_has_gone_live  boolean;
  v_is_link_only   boolean;
  v_joined_on      date;
  v_today          date := (now() AT TIME ZONE 'Europe/London')::date;
  v_this_month     date := date_trunc('month', (now() AT TIME ZONE 'Europe/London'))::date;
  v_months_joined  integer;

  v_completed      date[];
  v_five_star      date[];
  v_review_count   integer;
  v_average_rating numeric;
  v_first_tip      date;
  v_returning      date[];
  v_saves          date[];
  v_bell           date[];
  v_photos         date[];
  v_refilled       date[];
  v_busy_best      integer;
  v_busy_day_on    date;

  -- Each whole month that filled (provider_fully_booked_fills with a
  -- certificate_month), and the run of those months, for providers with a
  -- release day. Shorter runs earn nothing.
  v_fills          date[];
  v_fill_months    date[];
  v_release_day    boolean;
  v_fill_run_start date;
  v_fill_run_now   integer;

  -- Runs of calendar months with a completed booking: the longest ever decides
  -- what's earned, the one still going is the progress shown towards the next.
  v_run_start_3    date;
  v_run_start_6    date;
  v_run_start_12   date;
  v_run_now        integer;

  v_paid_pence     bigint;
  v_paid_first_on  date;
  v_paid_1000_on   date;
  v_paid_10000_on  date;

  v_rows           jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Please sign in again.' USING ERRCODE = 'P0001';
  END IF;

  SELECT p.id, COALESCE(p.has_gone_live, false), COALESCE(p.booking_mode = 'external', false),
         (COALESCE(p.claimed_at, p.created_at) AT TIME ZONE 'Europe/London')::date
    INTO v_provider_id, v_has_gone_live, v_is_link_only, v_joined_on
  FROM providers p
  WHERE p.user_id = v_user_id;

  IF v_provider_id IS NULL THEN
    RAISE EXCEPTION 'There is no provider profile on this account.' USING ERRCODE = 'P0001';
  END IF;

  v_months_joined := (extract(year FROM age(v_today, v_joined_on)) * 12
                      + extract(month FROM age(v_today, v_joined_on)))::integer;

  SELECT COALESCE(array_agg(b.booking_date ORDER BY b.booking_date), '{}')
    INTO v_completed
  FROM bookings b
  WHERE b.provider_id = v_provider_id AND b.status = 'completed';

  SELECT COUNT(*)::integer,
         round(avg(r.rating), 2),
         COALESCE(array_agg((r.created_at AT TIME ZONE 'Europe/London')::date ORDER BY r.created_at)
                  FILTER (WHERE r.rating = 5), '{}')
    INTO v_review_count, v_average_rating, v_five_star
  FROM reviews r
  WHERE r.provider_id = v_provider_id;

  SELECT min((COALESCE(t.paid_at, t.created_at) AT TIME ZONE 'Europe/London')::date)
    INTO v_first_tip
  FROM booking_tips t
  WHERE t.provider_id = v_provider_id AND t.status = 'succeeded';

  -- A returning client is someone on their second completed booking. Bookings
  -- under the provider's own account aren't a client coming back.
  SELECT COALESCE(array_agg(c.second_on ORDER BY c.second_on), '{}')
    INTO v_returning
  FROM (
    SELECT (array_agg(b.booking_date ORDER BY b.booking_date))[2] AS second_on
    FROM bookings b
    WHERE b.provider_id = v_provider_id AND b.status = 'completed' AND b.user_id <> v_user_id
    GROUP BY b.user_id
    HAVING COUNT(*) >= 2
  ) c;

  SELECT COALESCE(array_agg((s.created_at AT TIME ZONE 'Europe/London')::date ORDER BY s.created_at), '{}')
    INTO v_saves
  FROM bookmarks s
  WHERE s.provider_id = v_provider_id;

  SELECT COALESCE(array_agg((f.created_at AT TIME ZONE 'Europe/London')::date ORDER BY f.created_at), '{}')
    INTO v_bell
  FROM provider_follows f
  WHERE f.provider_id = v_provider_id AND f.notify_enabled = true;

  SELECT COALESCE(array_agg((i.created_at AT TIME ZONE 'Europe/London')::date ORDER BY i.created_at), '{}')
    INTO v_photos
  FROM portfolio_items i
  WHERE i.provider_id = v_provider_id;

  SELECT COALESCE(array_agg((b.created_at AT TIME ZONE 'Europe/London')::date ORDER BY b.created_at), '{}')
    INTO v_refilled
  FROM bookings b
  WHERE b.provider_id = v_provider_id
    AND b.waitlist_entry_id IS NOT NULL
    AND b.status IN ('confirmed', 'in_progress', 'completed');

  SELECT COALESCE(max(d.n), 0)::integer, min(d.booking_date) FILTER (WHERE d.n >= 5)
    INTO v_busy_best, v_busy_day_on
  FROM (
    SELECT b.booking_date, COUNT(*) AS n
    FROM bookings b
    WHERE b.provider_id = v_provider_id AND b.status = 'completed'
    GROUP BY b.booking_date
  ) d;

  SELECT COALESCE(array_agg((f.filled_at AT TIME ZONE 'Europe/London')::date ORDER BY f.filled_at), '{}'),
         COALESCE(array_agg(f.certificate_month ORDER BY f.certificate_month), '{}')
    INTO v_fills, v_fill_months
  FROM provider_fully_booked_fills f
  WHERE f.provider_id = v_provider_id AND f.certificate_month IS NOT NULL;

  -- CASE, so the cast only runs on one or two digits; 1-31 as everywhere else.
  SELECT COALESCE(CASE WHEN (p.automation_settings->>'scheduleReleaseDay') ~ '^[0-9]{1,2}$'
                       THEN (p.automation_settings->>'scheduleReleaseDay')::int BETWEEN 1 AND 31 END, false)
    INTO v_release_day
  FROM providers p
  WHERE p.id = v_provider_id;

  WITH months AS (
    SELECT DISTINCT month FROM unnest(v_fill_months) AS month
  ), runs AS (
    SELECT min(m.month) AS first_month, max(m.month) AS last_month, COUNT(*)::integer AS length
    FROM (
      SELECT month,
             (extract(year FROM month) * 12 + extract(month FROM month))::integer
               - (row_number() OVER (ORDER BY month))::integer AS run
      FROM months
    ) m
    GROUP BY m.run
  )
  SELECT min(first_month) FILTER (WHERE length >= 3),
         COALESCE(max(length) FILTER (WHERE last_month >= (v_this_month - interval '1 month')::date), 0)
    INTO v_fill_run_start, v_fill_run_now
  FROM runs;

  WITH months AS (
    SELECT DISTINCT date_trunc('month', day)::date AS month FROM unnest(v_completed) AS day
  ), runs AS (
    SELECT min(m.month) AS first_month, max(m.month) AS last_month, COUNT(*)::integer AS length
    FROM (
      SELECT month,
             (extract(year FROM month) * 12 + extract(month FROM month))::integer
               - (row_number() OVER (ORDER BY month))::integer AS run
      FROM months
    ) m
    GROUP BY m.run
  )
  SELECT min(first_month) FILTER (WHERE length >= 3),
         min(first_month) FILTER (WHERE length >= 6),
         min(first_month) FILTER (WHERE length >= 12),
         -- This month not having a booking yet doesn't break a run that reached last month.
         COALESCE(max(length) FILTER (WHERE last_month >= (v_this_month - interval '1 month')::date), 0)
    INTO v_run_start_3, v_run_start_6, v_run_start_12, v_run_now
  FROM runs;

  -- Everything that has actually reached the provider's account: bookings, tips,
  -- and late and no-show fees.
  SELECT COALESCE(sum(p.pence), 0),
         min(p.on_day) FILTER (WHERE p.running > 0),
         min(p.on_day) FILTER (WHERE p.running >= 100000),
         min(p.on_day) FILTER (WHERE p.running >= 1000000)
    INTO v_paid_pence, v_paid_first_on, v_paid_1000_on, v_paid_10000_on
  FROM (
    SELECT t.pence, t.on_day, sum(t.pence) OVER (ORDER BY t.on_day ROWS UNBOUNDED PRECEDING) AS running
    FROM (
      SELECT (x.payout_amount - x.deducted_pence)::bigint AS pence,
             (x.updated_at AT TIME ZONE 'Europe/London')::date AS on_day
      FROM provider_payouts x
      WHERE x.provider_id = v_provider_id AND x.status = 'transferred'
      UNION ALL
      SELECT x.payout_pence::bigint, (x.updated_at AT TIME ZONE 'Europe/London')::date
      FROM booking_tips x
      WHERE x.provider_id = v_provider_id AND x.payout_status = 'transferred' AND x.payout_pence IS NOT NULL
      UNION ALL
      SELECT (x.payout_pence - x.deducted_pence)::bigint, (x.updated_at AT TIME ZONE 'Europe/London')::date
      FROM booking_fee_charges x
      WHERE x.provider_id = v_provider_id AND x.payout_status = 'transferred' AND x.payout_pence IS NOT NULL
    ) t
  ) p;

  -- ord, group, key, link-only providers get it, current, target, met, the day it was met.
  -- Link-only providers take bookings elsewhere, so only what doesn't need an
  -- in-app booking can apply to them.
  SELECT jsonb_agg(jsonb_build_object(
           'key', d.achievement_key, 'group', d.group_key, 'current', d.current_value,
           'target', d.target, 'met', d.met, 'met_on', d.met_on
         ) ORDER BY d.ord)
    INTO v_rows
  FROM (VALUES
    ( 1, 'bookings', 'booking_first', false, cardinality(v_completed)::bigint, 1::bigint, cardinality(v_completed) >= 1, v_completed[1]),
    ( 2, 'bookings', 'bookings_10',   false, cardinality(v_completed), 10, cardinality(v_completed) >= 10, v_completed[10]),
    ( 3, 'bookings', 'bookings_50',   false, cardinality(v_completed), 50, cardinality(v_completed) >= 50, v_completed[50]),
    ( 4, 'bookings', 'bookings_100',  false, cardinality(v_completed), 100, cardinality(v_completed) >= 100, v_completed[100]),
    ( 5, 'bookings', 'bookings_500',  false, cardinality(v_completed), 500, cardinality(v_completed) >= 500, v_completed[500]),

    ( 6, 'client_love', 'five_star_first', false, cardinality(v_five_star), 1, cardinality(v_five_star) >= 1, v_five_star[1]),
    ( 7, 'client_love', 'five_star_10',    false, cardinality(v_five_star), 10, cardinality(v_five_star) >= 10, v_five_star[10]),
    ( 8, 'client_love', 'five_star_50',    false, cardinality(v_five_star), 50, cardinality(v_five_star) >= 50, v_five_star[50]),
    ( 9, 'client_love', 'rating_48',       false, v_review_count, 25, v_review_count >= 25 AND v_average_rating >= 4.8, NULL),
    (10, 'client_love', 'tip_first',       false, (v_first_tip IS NOT NULL)::integer, 1, v_first_tip IS NOT NULL, v_first_tip),
    (11, 'client_love', 'returning_10',    false, cardinality(v_returning), 10, cardinality(v_returning) >= 10, v_returning[10]),
    (12, 'client_love', 'saves_25',        true,  cardinality(v_saves), 25, cardinality(v_saves) >= 25, v_saves[25]),
    (13, 'client_love', 'saves_100',       true,  cardinality(v_saves), 100, cardinality(v_saves) >= 100, v_saves[100]),
    (14, 'client_love', 'bell_10',         true,  cardinality(v_bell), 10, cardinality(v_bell) >= 10, v_bell[10]),
    (15, 'client_love', 'bell_50',         true,  cardinality(v_bell), 50, cardinality(v_bell) >= 50, v_bell[50]),

    (16, 'busy', 'months_3',  false, v_run_now, 3, v_run_start_3 IS NOT NULL,
      (SELECT min(day) FROM unnest(v_completed) AS day WHERE day >= (v_run_start_3 + interval '2 months')::date)),
    (17, 'busy', 'months_6',  false, v_run_now, 6, v_run_start_6 IS NOT NULL,
      (SELECT min(day) FROM unnest(v_completed) AS day WHERE day >= (v_run_start_6 + interval '5 months')::date)),
    (18, 'busy', 'months_12', false, v_run_now, 12, v_run_start_12 IS NOT NULL,
      (SELECT min(day) FROM unnest(v_completed) AS day WHERE day >= (v_run_start_12 + interval '11 months')::date)),
    (19, 'busy', 'busy_day',  false, v_busy_best, 5, v_busy_best >= 5, v_busy_day_on),

    (20, 'earnings', 'payout_first', false, v_paid_pence, 1, v_paid_first_on IS NOT NULL, v_paid_first_on),
    (21, 'earnings', 'paid_1000',    false, v_paid_pence, 100000, v_paid_1000_on IS NOT NULL, v_paid_1000_on),
    (22, 'earnings', 'paid_10000',   false, v_paid_pence, 1000000, v_paid_10000_on IS NOT NULL, v_paid_10000_on),

    (23, 'waitlist', 'waitlist_hero', false, cardinality(v_refilled), 5, cardinality(v_refilled) >= 5, v_refilled[5]),

    (24, 'established', 'live',      true, v_has_gone_live::integer, 1, v_has_gone_live, NULL),
    (25, 'established', 'photos_20', true, cardinality(v_photos), 20, cardinality(v_photos) >= 20, v_photos[20]),
    (26, 'established', 'months_on_6',  true, v_months_joined, 6, v_has_gone_live AND v_months_joined >= 6, (v_joined_on + interval '6 months')::date),
    (27, 'established', 'months_on_12', true, v_months_joined, 12, v_has_gone_live AND v_months_joined >= 12, (v_joined_on + interval '12 months')::date),

    (28, 'fully_booked', 'fully_booked_first', false, cardinality(v_fills), 1, cardinality(v_fills) >= 1, v_fills[1]),
    (29, 'fully_booked', 'fully_booked_3',     false, cardinality(v_fills), 3, cardinality(v_fills) >= 3, v_fills[3]),
    (30, 'fully_booked', 'fully_booked_months_3', false, v_fill_run_now, 3, v_fill_run_start IS NOT NULL,
      (SELECT min((f.filled_at AT TIME ZONE 'Europe/London')::date) FROM provider_fully_booked_fills f
        WHERE f.provider_id = v_provider_id AND f.certificate_month >= (v_fill_run_start + interval '2 months')::date))
  ) AS d(ord, group_key, achievement_key, for_link_only, current_value, target, met, met_on)
  WHERE (d.for_link_only OR NOT v_is_link_only)
    -- Months in a row only means something with a monthly release. Once
    -- earned it stays, even if they later drop the release day.
    AND (d.achievement_key <> 'fully_booked_months_3'
         OR v_release_day
         OR EXISTS (SELECT 1 FROM provider_achievements a
                     WHERE a.provider_id = v_provider_id AND a.achievement_key = d.achievement_key));

  INSERT INTO provider_achievements (provider_id, achievement_key, earned_on)
  SELECT v_provider_id, r.value->>'key', COALESCE((r.value->>'met_on')::date, v_today)
  FROM jsonb_array_elements(v_rows) AS r
  WHERE (r.value->>'met')::boolean
  ON CONFLICT (provider_id, achievement_key) DO NOTHING;

  RETURN jsonb_build_object(
    'average_rating', v_average_rating,
    'achievements', (
      SELECT jsonb_agg(jsonb_build_object(
               'key', r.value->>'key',
               'group', r.value->>'group',
               'current', (r.value->>'current')::bigint,
               'target', (r.value->>'target')::bigint,
               'earned_on', a.earned_on
             ) ORDER BY r.ordinality)
      FROM jsonb_array_elements(v_rows) WITH ORDINALITY AS r
      LEFT JOIN provider_achievements a
        ON a.provider_id = v_provider_id AND a.achievement_key = r.value->>'key'
    )
  );
END;
$function$;

-- ── 5. who may call what ────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.process_provider_fully_booked_alerts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_unseen_fully_booked() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_fully_booked_seen(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_unseen_fully_booked() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_fully_booked_seen(uuid) TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261101200000', 'fully_booked_certificate')
ON CONFLICT (version) DO NOTHING;

COMMIT;
