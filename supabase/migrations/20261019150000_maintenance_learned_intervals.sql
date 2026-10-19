-- Beauty Maintenance, stage 2 of Concept A ("Your rhythm"): learned intervals.
--
-- When a booking completes, work out how often THIS client actually goes for
-- that kind of service, from their own completed bookings, and use it as the
-- reminder's interval when nothing outranks it. Precedence (user decision
-- 2026-10-19):
--   1. an interval the client set themselves (interval_edited) — never touched;
--   2. the provider's own recommended rebooking interval;
--   3. the client's learned habit (this migration);
--   4. our neutral default for the type.
-- Beauty Profile answers still never change an interval.
--
-- The learned value is the client's own data, owner-only like the rest of
-- maintenance_items, never readable by a provider, and removed with the item
-- (and so with the account). Recorded as a legal-list item: no Privacy Policy
-- covers it yet (LEGAL-COMPLIANCE-NOTES.md).
--
-- Depends on 20261018180000_beauty_maintenance.sql and
-- 20261019120000_maintenance_more_types_and_notes.sql. Safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Columns
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.maintenance_items
  -- Where repeat_weeks came from, so the card can say so honestly. Client
  -- inserts take the default: an interval the client typed is theirs.
  ADD COLUMN IF NOT EXISTS interval_source text NOT NULL DEFAULT 'client',
  -- Median days between this client's recent completed bookings of the type,
  -- and how many bookings that came from. NULL when there isn't enough history.
  ADD COLUMN IF NOT EXISTS learned_days int,
  ADD COLUMN IF NOT EXISTS learned_from smallint;

ALTER TABLE public.maintenance_items DROP CONSTRAINT IF EXISTS maintenance_items_interval_source_check;
ALTER TABLE public.maintenance_items ADD CONSTRAINT maintenance_items_interval_source_check
  CHECK (interval_source IN ('client', 'provider', 'learned', 'default'));
ALTER TABLE public.maintenance_items DROP CONSTRAINT IF EXISTS maintenance_items_learned_check;
ALTER TABLE public.maintenance_items ADD CONSTRAINT maintenance_items_learned_check
  CHECK ((learned_days IS NULL) = (learned_from IS NULL)
         AND (learned_days IS NULL OR learned_days BETWEEN 7 AND 400)
         AND (learned_from IS NULL OR learned_from BETWEEN 3 AND 6));

-- Backfill booking-made rows written before this column existed. A client-
-- edited interval is the client's; otherwise an interval that differs from the
-- type default can only have come from the provider. Re-runs touch nothing:
-- only rows still on the column default are considered.
UPDATE public.maintenance_items mi
   SET interval_source = CASE
         WHEN mi.interval_edited THEN 'client'
         WHEN mi.repeat_weeks IS DISTINCT FROM t.default_weeks THEN 'provider'
         ELSE 'default' END
  FROM public.maintenance_service_types t
 WHERE mi.origin = 'booking'
   AND mi.interval_source = 'client'
   AND NOT mi.interval_edited
   AND t.key = mi.type_key;

-- No new grants: SELECT on the table already covers these columns, and none
-- is client-writable. interval_source follows interval_edited in the
-- BEFORE UPDATE trigger below.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Which maintenance type a service is — one place, used twice
-- ─────────────────────────────────────────────────────────────────────────────
-- Exactly the match the completion trigger has always done: within the
-- category, the first type (by sort_order) whose keyword is in the name, else
-- the category's catch-all. AESTHETICS has no catch-all, so injectables and
-- anything unnamed there match nothing.

CREATE OR REPLACE FUNCTION public.maintenance_type_for(p_category text, p_title text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT t.key
    FROM public.maintenance_service_types t
   WHERE t.search_category = p_category
     AND (cardinality(t.keywords) = 0
          OR EXISTS (SELECT 1 FROM unnest(t.keywords) k WHERE lower(p_title) LIKE '%' || k || '%'))
   ORDER BY (cardinality(t.keywords) = 0), t.sort_order
   LIMIT 1;
$function$;
REVOKE ALL ON FUNCTION public.maintenance_type_for(text, text) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The learned gap
-- ─────────────────────────────────────────────────────────────────────────────
-- From the client's last 6 visit days of this type (looking back over their 60
-- most recent completed bookings): the median gap in days, ignoring gaps under
-- a week (group and back-to-back bookings, two services on one trip). Needs at
-- least 3 visits and 2 usable gaps, else nothing.
--
-- "completed" is the only signal there is, and it auto-completes regardless of
-- attendance (LEGAL-COMPLIANCE-NOTES §12), so the card words this as a record
-- of past bookings, never as a fact about the client.

