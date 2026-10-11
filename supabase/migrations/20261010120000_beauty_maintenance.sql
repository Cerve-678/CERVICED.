-- Beauty Maintenance (client hat)
--
-- Frontier at authoring: 20261003120000 (max(version) in
-- supabase_migrations.schema_migrations, read live 2026-10-10).
-- NOT APPLIED. Written for the user to approve and apply.
--
-- What this adds:
--   1. public.maintenance_service_types — reference table of bookable service
--      types and ONE neutral starting interval each. Mirrors
--      src/constants/maintenanceServiceTypes.ts; src/tests/maintenanceServiceTypes.test.ts
--      parses the seed below and fails if the two disagree.
--   2. public.maintenance_settings — the client's optional setup answers.
--   3. public.maintenance_items — the client's reminders. Owner-only RLS; no
--      provider can read them. Hard delete via an explicit owner DELETE policy.
--   4. Two notification types: maintenance_due, aftercare_available.
--   5. on_booking_completed_maintenance — a NEW trigger (handle_booking_status_change
--      is untouched) that creates/refreshes the service item when a booking
--      completes, and sends one aftercare notice when the provider wrote notes.
--   6. process_maintenance_reminders() + daily cron — at most two pushes per
--      item (due day, then ~3 days overdue), silent while a booking covers it,
--      removes events the day after they happen.
--   7. process_client_appointment_reminders() — the 24h reminder gains a single
--      generic prep line when the provider attached notes. No new push.
--   8. process_rebooking_nudges() — skips the provider's nudge when the client
--      already has an active maintenance item for that provider + service.
--   9. delete_client_profile() — also removes the client's maintenance rows.
--      (Full account deletion is covered by ON DELETE CASCADE from users.)
--
-- Every function redefined here (7–9) is reproduced from the LIVE
-- pg_get_functiondef() read on 2026-10-10, with only the commented deltas.
-- SECURITY DEFINER and SET search_path are preserved; process_rebooking_nudges
-- had none live and gains one.
--
-- Push copy is deliberately generic and category-free (legal-flagger,
-- 2026-10-10): no service, provider, patch-test or aftercare text ever leaves
-- the app on a lock screen. It all lives in maintenance_notification_copy().
--
-- Push consent: maintenance pushes are OFF until the client opts in. The opt-in
-- is users.notification_preferences->>'maintenanceReminders' = 'true', written
-- by the setup flow and NotificationsSettingsScreen. With it off, no
-- notifications row is written at all, so nothing is pushed whether or not the
-- send-push-notification edge function has been redeployed.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Service types (reference data)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.maintenance_service_types (
  key             text PRIMARY KEY,
  search_category text NOT NULL CHECK (search_category IN ('HAIR', 'NAILS', 'LASHES', 'BROWS', 'AESTHETICS')),
  default_weeks   int  NOT NULL CHECK (default_weeks BETWEEN 1 AND 52),
  -- Lower-case substrings matched against the booked service name, within the
  -- category. Empty = the category's catch-all.
  keywords        text[] NOT NULL DEFAULT '{}',
  sort_order      int  NOT NULL
);

-- Read only by SECURITY DEFINER functions. RLS on with no policy = no client
-- access at all, which is the point: the app has its own copy.
ALTER TABLE public.maintenance_service_types ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.maintenance_service_types FROM PUBLIC, anon, authenticated;

