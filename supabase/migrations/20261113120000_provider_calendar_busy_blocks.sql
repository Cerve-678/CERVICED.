-- Calendar sync for full providers: busy times in the provider's own phone
-- calendar stop clients booking those times on CERVICED.
--
-- Before: a provider still running another booking system (Fresha, Booksy,
-- Acuity, DMs) had no way to tell CERVICED a time was already taken there, so
-- clients could book it and the provider got double-booked. Link-only
-- providers could already SEE their phone calendar on Home, but it never left
-- the phone and blocked nothing.
--
-- Now:
-- * provider_calendar_busy_blocks: one row per busy stretch per UK day, start
--   and end only. No title, location, notes or attendee is ever sent, because
--   those usually name other people's clients. Server-only; read and written
--   through the functions below.
-- * provider_calendar_sync: when the provider last synced, and how far ahead.
-- * sync_my_calendar_busy_blocks(from, to, blocks): the app replaces the
--   caller's own blocks with what their phone calendar says now.
-- * clear_my_calendar_busy_blocks(): disconnect; every block goes.
-- * get_my_calendar_sync_status(): last synced, how many, how far ahead.
-- * get_provider_busy_spans() also returns these blocks, so every slot picker
--   (booking sheets, reschedule, waitlist, Becca) stops offering them with no
--   app change.
-- * enforce_booking_bookability() refuses a new booking (or a move) into a
--   busy block, with the same message as a taken slot. A provider's own
--   bookings are exempt, and so is any booking that keeps its time.
--
-- The app only syncs while the provider opens it, so the blocks are as fresh
-- as their last visit; the settings card says when that was.
-- Redefined from live with md5 guards, per supabase/MIGRATION_OWNER.md.

BEGIN;

DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.get_provider_busy_spans(uuid, date, date)'::regprocedure)) <> 'ae1ca14bee17d2c65034af6354d8dc83' THEN
    RAISE EXCEPTION 'get_provider_busy_spans changed live since this migration was written; rebuild it from live';
  END IF;
  IF md5(pg_get_functiondef('public.enforce_booking_bookability()'::regprocedure)) <> 'f5bc8a99bcf5b0481f764fdf2abe0fa2' THEN
    RAISE EXCEPTION 'enforce_booking_bookability changed live since this migration was written; rebuild it from live';
  END IF;
END;
$guard$;

-- ── 1. the blocks ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.provider_calendar_busy_blocks (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  -- UK wall-clock day and times, the same way bookings store theirs.
  block_date  date NOT NULL,
  start_time  time NOT NULL,
  end_time    time NOT NULL,
  CONSTRAINT provider_calendar_busy_blocks_order CHECK (start_time < end_time)
);
CREATE INDEX IF NOT EXISTS provider_calendar_busy_blocks_provider_date
  ON public.provider_calendar_busy_blocks (provider_id, block_date);
ALTER TABLE public.provider_calendar_busy_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provider_calendar_busy_blocks FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.provider_calendar_sync (
  provider_id    uuid PRIMARY KEY REFERENCES public.providers(id) ON DELETE CASCADE,
  synced_at      timestamptz NOT NULL DEFAULT now(),
  synced_through date NOT NULL,
  block_count    integer NOT NULL DEFAULT 0
);
ALTER TABLE public.provider_calendar_sync ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provider_calendar_sync FROM PUBLIC, anon, authenticated;

-- ── 2. the app's three calls ────────────────────────────────────────────────
-- The caller's provider row, chosen the way the app chooses it
-- (getProviderClientele): the active one first, then the oldest.
CREATE OR REPLACE FUNCTION public.my_calendar_sync_provider_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p.id FROM public.providers p
   WHERE p.user_id = auth.uid()
   ORDER BY p.is_active DESC, p.created_at ASC
   LIMIT 1;
