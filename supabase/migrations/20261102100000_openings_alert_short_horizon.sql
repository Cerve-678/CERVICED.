-- "Has space again" no longer fires falsely after a short or blocked-out diary.
--
-- process_follow_openings_alerts tells bell followers when a fully booked
-- provider gets space. Two ways it could call a provider fully booked when
-- they weren't, and then announce space that was always there:
--   • fewer than 7 days left to book: a release-day provider just before next
--     month opens, a tiny booking window, or the hour after midnight on the 1st
--     in summer time, when the UTC month hasn't turned and the horizon is 0;
--   • every date blocked with nothing booked (a holiday).
-- Both are now skipped with the state left as it was. The same rules as the
-- Fully Booked check in 20261101200000.
--
-- Redefines from its live definition (2026-11-02), with an md5 guard.
-- Frontier at authoring: live 20261101190000; 20261101200000 (Fully Booked
-- certificate, PR #219) is unapplied and redefines other functions, not this
-- one. Apply that first so the numbers stay in order. Re-check both before
-- applying.

BEGIN;

DO $guard$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(pg_get_functiondef('public.process_follow_openings_alerts()'::regprocedure)) INTO v_md5;
  IF v_md5 <> 'da872c9f3876c4546dfebbfd7c7c40e6' THEN
    RAISE EXCEPTION 'process_follow_openings_alerts changed since this migration was written (%): rebuild from live', v_md5;
  END IF;
END;
$guard$;

CREATE OR REPLACE FUNCTION public.process_follow_openings_alerts()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r RECORD;
  v_open boolean;
  v_was_full boolean;
  v_last_alert timestamptz;
  v_local_hour int := EXTRACT(HOUR FROM (now() AT TIME ZONE 'Europe/London'))::int;
  v_daytime boolean := v_local_hour BETWEEN 8 AND 20;
  v_today date := (now() AT TIME ZONE 'Europe/London')::date;
  v_last date;
  v_horizon integer;
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
       -- Closed isn't full. Leave their state as it was, so reopening is
       -- compared with how they really were before closing.
       AND NOT public.provider_schedule_is_closed(p.id)
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
    -- Under a week left to book says nothing about being full. A release-day
    -- provider just before next month opens has a day or two, and a finished
    -- day has no slots; for an hour after midnight on the 1st in summer time
    -- the UTC month hasn't turned yet and they have none at all. Read as full,
    -- the next look would announce "has space again" for no reason. Their
    -- state is left as it was.
    v_last := public.provider_last_bookable_date(r.provider_id);
    v_horizon := CASE WHEN v_last IS NULL THEN 180 ELSE LEAST(180, v_last - v_today + 1) END;
    CONTINUE WHEN v_horizon < 7;

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

    -- No free slot and nothing booked is a blocked-out diary (a holiday), not a
    -- full one. Skipped with the state left alone: counting it as full would
    -- make the end of the holiday read as "has space again", and counting it
    -- as open would make a full provider's holiday read the same way.
    CONTINUE WHEN NOT v_open AND NOT EXISTS (
      SELECT 1 FROM public.bookings b
       WHERE b.provider_id = r.provider_id
         AND b.booking_date BETWEEN v_today AND v_today + v_horizon - 1
         AND b.status IN ('pending', 'confirmed', 'in_progress')
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
$function$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261102100000', 'openings_alert_short_horizon')
ON CONFLICT (version) DO NOTHING;

COMMIT;