-- One row per line, same order as MAINTENANCE_SERVICE_TYPES (parity-tested).
INSERT INTO public.maintenance_service_types (key, search_category, default_weeks, keywords, sort_order) VALUES
  ('relaxer_touch_up',  'HAIR',       8,  ARRAY['relax']::text[], 1),
  ('root_colour',       'HAIR',       6,  ARRAY['root', 'colour', 'color', 'highlight', 'balayage']::text[], 2),
  ('silk_press',        'HAIR',       2,  ARRAY['silk press']::text[], 3),
  ('wash_and_go',       'HAIR',       2,  ARRAY['wash & go', 'wash and go', 'wash n go']::text[], 4),
  ('deep_conditioning', 'HAIR',       4,  ARRAY['deep condition', 'conditioning']::text[], 5),
  ('loc_retwist',       'HAIR',       6,  ARRAY['retwist', 'loc maintenance']::text[], 6),
  ('trim',              'HAIR',       12, ARRAY['trim', 'cut']::text[], 7),
  ('hair_general',      'HAIR',       6,  ARRAY[]::text[], 8),
  ('gel_nails',         'NAILS',      3,  ARRAY['gel', 'biab', 'builder']::text[], 9),
  ('acrylic_infill',    'NAILS',      3,  ARRAY['acrylic', 'infill', 'full set']::text[], 10),
  ('nails_general',     'NAILS',      3,  ARRAY[]::text[], 11),
  ('lash_infill',       'LASHES',     3,  ARRAY['infill', 'fill']::text[], 12),
  ('lashes_general',    'LASHES',     3,  ARRAY[]::text[], 13),
  ('brows_general',     'BROWS',      4,  ARRAY[]::text[], 14),
  ('facial',            'AESTHETICS', 6,  ARRAY['facial', 'dermaplan']::text[], 15);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Setup answers
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.maintenance_settings (
  user_id                uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  protective_style       text CHECK (protective_style IN ('braids', 'twists', 'locs', 'wigs_weaves')),
  protective_wear_weeks  int  CHECK (protective_wear_weeks BETWEEN 1 AND 52),
  -- The client's own recorded date. No verdict is ever derived from it, and it
  -- must never flow to a provider-facing patch-test or health-info path.
  last_patch_test_on     date,
  setup_completed_at     timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.maintenance_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.maintenance_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.maintenance_settings TO authenticated;
GRANT UPDATE (protective_style, protective_wear_weeks, last_patch_test_on, setup_completed_at)
  ON public.maintenance_settings TO authenticated;

CREATE POLICY maintenance_settings_owner_select ON public.maintenance_settings
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY maintenance_settings_owner_insert ON public.maintenance_settings
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY maintenance_settings_owner_update ON public.maintenance_settings
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY maintenance_settings_owner_delete ON public.maintenance_settings
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Items
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.maintenance_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind              text NOT NULL CHECK (kind IN ('service', 'takedown', 'event')),
  -- 'booking' rows are written only by handle_booking_completed_maintenance().
  origin            text NOT NULL CHECK (origin IN ('booking', 'client')),
  title             text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 80),
  type_key          text REFERENCES public.maintenance_service_types(key) ON DELETE SET NULL,
  provider_id       uuid REFERENCES public.providers(id) ON DELETE SET NULL,
  service_id        uuid REFERENCES public.services(id) ON DELETE SET NULL,
  -- providers.display_name at the time of writing, for the card. Never users.name.
  provider_name     text,
  source_booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  -- NULL = one-off on due_on.
  repeat_weeks      int CHECK (repeat_weeks BETWEEN 1 AND 52),
  -- Set by the client when they change the interval; a later completed booking
  -- then keeps their interval and only moves the due date.
  interval_edited   boolean NOT NULL DEFAULT false,
  last_done_on      date,
  due_on            date NOT NULL,
  event_on          date,
  paused            boolean NOT NULL DEFAULT false,
  -- Push bookkeeping. Reset whenever due_on moves (see the BEFORE UPDATE trigger).
  due_push_count    smallint NOT NULL DEFAULT 0 CHECK (due_push_count BETWEEN 0 AND 2),
  last_pushed_on    date,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_items_event_has_date CHECK ((kind = 'event') = (event_on IS NOT NULL)),
  CONSTRAINT maintenance_items_booking_repeats CHECK (origin <> 'booking' OR (repeat_weeks IS NOT NULL AND kind = 'service'))
);

-- One booking-made item per client + provider + service: what a completed
-- booking refreshes. Client-made items have no such limit.
CREATE UNIQUE INDEX maintenance_items_booking_unique
  ON public.maintenance_items (user_id, provider_id, service_id)
  WHERE origin = 'booking';
CREATE INDEX maintenance_items_user_idx ON public.maintenance_items (user_id, due_on);
-- The cron's scan: unpaused rows whose date has arrived.
CREATE INDEX maintenance_items_due_idx ON public.maintenance_items (due_on) WHERE NOT paused;

ALTER TABLE public.maintenance_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.maintenance_items FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.maintenance_items TO authenticated;
-- Insert: no origin/source_booking_id/push columns — origin defaults below and
-- the CHECK in the policy pins it to 'client'.
GRANT INSERT (user_id, kind, origin, title, type_key, provider_id, service_id, provider_name,
              repeat_weeks, due_on, event_on)
  ON public.maintenance_items TO authenticated;
