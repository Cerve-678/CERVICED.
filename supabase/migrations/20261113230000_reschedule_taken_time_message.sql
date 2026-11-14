-- A provider offering a time someone else has just taken gets told which one.
--
-- place_reschedule_holds_from_slots() turns a clash into "<date> at <time> is
-- no longer free. Remove it and send the rest." (P0001, shown as written). The
-- message called format_notification_time(date, text), which doesn't exist
-- (only (time) does), and one-argument to_char(time), which doesn't either.
-- Building the message raised its own "function does not exist" error, so the
-- provider got the generic failure instead of which time to remove. Same
-- broken calls 20261113210000 fixes in the waitlist functions.
--
-- Only the two message expressions change. Rebuilt from live
-- (pg_get_functiondef, 2026-11-14); the md5 guard refuses to run if it
-- changed since. Numbered above the queued 20261113200000 (#505),
-- 20261113210000 (#474) and 20261113220000 (#473), none of which touch it.

BEGIN;

DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.place_reschedule_holds_from_slots(uuid, jsonb)'::regprocedure)) <> 'eb82eb008d2de5d71e7f1b131f70007c' THEN
    RAISE EXCEPTION 'place_reschedule_holds_from_slots changed live since this migration was written; redo it from live';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.place_reschedule_holds_from_slots(p_booking_id uuid, p_slots jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_b        RECORD;
  v_duration INTERVAL;
  v_slot     JSONB;
  v_time     TEXT;
  v_date     DATE;
  v_count    INTEGER := 0;
BEGIN
  SELECT booking_time, end_time INTO v_b
    FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  v_duration := COALESCE(v_b.end_time, v_b.booking_time + INTERVAL '1 hour') - v_b.booking_time;

  IF p_slots IS NULL OR jsonb_typeof(p_slots) <> 'array' THEN
    RETURN 0;
  END IF;

  FOR v_slot IN SELECT * FROM jsonb_array_elements(p_slots) LOOP
    BEGIN
      v_date := (v_slot->>'date')::DATE;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;

    FOR v_time IN SELECT jsonb_array_elements_text(COALESCE(v_slot->'times', '[]'::jsonb)) LOOP
      BEGIN
        IF public.place_reschedule_hold(
             p_booking_id, v_date, v_time::TIME, (v_time::TIME + v_duration)::TIME
           ) IS NOT NULL
        THEN
          v_count := v_count + 1;
        END IF;
      EXCEPTION WHEN exclusion_violation OR check_violation THEN
        RAISE EXCEPTION '% at % is no longer free. Remove it and send the rest.',
          TO_CHAR(v_date, 'FMDD Mon'), public.format_notification_time(v_time::TIME)
          USING ERRCODE = 'P0001';
      END;
    END LOOP;
  END LOOP;

  RETURN v_count;
END;
$function$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261113230000', 'reschedule_taken_time_message')
ON CONFLICT (version) DO NOTHING;

COMMIT;