CREATE OR REPLACE FUNCTION public.maintenance_learned_gap(p_user uuid, p_type text)
 RETURNS TABLE (learned_days int, learned_from int)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH candidates AS (
    SELECT bk.booking_date,
           upper(COALESCE(s.service_category, bk.service_category_snapshot)) AS category,
           COALESCE(NULLIF(btrim(bk.service_name_snapshot), ''), s.name)    AS title
      FROM public.bookings bk
      LEFT JOIN public.services s ON s.id = bk.service_id
     WHERE bk.user_id = p_user
       AND bk.status = 'completed'
     ORDER BY bk.booking_date DESC
     LIMIT 60
  ), visits AS (
    SELECT DISTINCT c.booking_date
      FROM candidates c
     WHERE public.maintenance_type_for(c.category, c.title) = p_type
     ORDER BY c.booking_date DESC
     LIMIT 6
  ), gaps AS (
    SELECT v.booking_date - lead(v.booking_date) OVER (ORDER BY v.booking_date DESC) AS gap
      FROM visits v
  )
  SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY g.gap))::int,
         (SELECT count(*) FROM visits)::int
    FROM gaps g
   WHERE g.gap >= 7
  HAVING count(*) >= 2
     AND (SELECT count(*) FROM visits) >= 3
     AND round(percentile_cont(0.5) WITHIN GROUP (ORDER BY g.gap)) <= 400;
$function$;
REVOKE ALL ON FUNCTION public.maintenance_learned_gap(uuid, text) FROM PUBLIC, anon, authenticated;

-- The lookup above runs once per completed booking.
CREATE INDEX IF NOT EXISTS idx_bookings_user_completed_date
  ON public.bookings (user_id, booking_date DESC)
  WHERE status = 'completed';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. A client's own interval change marks the source
-- ─────────────────────────────────────────────────────────────────────────────
-- Live body from 20261018180000 plus the interval_source line.

CREATE OR REPLACE FUNCTION public.maintenance_items_before_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at := now();
  IF NEW.due_on IS DISTINCT FROM OLD.due_on THEN
    NEW.due_push_count := 0;
    NEW.last_pushed_on := NULL;
  END IF;
  -- The client's own interval, the moment they set one, even at the same value.
  IF NEW.interval_edited AND (NEW.repeat_weeks IS DISTINCT FROM OLD.repeat_weeks OR NOT OLD.interval_edited) THEN
    NEW.interval_source := 'client';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.maintenance_items_before_update() FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Completed booking → service item, now with the learned interval
-- ─────────────────────────────────────────────────────────────────────────────
-- Body from 20261018180000 (the only file that defines it). Changes: the type
-- match moved into maintenance_type_for(), the learned gap, the precedence
-- block, and interval_source / learned_* on insert and refresh. The aftercare
-- notice is unchanged. The trigger itself is unchanged and not recreated.

CREATE OR REPLACE FUNCTION public.handle_booking_completed_maintenance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_provider_user uuid;
  v_display_name  text;
  v_nudge         text;
  v_service_name  text;
  v_category      text;
  v_aftercare     text;
  v_title         text;
  v_type_key      text;
  v_type_weeks    int;
  v_weeks         int;
  v_source        text;
  v_learned_days  int;
  v_learned_from  int;
  v_copy          RECORD;