-- Update: only what the item menu edits. Not origin, provider, service,
-- source booking or the push counters.
GRANT UPDATE (title, repeat_weeks, interval_edited, last_done_on, due_on, event_on, paused)
  ON public.maintenance_items TO authenticated;

CREATE POLICY maintenance_items_owner_select ON public.maintenance_items
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY maintenance_items_owner_insert ON public.maintenance_items
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND origin = 'client');
CREATE POLICY maintenance_items_owner_update ON public.maintenance_items
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
-- Hard delete, owner only. (bookings/notifications have no DELETE policy; this
-- table deliberately does.)
CREATE POLICY maintenance_items_owner_delete ON public.maintenance_items
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

-- updated_at, and a fresh push cycle whenever the due date moves (a refresh
-- from a booking, "mark as done", or an interval change).
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
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.maintenance_items_before_update() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER maintenance_items_before_update
  BEFORE UPDATE ON public.maintenance_items
  FOR EACH ROW EXECUTE FUNCTION public.maintenance_items_before_update();

CREATE TRIGGER maintenance_settings_updated_at
  BEFORE UPDATE ON public.maintenance_settings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Notification types + the one place their copy lives
-- ─────────────────────────────────────────────────────────────────────────────

-- Live constraint (read 2026-10-10) plus 'maintenance_due', 'aftercare_available'.
ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK ((type = ANY (ARRAY[
  'cancel_window_closing'::text, 'booking_pending'::text, 'booking_confirmed'::text,
  'booking_declined'::text, 'booking_cancelled'::text, 'booking_reminder'::text,
  'booking_in_progress'::text, 'booking_not_started'::text, 'no_show'::text,
  'payment_success'::text, 'new_provider'::text, 'reschedule_request'::text,
  'reschedule_provider_response'::text, 'reschedule_confirmed'::text,
  'reschedule_declined'::text, 'reschedule_expired'::text, 'review_request'::text,
  'review_received'::text, 'promotion'::text, 'intake_form_reminder'::text,
  'intake_form_received'::text, 'intake_form_completed'::text, 'info_pack_received'::text,
  'provider_message'::text, 'announcement'::text, 'balance_reminder'::text,
  'waitlist_slot_available'::text, 'new_message'::text, 'address_released'::text,
  'birthday_greeting'::text, 'post_appt_check_in'::text, 'rebooking_nudge'::text,
  'daily_recap'::text, 'schedule_fully_booked'::text, 'pending_booking_reminder'::text,
  'provider_no_show'::text, 'no_show_disputed'::text, 'points_earned'::text,
  'cancellation_settled'::text,
  'maintenance_due'::text, 'aftercare_available'::text
])));

