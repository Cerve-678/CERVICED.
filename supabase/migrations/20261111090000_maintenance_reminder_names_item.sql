-- Maintenance reminders say what is due.
--
-- The push and in-app notice used to read "You have something due. Open
-- CERVICED to see it." for every item, which told the client nothing. The
-- user asked (2026-11-11) for the reminder to name the item instead:
--
--   service   "Your Classic Lash Infill with Amara is due."
--   2nd push  "Your Classic Lash Infill with Amara is still due."
--   takedown  "Your Box braids take-down is due."
--   event     "Time to book in for My wedding on Sat 14 Nov."
--
-- This reverses the 2026-10-10 choice to keep the copy generic so nothing
-- about a treatment showed on a lock screen. The item title is the client's
-- own service name or their own label, and the notice only ever goes to that
-- client.
--
-- The wording still lives only in maintenance_notification_copy(); {item}
-- and {date} are filled in by process_maintenance_reminders(). Both are
-- redefined from live with md5 guards. Safe to re-run.

BEGIN;

-- Refuse if either function changed live since this was written. A re-run
-- (the new versions already in place) is allowed through.
DO $$
BEGIN
  IF md5(pg_get_functiondef('public.maintenance_notification_copy'::regproc))
     <> '00e798d2de64e0d849f7a0d11deafcd4'
     AND position('{item}' IN pg_get_functiondef('public.maintenance_notification_copy'::regproc)) = 0 THEN
    RAISE EXCEPTION 'maintenance_notification_copy changed since this migration was written';
  END IF;
  IF md5(pg_get_functiondef('public.process_maintenance_reminders'::regproc))
     <> '3516a222be94e0586db06fe527035b33'
     AND position('v_message' IN pg_get_functiondef('public.process_maintenance_reminders'::regproc)) = 0 THEN
    RAISE EXCEPTION 'process_maintenance_reminders changed since this migration was written';
  END IF;
END $$;

-- The one place maintenance notification wording lives. {item} and {date}
-- are placeholders process_maintenance_reminders() fills per item.
CREATE OR REPLACE FUNCTION public.maintenance_notification_copy(p_type text)
 RETURNS TABLE(title text, message text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT v.title, v.message
    FROM (VALUES
      ('maintenance_due',       'Maintenance reminder', 'Your {item} is due.'),
      ('maintenance_due_again', 'Maintenance reminder', 'Your {item} is still due.'),
      ('maintenance_event',     'Maintenance reminder', 'Time to book in for {item} on {date}.'),
      ('aftercare_available',   'Aftercare notes',      'Aftercare notes from your provider are available.'),
      ('prep_line',             NULL,                   ' Prep notes are available for your booking.')
    ) AS v(kind, title, message)
   WHERE v.kind = p_type;
$function$;
REVOKE ALL ON FUNCTION public.maintenance_notification_copy(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.process_maintenance_reminders()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r         RECORD;
  v_due     RECORD;
  v_again   RECORD;
  v_event   RECORD;
  v_copy    RECORD;
  v_item    text;
  v_message text;
BEGIN
  -- One-off events expire the day after they happen.
  DELETE FROM public.maintenance_items WHERE kind = 'event' AND event_on < CURRENT_DATE;

  SELECT * INTO v_due   FROM public.maintenance_notification_copy('maintenance_due');
  SELECT * INTO v_again FROM public.maintenance_notification_copy('maintenance_due_again');
  SELECT * INTO v_event FROM public.maintenance_notification_copy('maintenance_event');

  FOR r IN
    SELECT i.id, i.user_id, i.kind, i.event_on, i.due_push_count,
           btrim(i.title) AS title,
           NULLIF(btrim(i.provider_name), '') AS provider_name
      FROM public.maintenance_items i
      JOIN public.users u ON u.id = i.user_id
     WHERE NOT i.paused
       AND i.due_on <= CURRENT_DATE
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
    IF r.kind = 'event' THEN
      v_copy := v_event;
    ELSIF r.due_push_count > 0 THEN
      v_copy := v_again;
    ELSE
      v_copy := v_due;
    END IF;

    v_item := r.title
           || CASE WHEN r.kind = 'service' AND r.provider_name IS NOT NULL
                   THEN ' with ' || r.provider_name ELSE '' END;
    v_message := replace(replace(v_copy.message, '{item}', v_item),
                         '{date}', COALESCE(to_char(r.event_on, 'Dy FMDD Mon'), ''));

    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, recipient_role, metadata)
    VALUES
      (r.user_id, 'maintenance_due', v_copy.title, v_message, 'low', TRUE, 'client',
       jsonb_build_object('kind', 'maintenance_due', 'maintenance_item_id', r.id));

    UPDATE public.maintenance_items
       SET due_push_count = due_push_count + 1,
           last_pushed_on = CURRENT_DATE
     WHERE id = r.id;
  END LOOP;
END;
$function$;
REVOKE ALL ON FUNCTION public.process_maintenance_reminders() FROM PUBLIC, anon, authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261111090000', 'maintenance_reminder_names_item')
ON CONFLICT (version) DO NOTHING;

COMMIT;
