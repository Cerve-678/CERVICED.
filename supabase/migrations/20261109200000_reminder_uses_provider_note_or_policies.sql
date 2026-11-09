-- 20261109200000_reminder_uses_provider_note_or_policies.sql
--
-- The client's "Appointment Tomorrow" reminder ended with a fixed
-- ". Please arrive 10 minutes early." for every booking with every provider,
-- whatever the provider had written, and providers had no way to change it.
-- It now ends with the provider's own booking instructions instead: the
-- booking's snapshot (bookings.booking_instructions, stamped at insert by
-- on_booking_set_instructions), so it says what applied when the client booked.
-- "Please arrive 10 minutes early." is one of the ready-made lines a provider
-- can pick, so it still appears when they picked it. With no note, the
-- reminder asks the client to read the provider's policies instead.
--
-- Written 2026-11-03 as 20261103120000 but never applied; renumbered
-- 2026-11-09 above the live frontier (20261109190000; earlier drafts sat at 180000, overtaken)
-- and every migration on an open PR.
--
-- Redefined FROM LIVE, per supabase/MIGRATION_OWNER.md: this reads the live
-- function, swaps exactly that one literal, and re-creates it. The md5 guard
-- is the live definition read on 2026-11-09 (which already carries
-- beauty_maintenance's prep line); if it has changed, or the literal isn't
-- there exactly once, the migration stops rather than guess.

BEGIN;

DO $mig$
DECLARE
  v_def TEXT := pg_get_functiondef('public.process_client_appointment_reminders()'::regprocedure);
  v_old TEXT := $old$'. Please arrive 10 minutes early.'$old$;
  v_new TEXT := $new$'.' || COALESCE((
            SELECT ' ' || regexp_replace(btrim(bk.booking_instructions), '\s+', ' ', 'g')
              FROM public.bookings bk
             WHERE bk.id = r.booking_id
               AND NULLIF(btrim(bk.booking_instructions), '') IS NOT NULL
          ), ' Please read ' || r.provider_name_snapshot || '''s policies before your appointment.')$new$;
  v_count INT;
BEGIN
  IF md5(v_def) <> 'ca41105fdf21780ce5a961fc86c507d2' THEN
    RAISE EXCEPTION 'process_client_appointment_reminders changed live (md5 %). Re-read it before applying.', md5(v_def);
  END IF;

  v_count := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'process_client_appointment_reminders: expected the fixed arrival line once, found % times. Live has changed; re-read it before applying.', v_count;
  END IF;

  EXECUTE replace(v_def, v_old, v_new);
END
$mig$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261109200000', 'reminder_uses_provider_note_or_policies')
ON CONFLICT (version) DO NOTHING;

COMMIT;