-- Generic, category-free push/in-app copy (legal-flagger, 2026-10-10). Change
-- it here and nowhere else. The detail lives in the app behind the tap.
CREATE OR REPLACE FUNCTION public.maintenance_notification_copy(p_type text)
 RETURNS TABLE(title text, message text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT v.title, v.message
    FROM (VALUES
      ('maintenance_due',     'Maintenance reminder', 'You have something due. Open CERVICED to see it.'),
      ('aftercare_available', 'Aftercare notes',      'Aftercare notes from your provider are available.'),
      ('prep_line',           NULL,                   ' Prep notes are available for your booking.')
    ) AS v(kind, title, message)
   WHERE v.kind = p_type;
$function$;
REVOKE ALL ON FUNCTION public.maintenance_notification_copy(text) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Completed booking → service item (+ one aftercare notice)
-- ─────────────────────────────────────────────────────────────────────────────

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

    SELECT t.key, t.default_weeks INTO v_type_key, v_type_weeks
      FROM public.maintenance_service_types t
     WHERE t.search_category = v_category
       AND (cardinality(t.keywords) = 0
            OR EXISTS (SELECT 1 FROM unnest(t.keywords) k WHERE lower(v_title) LIKE '%' || k || '%'))
     ORDER BY (cardinality(t.keywords) = 0), t.sort_order
     LIMIT 1;

    -- Categories with no type (MUA, injectables, consultations) make no item.
    IF v_type_key IS NOT NULL THEN
      -- The provider's own recommended rebooking interval wins over ours.
      v_weeks := CASE WHEN v_nudge ~ '^[0-9]+$' AND v_nudge::int BETWEEN 1 AND 52
                      THEN v_nudge::int ELSE v_type_weeks END;

      INSERT INTO public.maintenance_items
        (user_id, kind, origin, title, type_key, provider_id, service_id, provider_name,
         source_booking_id, repeat_weeks, last_done_on, due_on)
      VALUES
        (NEW.user_id, 'service', 'booking', v_title, v_type_key, NEW.provider_id, NEW.service_id,
         COALESCE(NULLIF(btrim(v_display_name), ''), NEW.provider_name_snapshot),
         NEW.id, v_weeks, NEW.booking_date, NEW.booking_date + v_weeks * 7)
      ON CONFLICT (user_id, provider_id, service_id) WHERE origin = 'booking'
      DO UPDATE SET
        title             = EXCLUDED.title,
        provider_name     = EXCLUDED.provider_name,
        source_booking_id = EXCLUDED.source_booking_id,
        -- A client-edited interval is kept; only the due date resets.
        repeat_weeks      = CASE WHEN public.maintenance_items.interval_edited
                                 THEN public.maintenance_items.repeat_weeks
                                 ELSE EXCLUDED.repeat_weeks END,
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
              AND u.reminder_enabled = TRUE
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

CREATE TRIGGER on_booking_completed_maintenance
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION public.handle_booking_completed_maintenance();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Daily reminders
-- ─────────────────────────────────────────────────────────────────────────────
-- Per item, at most two pushes: on the due day, then once more when it is
-- three or more days overdue (and at least three days after the first), then
-- nothing until the due date moves. Events get one, on their book-by date.
-- Silent — and not counted — while the client has an upcoming booking for the
-- same service (or, for a provider-only link, with the same provider).

CREATE OR REPLACE FUNCTION public.process_maintenance_reminders()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r      RECORD;
  v_copy RECORD;
BEGIN
  -- One-off events expire the day after they happen.
  DELETE FROM public.maintenance_items WHERE kind = 'event' AND event_on < CURRENT_DATE;

  SELECT * INTO v_copy FROM public.maintenance_notification_copy('maintenance_due');

  FOR r IN
    SELECT i.id, i.user_id
      FROM public.maintenance_items i
      JOIN public.users u ON u.id = i.user_id
     WHERE NOT i.paused
       AND i.due_on <= CURRENT_DATE
       AND u.reminder_enabled = TRUE
       AND u.deletion_requested_at IS NULL
       AND COALESCE(u.notification_preferences->>'maintenanceReminders', 'false') = 'true'
       AND (
             i.due_push_count = 0
          OR (i.kind <> 'event'
              AND i.due_push_count = 1
              AND CURRENT_DATE >= GREATEST(i.due_on + 3, COALESCE(i.last_pushed_on, i.due_on) + 3))
           )
       AND NOT (
             i.kind <> 'event'
         AND EXISTS (
               SELECT 1 FROM public.bookings b
                WHERE b.user_id = i.user_id
                  AND b.status IN ('pending', 'confirmed', 'in_progress')
                  AND b.booking_date >= CURRENT_DATE
                  AND (   (i.service_id IS NOT NULL AND b.service_id = i.service_id)
                       OR (i.service_id IS NULL AND i.provider_id IS NOT NULL
                           AND b.provider_id = i.provider_id)))
           )
     ORDER BY i.due_on
     LIMIT 5000
  LOOP
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, recipient_role, metadata)
    VALUES
      (r.user_id, 'maintenance_due', v_copy.title, v_copy.message, 'low', TRUE, 'client',
       jsonb_build_object('kind', 'maintenance_due', 'maintenance_item_id', r.id));

    UPDATE public.maintenance_items
       SET due_push_count = due_push_count + 1,
           last_pushed_on = CURRENT_DATE
     WHERE id = r.id;
  END LOOP;
END;
$function$;
REVOKE ALL ON FUNCTION public.process_maintenance_reminders() FROM PUBLIC, anon, authenticated;

-- After the 09:00 rebooking nudges, so a nudge and a maintenance reminder for
-- the same thing can't both land (the nudge now skips maintained services).
SELECT cron.schedule('client-maintenance-reminders', '30 9 * * *', 'SELECT public.process_maintenance_reminders();');

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. 24h appointment reminder gains the generic prep line
-- ─────────────────────────────────────────────────────────────────────────────
-- Live body reproduced verbatim; only delta: the 24h message appends
-- maintenance_notification_copy('prep_line') when booking_info_packs has a row
-- for the booking. EXISTS, not a join, so the reminder can't duplicate.

