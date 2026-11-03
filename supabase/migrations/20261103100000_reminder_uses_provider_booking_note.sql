-- The client's "Appointment Tomorrow" reminder ended with a fixed
-- ". Please arrive 10 minutes early." for every booking with every provider,
-- whatever the provider had written, and providers had no way to change it.
-- It now ends with the provider's own booking instructions instead: the
-- booking's snapshot (bookings.booking_instructions, stamped at insert by
-- on_booking_set_instructions), so it says what applied when the client booked.
-- No note, no extra line.
--
-- Redefined FROM LIVE, per supabase/MIGRATION_OWNER.md: this reads the live
-- function, swaps exactly that one literal, and re-creates it. Anything else
-- another migration has since changed in the function is kept. If the literal
-- isn't there exactly once, the live function isn't the one this was written
-- against, and the migration stops rather than guess.

DO $mig$
DECLARE
  v_def TEXT := pg_get_functiondef('public.process_client_appointment_reminders()'::regprocedure);
  v_old TEXT := $old$'. Please arrive 10 minutes early.'$old$;
  v_new TEXT := $new$'.' || COALESCE((
            SELECT ' ' || regexp_replace(btrim(bk.booking_instructions), '\s+', ' ', 'g')
              FROM public.bookings bk
             WHERE bk.id = r.booking_id
               AND NULLIF(btrim(bk.booking_instructions), '') IS NOT NULL
          ), '')$new$;
  v_count INT;
BEGIN
  v_count := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'process_client_appointment_reminders: expected the fixed arrival line once, found % times. Live has changed; re-read it before applying.', v_count;
  END IF;

  EXECUTE replace(v_def, v_old, v_new);
END
$mig$;