$function$;
REVOKE ALL ON FUNCTION public.my_calendar_sync_provider_id() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sync_my_calendar_busy_blocks(p_from date, p_to date, p_blocks jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_provider uuid;
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Please sign in again';
  END IF;
  v_provider := public.my_calendar_sync_provider_id();
  IF v_provider IS NULL THEN
    RAISE EXCEPTION 'Only a business account can sync a calendar';
  END IF;
  -- From yesterday at the earliest (a phone a timezone behind), at most 400
  -- days ahead, at most 3000 blocks.
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from
     OR p_from < CURRENT_DATE - 1 OR p_to > CURRENT_DATE + 400 THEN
    RAISE EXCEPTION 'Calendar sync dates are not valid';
  END IF;
  IF p_blocks IS NULL OR jsonb_typeof(p_blocks) <> 'array' OR jsonb_array_length(p_blocks) > 3000 THEN
    RAISE EXCEPTION 'Calendar sync sent too many busy times';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(p_blocks) e
           CROSS JOIN LATERAL (
             SELECT (e->>'date')::date AS block_date,
                    (e->>'start')::time AS start_time,
                    (e->>'end')::time AS end_time
           ) r
     WHERE r.block_date IS NULL OR r.start_time IS NULL OR r.end_time IS NULL
        OR r.start_time >= r.end_time
        OR r.block_date < p_from OR r.block_date > p_to
  ) THEN
    RAISE EXCEPTION 'Calendar sync sent a busy time that is not valid';
  END IF;

  -- A full replace: what the phone says now is the whole truth, so a
  -- cancelled appointment there frees the time here.
  DELETE FROM public.provider_calendar_busy_blocks WHERE provider_id = v_provider;
  INSERT INTO public.provider_calendar_busy_blocks (provider_id, block_date, start_time, end_time)
  SELECT DISTINCT v_provider, (e->>'date')::date, (e->>'start')::time, (e->>'end')::time
    FROM jsonb_array_elements(p_blocks) e;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.provider_calendar_sync (provider_id, synced_at, synced_through, block_count)
  VALUES (v_provider, now(), p_to, v_count)
  ON CONFLICT (provider_id) DO UPDATE
    SET synced_at = EXCLUDED.synced_at,
        synced_through = EXCLUDED.synced_through,
        block_count = EXCLUDED.block_count;

  RETURN jsonb_build_object('provider_id', v_provider, 'block_count', v_count);