CREATE OR REPLACE FUNCTION public.process_client_appointment_reminders()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  t RECORD;
  r RECORD;
  v_prep_line TEXT := (SELECT c.message FROM public.maintenance_notification_copy('prep_line') c);
BEGIN
  FOR t IN SELECT * FROM (VALUES ('24h', 1), ('48h', 2), ('72h', 3)) AS v(timing, days_ahead)
  LOOP
    FOR r IN
      SELECT
        b.id                    AS booking_id,
        b.user_id,
        b.booking_time,
        b.service_name_snapshot,
        b.provider_name_snapshot,
        b.provider_id,
        EXISTS (SELECT 1 FROM public.booking_info_packs bip WHERE bip.booking_id = b.id) AS has_prep
      FROM public.bookings b
      JOIN public.users u     ON u.id = b.user_id
      JOIN public.providers p ON p.id = b.provider_id
      WHERE b.booking_date = CURRENT_DATE + t.days_ahead
        AND b.status = 'confirmed'
        AND u.reminder_enabled = TRUE
        AND COALESCE(p.automation_settings->'clientReminderTiming', '["24h"]'::jsonb) ? t.timing
        AND NOT EXISTS (
          SELECT 1
            FROM public.notifications n
           WHERE n.booking_id = b.id
             AND n.user_id    = b.user_id
             AND n.type       = 'booking_reminder'
             AND (
               n.metadata->>'reminder_timing' = t.timing
               -- legacy untagged 24h reminders from the old job
               OR (t.timing = '24h' AND n.metadata->>'reminder_timing' IS NULL)
             )
        )
    LOOP
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, metadata)
      VALUES (
        r.user_id,
        'booking_reminder',
        CASE t.timing WHEN '24h' THEN 'Appointment Tomorrow' ELSE 'Upcoming Appointment' END,
        'Your ' || r.service_name_snapshot ||
          ' with ' || r.provider_name_snapshot ||
          ' is ' || CASE t.timing WHEN '24h' THEN 'tomorrow' WHEN '48h' THEN 'in 2 days' ELSE 'in 3 days' END ||
          ' at ' || public.format_notification_time(r.booking_time) ||
          CASE t.timing WHEN '24h' THEN '. Please arrive 10 minutes early.' ELSE '.' END ||
          CASE WHEN t.timing = '24h' AND r.has_prep THEN COALESCE(v_prep_line, '') ELSE '' END,
        'medium',
        TRUE,
        r.booking_id,
        r.provider_id,
        jsonb_build_object('reminder_timing', t.timing)
      );
    END LOOP;
  END LOOP;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Provider rebooking nudge steps aside for an active maintenance item
-- ─────────────────────────────────────────────────────────────────────────────
-- Live body reproduced; deltas: (a) carries the last completed booking's
-- service_id, (b) skips when the client has an unpaused maintenance item for
-- that provider + service, (c) gains SET search_path (live had none).
-- Scope note: the nudge is per provider and names only the LAST service, so
-- the skip covers that service only.