BEGIN
  -- service_id is null on ~half of real completed rows (deleted services):
  -- nothing to rebook, so nothing to remind about.
  IF NEW.status <> 'completed' OR OLD.status IS NOT DISTINCT FROM 'completed'
     OR NEW.service_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.user_id, p.display_name, p.automation_settings->>'rebookingNudgeWeeks'
    INTO v_provider_user, v_display_name, v_nudge
    FROM public.providers p WHERE p.id = NEW.provider_id;

  -- A provider's booking with themselves is not a client relationship.
  IF NOT FOUND OR v_provider_user = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT s.name, upper(COALESCE(s.service_category, NEW.service_category_snapshot)),
         NULLIF(btrim(s.aftercare_notes), '')
    INTO v_service_name, v_category, v_aftercare
    FROM public.services s WHERE s.id = NEW.service_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- The item. Its own exception block: a failure here must never roll back
  -- the booking's completion, nor stop the aftercare notice below.
  BEGIN
    v_title := left(COALESCE(NULLIF(btrim(NEW.service_name_snapshot), ''), v_service_name), 80);

    v_type_key := public.maintenance_type_for(v_category, v_title);
    SELECT t.default_weeks INTO v_type_weeks
      FROM public.maintenance_service_types t WHERE t.key = v_type_key;

    -- Categories with no type (MUA, injectables, consultations) make no item.
    IF v_type_key IS NOT NULL THEN
      -- How often this client actually goes, from their own completed
      -- bookings of this type. Kept on the row even when it isn't the
      -- interval in use, so the card can show it next to the provider's.
      SELECT l.learned_days, l.learned_from INTO v_learned_days, v_learned_from
        FROM public.maintenance_learned_gap(NEW.user_id, v_type_key) l;

      -- Precedence (user decision 2026-10-19): a client-set interval (kept
      -- below), then the provider's own recommendation, then the client's
      -- learned habit, then our neutral default.
      -- Length-checked before the cast, so a huge number can't overflow and
      -- quietly skip the item.
      IF v_nudge ~ '^[0-9]{1,2}$' AND v_nudge::int BETWEEN 1 AND 52 THEN
        v_weeks := v_nudge::int;  v_source := 'provider';
      ELSIF v_learned_days IS NOT NULL THEN
        v_weeks := LEAST(52, GREATEST(1, round(v_learned_days / 7.0)::int));  v_source := 'learned';
      ELSE
        v_weeks := v_type_weeks;  v_source := 'default';
      END IF;

      INSERT INTO public.maintenance_items
        (user_id, kind, origin, title, type_key, provider_id, service_id, provider_name,
         source_booking_id, repeat_weeks, last_done_on, due_on,
         interval_source, learned_days, learned_from)
      VALUES
        (NEW.user_id, 'service', 'booking', v_title, v_type_key, NEW.provider_id, NEW.service_id,
         COALESCE(NULLIF(btrim(v_display_name), ''), NEW.provider_name_snapshot),
         NEW.id, v_weeks, NEW.booking_date, NEW.booking_date + v_weeks * 7,
         v_source, v_learned_days, v_learned_from)
      ON CONFLICT (user_id, provider_id, service_id) WHERE origin = 'booking'
      DO UPDATE SET
        title             = EXCLUDED.title,
        provider_name     = EXCLUDED.provider_name,
        source_booking_id = EXCLUDED.source_booking_id,
        -- A client-edited interval is kept; only the due date resets.
        repeat_weeks      = CASE WHEN public.maintenance_items.interval_edited
                                 THEN public.maintenance_items.repeat_weeks
                                 ELSE EXCLUDED.repeat_weeks END,
        interval_source   = CASE WHEN public.maintenance_items.interval_edited
                                 THEN 'client' ELSE EXCLUDED.interval_source END,
        learned_days      = EXCLUDED.learned_days,
        learned_from      = EXCLUDED.learned_from,
        last_done_on      = EXCLUDED.last_done_on,
        due_on            = EXCLUDED.last_done_on + 7 *
                            (CASE WHEN public.maintenance_items.interval_edited
                                  THEN public.maintenance_items.repeat_weeks
                                  ELSE EXCLUDED.repeat_weeks END)
      -- An older booking completing late never moves the item backwards.
      WHERE public.maintenance_items.last_done_on IS NULL
         OR public.maintenance_items.last_done_on <= EXCLUDED.last_done_on;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_booking_completed_maintenance item for booking %: %', NEW.id, SQLERRM;
  END;

  -- One aftercare notice, only when the provider wrote notes, only for a
  -- client who opted in to maintenance reminders. The text itself is shown
  -- in-app, quoted and credited; the notice is generic.
  IF v_aftercare IS NOT NULL THEN
    BEGIN
      IF EXISTS (
           SELECT 1 FROM public.users u
            WHERE u.id = NEW.user_id
              AND u.deletion_requested_at IS NULL
              AND COALESCE(u.notification_preferences->>'maintenanceReminders', 'false') = 'true')
         -- A group booking completes one row per guest for the same service:
         -- one notice, not one per row.
         AND NOT EXISTS (
           SELECT 1 FROM public.notifications n
            WHERE n.user_id = NEW.user_id
              AND n.type    = 'aftercare_available'
              AND n.metadata->>'service_id' = NEW.service_id::text
              AND n.created_at > now() - INTERVAL '1 day')
      THEN
        SELECT * INTO v_copy FROM public.maintenance_notification_copy('aftercare_available');
        INSERT INTO public.notifications
          (user_id, type, title, message, priority, is_actionable, booking_id, provider_id,
           recipient_role, metadata)
        VALUES
          (NEW.user_id, 'aftercare_available', v_copy.title, v_copy.message, 'low', TRUE,
           NEW.id, NEW.provider_id, 'client',
           jsonb_build_object('kind', 'aftercare_available', 'service_id', NEW.service_id));
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'handle_booking_completed_maintenance aftercare for booking %: %', NEW.id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.handle_booking_completed_maintenance() FROM PUBLIC, anon, authenticated;
