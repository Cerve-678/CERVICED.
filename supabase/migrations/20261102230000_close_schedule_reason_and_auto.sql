-- Close Schedule gains an optional reason, which the provider can choose to tell
-- clients, and an optional automatic close when a provider with no waitlist fills
-- up. automation_settings.autoCloseWhenFull is off unless they turn it on, so
-- applying this closes nobody.
BEGIN;

DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.close_my_schedule'::regproc)) <> '002018146fdd88d45cdc8986529bb6b0'
     OR md5(pg_get_functiondef('public.get_my_schedule_closure'::regproc)) <> '9ff6f0ee303a1bd72e41c46e3b9cd979'
     OR md5(pg_get_functiondef('public.process_provider_fully_booked_alerts'::regproc)) <> '68aac6f0dbc1f16f90ea7160d266c9f8' THEN
    RAISE EXCEPTION 'A function this migration rebuilds changed live; rebase it first';
  END IF;
END
$guard$;

ALTER TABLE public.provider_schedule_closures
  ADD COLUMN reason text CHECK (reason IN ('holiday', 'time_off', 'training', 'fully_booked')),
  ADD COLUMN show_reason boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN auto_closed boolean NOT NULL DEFAULT FALSE;

DROP FUNCTION public.close_my_schedule(date);
CREATE FUNCTION public.close_my_schedule(
  p_reopens_on date DEFAULT NULL::date,
  p_reason text DEFAULT NULL,
  p_show_reason boolean DEFAULT FALSE
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_provider_id uuid;
BEGIN
  SELECT id INTO v_provider_id
    FROM public.providers
   WHERE user_id = auth.uid()
   ORDER BY is_active DESC, created_at ASC
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Provider profile not found';
  END IF;
  IF p_reopens_on IS NOT NULL AND p_reopens_on <= (now() AT TIME ZONE 'Europe/London')::date THEN
    RAISE EXCEPTION 'Choose a reopening date after today';
  END IF;

  INSERT INTO public.provider_schedule_closures
    (provider_id, closed_at, reopens_on, reason, show_reason, auto_closed)
  VALUES (v_provider_id, now(), p_reopens_on, p_reason, p_reason IS NOT NULL AND p_show_reason, FALSE)
  ON CONFLICT (provider_id) DO UPDATE
    SET closed_at = now(), reopens_on = EXCLUDED.reopens_on, reason = EXCLUDED.reason,
        show_reason = EXCLUDED.show_reason, auto_closed = FALSE;
END;
$function$;
REVOKE ALL ON FUNCTION public.close_my_schedule(date, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_my_schedule(date, text, boolean) TO authenticated, service_role;

DROP FUNCTION public.get_my_schedule_closure();
CREATE FUNCTION public.get_my_schedule_closure()
 RETURNS TABLE(is_closed boolean, reopens_on date, next_release_at timestamp with time zone,
               reason text, show_reason boolean, auto_closed boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.provider_schedule_is_closed(c.provider_id),
         c.reopens_on,
         public.provider_next_release_after(c.provider_id, c.closed_at),
         c.reason,
         c.show_reason,
         c.auto_closed
    FROM public.provider_schedule_closures c
    JOIN public.providers p ON p.id = c.provider_id
   WHERE p.user_id = auth.uid();
$function$;
REVOKE ALL ON FUNCTION public.get_my_schedule_closure() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_schedule_closure() TO authenticated, service_role;

-- All a client learns: the reason, only if the provider chose to say, only while closed.
CREATE FUNCTION public.get_provider_closure_reason(p_provider_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT c.reason
    FROM public.provider_schedule_closures c
   WHERE c.provider_id = p_provider_id
     AND c.show_reason
     AND public.provider_schedule_is_closed(c.provider_id);
$function$;
REVOKE ALL ON FUNCTION public.get_provider_closure_reason(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_provider_closure_reason(uuid) TO anon, authenticated, service_role;

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
    SELECT p.id AS provider_id, p.user_id,
           COALESCE(p.automation_settings->>'autoCloseWhenFull', '') = 'true' AS auto_close,
           COALESCE(p.automation_settings->>'waitlistEnabled', '') = 'false' AS waitlist_off
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

    -- They asked for their schedule to close when it fills. Only at the moment
    -- of filling: a provider who reopens by hand while still full stays open,
    -- because the state above already says full.
    IF NOT (v_has_state AND v_was_full) AND r.auto_close AND r.waitlist_off THEN
      INSERT INTO public.provider_schedule_closures
        (provider_id, closed_at, reopens_on, reason, show_reason, auto_closed)
      VALUES (r.provider_id, now(), NULL, 'fully_booked', FALSE, TRUE)
      ON CONFLICT (provider_id) DO UPDATE
        SET closed_at = now(), reopens_on = NULL, reason = 'fully_booked',
            show_reason = FALSE, auto_closed = TRUE;

      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, provider_id, recipient_role, metadata)
      VALUES (
        r.user_id,
        'schedule_fully_booked',
        'Your schedule has closed',
        'You''re fully booked, so new bookings are off, including any slot that frees up. Reopen it from your schedule whenever you like.',
        'medium',
        TRUE,
        r.provider_id,
        'provider',
        jsonb_build_object('kind', 'schedule_auto_closed')
      );
    END IF;

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

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261102230000', 'close_schedule_reason_and_auto')
ON CONFLICT DO NOTHING;

COMMIT;