CREATE OR REPLACE FUNCTION public.process_rebooking_nudges()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      b.user_id,
      b.provider_id,
      p.display_name,
      (p.automation_settings->>'rebookingNudgeWeeks')::INT AS nudge_weeks,
      (ARRAY_AGG(b.service_name_snapshot ORDER BY b.booking_date DESC))[1] AS last_service_name,
      (ARRAY_AGG(b.service_id ORDER BY b.booking_date DESC))[1] AS last_service_id
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
    WHERE p.automation_settings->>'rebookingNudgeWeeks' ~ '^[0-9]+$'
      AND b.status = 'completed'
    GROUP BY b.user_id, b.provider_id, p.display_name, p.automation_settings
    HAVING MAX(b.booking_date) = CURRENT_DATE
      - ((p.automation_settings->>'rebookingNudgeWeeks')::INT * 7)
      AND NOT EXISTS (
        SELECT 1 FROM public.bookings up
         WHERE up.user_id = b.user_id
           AND up.provider_id = b.provider_id
           AND up.status IN ('pending', 'confirmed')
           AND up.booking_date >= CURRENT_DATE
      )
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.notifications n
       WHERE n.user_id     = r.user_id
         AND n.provider_id = r.provider_id
         AND n.type        = 'rebooking_nudge'
         AND n.created_at  > NOW() - INTERVAL '21 days'
    ) THEN CONTINUE; END IF;

    -- The client is already tracking this service in Beauty Maintenance, which
    -- sends its own reminder. One reminder about one thing.
    IF r.last_service_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.maintenance_items mi
       WHERE mi.user_id     = r.user_id
         AND mi.provider_id = r.provider_id
         AND mi.service_id  = r.last_service_id
         AND NOT mi.paused
    ) THEN CONTINUE; END IF;

    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, provider_id, metadata)
    VALUES (
      r.user_id,
      'rebooking_nudge',
      COALESCE(r.display_name, 'Your provider') || ' misses you!',
      'It''s been ' || r.nudge_weeks || ' week' || CASE WHEN r.nudge_weeks = 1 THEN '' ELSE 's' END ||
        ' since your last ' || COALESCE(r.last_service_name, 'appointment') ||
        ' with ' || COALESCE(r.display_name, 'them') || ' — book your next one now.',
      'medium',
      TRUE,
      r.provider_id,
      jsonb_build_object('kind', 'rebooking_nudge')
    );
  END LOOP;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Removing the client hat removes maintenance data too
-- ─────────────────────────────────────────────────────────────────────────────
-- Live body reproduced verbatim (SET search_path TO 'public' as live); only
-- delta: two DELETEs alongside the other per-client tables. The full-account
-- path is covered by ON DELETE CASCADE when process_scheduled_account_deletions
-- removes the users row.

CREATE OR REPLACE FUNCTION public.delete_client_profile()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid         UUID := auth.uid();
  v_provider_id UUID;
  v_upcoming    INT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not authenticated');
  END IF;

  SELECT id INTO v_provider_id FROM public.providers WHERE user_id = v_uid LIMIT 1;

  SELECT COUNT(*) INTO v_upcoming
    FROM public.bookings
   WHERE user_id = v_uid
     AND booking_date >= CURRENT_DATE
     AND status IN ('pending', 'confirmed', 'in_progress');

  IF v_upcoming > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'upcoming_bookings', 'count', v_upcoming);
  END IF;

  INSERT INTO public.account_deletion_log
    (user_id, provider_id, email, deletion_type, had_client_profile, had_provider_profile, account_created_at)
  SELECT v_uid, v_provider_id, au.email,
         CASE WHEN v_provider_id IS NULL THEN 'full_account' ELSE 'client_profile' END,
         true, (v_provider_id IS NOT NULL), au.created_at
    FROM auth.users au WHERE au.id = v_uid;

  IF v_provider_id IS NULL THEN
    UPDATE public.users SET deletion_requested_at = NOW() WHERE id = v_uid;
    RETURN jsonb_build_object('ok', true, 'full_account_deleted', true, 'grace_period_days', 30);
  END IF;

  DELETE FROM public.reviews  WHERE user_id = v_uid;
  DELETE FROM public.bookings WHERE user_id = v_uid;

  DELETE FROM public.bookmarks              WHERE user_id = v_uid;
  DELETE FROM public.event_plans            WHERE user_id = v_uid;
  DELETE FROM public.payment_methods        WHERE user_id = v_uid;
  DELETE FROM public.becca_chat_sessions    WHERE user_id = v_uid;
  DELETE FROM public.user_interactions      WHERE user_id = v_uid;
  DELETE FROM public.provider_follows       WHERE user_id = v_uid;
  DELETE FROM public.provider_conversations WHERE user_id = v_uid;
  DELETE FROM public.notifications          WHERE user_id = v_uid;
  DELETE FROM public.maintenance_items      WHERE user_id = v_uid;
  DELETE FROM public.maintenance_settings   WHERE user_id = v_uid;

  UPDATE public.users SET
    dob                = NULL,
    has_client_profile = false,
    hair_type          = NULL,
    skin_type          = NULL,
    allergies          = '{}',
    skin_concerns      = '{}',
    style_vibe         = NULL,
    medical_notes      = NULL,
    treatment_history  = '{}',
    service_interests  = '{}',
    saved_portfolio    = '[]'::jsonb
  WHERE id = v_uid;

  RETURN jsonb_build_object('ok', true, 'full_account_deleted', false);
END;
$function$;

COMMIT;