END;
$function$;
REVOKE ALL ON FUNCTION public.sync_my_calendar_busy_blocks(date, date, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_my_calendar_busy_blocks(date, date, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.clear_my_calendar_busy_blocks()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_provider uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Please sign in again';
  END IF;
  v_provider := public.my_calendar_sync_provider_id();
  IF v_provider IS NULL THEN
    RETURN NULL;
  END IF;
  DELETE FROM public.provider_calendar_busy_blocks WHERE provider_id = v_provider;
  DELETE FROM public.provider_calendar_sync WHERE provider_id = v_provider;
  RETURN v_provider;
END;
$function$;
REVOKE ALL ON FUNCTION public.clear_my_calendar_busy_blocks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_my_calendar_busy_blocks() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_calendar_sync_status()
RETURNS TABLE(synced_at timestamptz, synced_through date, block_count integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT s.synced_at, s.synced_through, s.block_count
    FROM public.provider_calendar_sync s
   WHERE s.provider_id = public.my_calendar_sync_provider_id();
$function$;
REVOKE ALL ON FUNCTION public.get_my_calendar_sync_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_calendar_sync_status() TO authenticated;

-- ── 3. clients never see a busy time as free ───────────────────────────────
CREATE OR REPLACE FUNCTION public.get_provider_busy_spans(p_provider_id uuid, p_from_date date, p_to_date date)
 RETURNS TABLE(booking_date date, busy_start time without time zone, busy_end time without time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    b.booking_date,
    -- Clamped to the booking's own calendar day. A buffer can push
    -- effective_start before midnight or effective_end past it; extracting
    -- ::time from those would wrap (e.g. 23:50 → 01:05) and produce an
    -- inverted span that silently blocks nothing, since callers compare
    -- start < end within one day. Clamping keeps the span well-formed; the
    -- few buffer minutes that spill into the neighbouring day are not
    -- represented, which the DB-level bookings_no_overlap constraint (which
    -- compares real timestamps, not times) still catches on write.
    --
    -- COALESCE also falls back to raw times for any row predating the
    -- effective_start/effective_end backfill (prevent_overlapping_bookings.sql).
    GREATEST(
      COALESCE(b.effective_start, b.booking_date + b.booking_time),
      b.booking_date::timestamp
    )::time AS busy_start,
    LEAST(
      COALESCE(
        b.effective_end,
        b.booking_date + COALESCE(b.end_time, b.booking_time + INTERVAL '1 hour')
      ),
      b.booking_date::timestamp + INTERVAL '1 day' - INTERVAL '1 second'
    )::time AS busy_end
  FROM public.bookings b
  WHERE b.provider_id = p_provider_id
    AND b.booking_date BETWEEN p_from_date AND p_to_date
    -- Same set the app's own conflict checks use: anything not cancelled or
    -- no-showed still occupies the slot. 'on_hold' included so a cart hold
    -- mid-checkout isn't offered to someone else.
    AND b.status IN ('pending', 'confirmed', 'in_progress', 'on_hold')
    -- A lapsed hold is not a busy slot. Between expiry and the next sweep the
    -- row still says on_hold, and without this the slot stays invisible to
    -- the very person the cascade just offered it to.
    --
    -- NULL hold_expires_at still blocks, deliberately. Reschedule holds carry
    -- no clock of their own -- they end when the reschedule request they
    -- belong to ends -- so a NULL here means "no deadline", not "expired".
    AND (b.status <> 'on_hold' OR b.hold_expires_at IS NULL OR b.hold_expires_at > NOW())
    -- ...and a CART hold the caller placed themself is not a busy slot FOR
    -- THEM. It still blocks everyone else (this exception is scoped to
    -- auth.uid()), but the client who is holding it mid-checkout must not be
    -- told their own time is taken when they go back to change it. The
    -- explicit auth.uid() IS NOT NULL guard keeps an anonymous caller (where
    -- auth.uid() is NULL) from having rows silently dropped by NULL
    -- propagation through NOT.
    AND NOT (
      b.status = 'on_hold'
      AND b.hold_batch_id IS NOT NULL
      AND auth.uid() IS NOT NULL
      AND b.user_id = auth.uid()
    )
    -- Never expose a provider who isn't publicly listed — EXCEPT to that
    -- provider themself. Without the owner branch, a provider who hasn't
    -- gone live yet would get an empty result for their OWN schedule, so
    -- their profile card and the reschedule slot picker would show a fully
    -- open diary while real bookings sat in it. The owner branch grants
    -- nothing a provider can't already read directly via
    -- bookings_provider_read; it only stops the has_gone_live filter from
    -- hiding their own data from them.
    AND EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = b.provider_id
        AND (
          (p.has_gone_live = TRUE AND p.is_active = TRUE)
          OR p.user_id = auth.uid()
        )
    )

  UNION ALL

  -- Times the provider is busy in their own phone calendar (synced by the
  -- app, start and end only: no title, no client). Same listing rule as
  -- bookings: only a live provider's, or the provider's own.
  SELECT cb.block_date, cb.start_time, cb.end_time
  FROM public.provider_calendar_busy_blocks cb
  WHERE cb.provider_id = p_provider_id
    AND cb.block_date BETWEEN p_from_date AND p_to_date
    AND EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = cb.provider_id
        AND (
          (p.has_gone_live = TRUE AND p.is_active = TRUE)
          OR p.user_id = auth.uid()
        )
    )
  -- Ordered by position: with UNION ALL the ORDER BY applies to the combined
  -- result, and position never collides with the RETURNS TABLE column names
  -- (the 42702 that broke claim_cart_booking_slots).
  ORDER BY 1, 2, 3;
$function$;

-- ── 4. and the database refuses a booking into one ──────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_booking_bookability()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_last_bookable DATE;
  v_notice_hours INTEGER;
  v_has_override BOOLEAN;
  v_fits_window BOOLEAN;
  v_legacy_open TIME;
  v_legacy_close TIME;
  v_legacy_closed BOOLEAN;
  v_bypass_hours BOOLEAN;
  v_bypass_policy BOOLEAN;
  -- Emergency-request opt-ins, read once alongside the settings above.
  v_allow_hours BOOLEAN;
  v_allow_blocked BOOLEAN;
  v_allow_notice BOOLEAN;
  v_allow_window BOOLEAN;
  v_emergency BOOLEAN;
  v_day_is_shut BOOLEAN := FALSE;
  v_latest_start TIME;
BEGIN
  SELECT min_booking_notice_hrs,
         COALESCE(allow_out_of_hours_requests, false),
         COALESCE(allow_blocked_date_requests, false),
         COALESCE(allow_short_notice_requests, false),
         COALESCE(allow_beyond_window_requests, false)
    INTO v_notice_hours,
         v_allow_hours, v_allow_blocked, v_allow_notice, v_allow_window
    FROM public.providers WHERE id = NEW.provider_id;

  v_emergency := COALESCE(NEW.is_emergency_request, false);

  IF NEW.booking_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Booking date cannot be in the past';
  END IF;

  -- Always enforced, emergency or not, bypass or not: a same-day booking for
  -- a time that has already elapsed (or is exactly now) cannot be kept by
  -- anyone, provider override or not.
  IF NEW.booking_date = CURRENT_DATE AND NEW.booking_time <= LOCALTIME THEN
    RAISE EXCEPTION 'That time has already passed today';
  END IF;

  -- Provider-initiated manual booking: skips the booking-window / minimum-
  -- notice / blocked-date POLICY checks below outright, independently of any
  -- client-facing opt-in. Set exclusively by provider_create_manual_booking()
  -- via set_config('cerviced.bypass_scheduling_policy', 'on', true);
  -- transaction-local, cannot leak to any other insert.
  v_bypass_policy := COALESCE(current_setting('cerviced.bypass_scheduling_policy', true), 'off') = 'on';

  IF NOT v_bypass_policy THEN
    -- Closed by hand: no NEW bookings. Holds for a reschedule pass
    -- (reschedule_hold_for), and an UPDATE moves a booking the provider
    -- agreed to through confirm_reschedule_own_booking, so a move carries on.
    -- The provider adding their own client is exempt: inviting from their
    -- waitlist by hand is a plain insert under bookings_provider_insert. The
    -- automatic invite can also run as the provider, when they cancel, so
    -- invite_next_waitlist_entry has its own check.
    IF TG_OP = 'INSERT'
       AND NEW.reschedule_hold_for IS NULL
       AND public.provider_schedule_is_closed(NEW.provider_id)
       AND NOT EXISTS (
         SELECT 1 FROM public.providers own
          WHERE own.id = NEW.provider_id AND own.user_id = auth.uid()
       ) THEN
      RAISE EXCEPTION 'This provider is not taking bookings right now';
    END IF;

    -- The rolling window, or what a monthly release has opened so far — see
    -- provider_last_bookable_date. NULL = no limit.
    --
    -- Not re-checked when an existing booking keeps its date and provider:
    -- a time-only change (or an end_time fix) to a booking that was valid
    -- when made must not fail just because the horizon has since moved — a
    -- provider switching from a 60-day window to a monthly release would
    -- otherwise freeze every booking they hold past the end of the month.
    v_last_bookable := public.provider_last_bookable_date(NEW.provider_id);
    IF v_last_bookable IS NOT NULL
       AND NOT (TG_OP = 'UPDATE'
                AND NEW.booking_date = OLD.booking_date
                AND NEW.provider_id = OLD.provider_id)
       AND NEW.booking_date > v_last_bookable
       AND NOT (v_emergency AND v_allow_window) THEN
      RAISE EXCEPTION 'Booking is outside this provider''s booking window';
    END IF;

    IF COALESCE(v_notice_hours, 0) > 0
       AND (NEW.booking_date + NEW.booking_time) < now() + make_interval(hours => v_notice_hours)
       AND NOT (v_emergency AND v_allow_notice) THEN
      RAISE EXCEPTION 'This appointment does not meet the provider''s minimum notice';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.provider_blocked_dates
      WHERE provider_id = NEW.provider_id AND blocked_date = NEW.booking_date
    ) THEN
      IF NOT (v_emergency AND v_allow_blocked) THEN
        RAISE EXCEPTION 'Provider is unavailable on this date';
      END IF;
      -- Accepted as an emergency request, but the day has no hours of its
      -- own, so the envelope check below is what bounds the time of day.
      v_day_is_shut := TRUE;
    END IF;
  END IF;

  -- Provider-initiated squeeze-in: skips ONLY the working-hours fit check
  -- below. Set exclusively by provider_create_manual_booking() via
  -- set_config('cerviced.bypass_working_hours', 'on', true) immediately
  -- before its INSERT; transaction-local, cannot leak to any other insert.
  v_bypass_hours := COALESCE(current_setting('cerviced.bypass_working_hours', true), 'off') = 'on';

  IF NOT v_bypass_hours THEN
    -- The service's own latest start (services.latest_start_time). Hard
    -- stop: no emergency opt-in reaches past it, only the provider's own
    -- squeeze-in (the bypass above). Checked on a new booking and on a move
    -- to a new date, time or service, never on an UPDATE that leaves all
    -- three alone, so a booking made before the provider set the limit isn't
    -- frozen by it. Clients can't insert bookings directly (only the
    -- provider's own insert policy exists; checkout goes through RPCs that
    -- always set service_id), so a NULL service_id is a provider's own or
    -- legacy row and is left alone.
    IF NEW.service_id IS NOT NULL
       AND (TG_OP = 'INSERT'
            OR NEW.booking_date IS DISTINCT FROM OLD.booking_date
            OR NEW.booking_time IS DISTINCT FROM OLD.booking_time
            OR NEW.service_id IS DISTINCT FROM OLD.service_id) THEN
      SELECT s.latest_start_time INTO v_latest_start
        FROM public.services s
       WHERE s.id = NEW.service_id AND s.provider_id = NEW.provider_id;
      IF v_latest_start IS NOT NULL AND NEW.booking_time > v_latest_start THEN
        RAISE EXCEPTION 'This service has to start by %',
          lower(to_char(DATE '2000-01-01' + v_latest_start, 'FMHH12:MIAM'));
      END IF;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.provider_availability_overrides
       WHERE provider_id = NEW.provider_id AND availability_date = NEW.booking_date
    ) INTO v_has_override;

    -- A one-off "closed" override is the same kind of statement as a blocked
    -- date — "I am not working that day" — so it answers to the same opt-in,
    -- not to the out-of-hours one.
    IF v_has_override AND EXISTS (
      SELECT 1 FROM public.provider_availability_overrides
       WHERE provider_id = NEW.provider_id AND availability_date = NEW.booking_date AND is_closed
    ) THEN
      IF NOT (v_emergency AND v_allow_blocked) THEN
        RAISE EXCEPTION 'Provider is unavailable on this date';
      END IF;
      v_day_is_shut := TRUE;
    END IF;

    IF v_day_is_shut THEN
      v_fits_window := FALSE;
    ELSE
      SELECT EXISTS (
        SELECT 1 FROM public.provider_availability_overrides
         WHERE provider_id = NEW.provider_id AND availability_date = NEW.booking_date
           AND is_closed = FALSE AND NEW.booking_time >= start_time AND NEW.end_time <= end_time
      ) INTO v_fits_window;

      IF NOT v_has_override THEN
        SELECT EXISTS (
          SELECT 1 FROM public.provider_availability_windows
           WHERE provider_id = NEW.provider_id
             AND day_of_week = EXTRACT(DOW FROM NEW.booking_date)
             AND NEW.booking_time >= start_time AND NEW.end_time <= end_time
        ) INTO v_fits_window;

        -- Providers not yet migrated retain their original single daily period.
        IF NOT v_fits_window AND NOT EXISTS (
          SELECT 1 FROM public.provider_availability_windows WHERE provider_id = NEW.provider_id
        ) THEN
          SELECT open_time, close_time, is_closed INTO v_legacy_open, v_legacy_close, v_legacy_closed
          FROM public.provider_availability
          WHERE provider_id = NEW.provider_id AND day_of_week = EXTRACT(DOW FROM NEW.booking_date);
          v_fits_window := FOUND AND NOT COALESCE(v_legacy_closed, TRUE)
            AND NEW.booking_time >= v_legacy_open AND NEW.end_time <= v_legacy_close;
        END IF;
      END IF;
    END IF;

    -- Outside the working hours. Allowed only as an emergency request, and
    -- only under the opt-in that matches WHY the day doesn't fit: a shut day
    -- was already authorised by the blocked-date opt-in above, anything else
    -- needs the out-of-hours one. No further bound on the time of day — see
    -- this migration's header.
    IF NOT COALESCE(v_fits_window, FALSE)
       AND (NOT v_emergency OR NOT (v_allow_hours OR (v_day_is_shut AND v_allow_blocked))) THEN
      RAISE EXCEPTION 'This appointment is outside the provider''s working hours';
    END IF;
  END IF;

  -- Busy in the provider's own calendar (provider_calendar_busy_blocks,
  -- synced from the calendars they chose on their phone). Same answer as a
  -- taken slot, but only when a booking is made or moved to a new time: a
  -- busy time synced later never freezes a booking already made. Skipped for
  -- the provider's own bookings (their manual add, or their own insert), since
  -- the calendar entry may be that very appointment.
  IF NOT v_bypass_policy
     AND (TG_OP = 'INSERT'
          OR NEW.booking_date IS DISTINCT FROM OLD.booking_date
          OR NEW.booking_time IS DISTINCT FROM OLD.booking_time
          OR NEW.end_time IS DISTINCT FROM OLD.end_time)
     AND NOT EXISTS (
       SELECT 1 FROM public.providers own
        WHERE own.id = NEW.provider_id AND own.user_id = auth.uid()
     )
     AND EXISTS (
       SELECT 1 FROM public.provider_calendar_busy_blocks cb
        WHERE cb.provider_id = NEW.provider_id AND cb.block_date = NEW.booking_date
          AND NEW.booking_time < cb.end_time
          AND COALESCE(NEW.end_time, NEW.booking_time + INTERVAL '1 hour') > cb.start_time
     ) THEN
    RAISE EXCEPTION 'That time is no longer available';
  END IF;

  -- A taken slot stays taken regardless of anyone's intent — no opt-in, no
  -- override, no emergency reaches past this.
  IF EXISTS (
    SELECT 1 FROM public.bookings b
     WHERE b.provider_id = NEW.provider_id AND b.booking_date = NEW.booking_date
       AND b.status IN ('pending', 'confirmed', 'in_progress', 'on_hold')
       AND b.id IS DISTINCT FROM NEW.id
       AND NEW.booking_time < b.end_time AND NEW.end_time > b.booking_time
  ) THEN RAISE EXCEPTION 'That time is no longer available'; END IF;
  RETURN NEW;
END;
$function$;

COMMIT;
