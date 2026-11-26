-- 20261126130000_client_reminders_fixed_timing.sql
--
-- Every client now gets the same two appointment reminders, whoever they
-- booked with: 2 days before ("Upcoming Appointment … in 2 days") and the day
-- before ("Appointment Tomorrow"). User decision 2026-11-26: "we handle
-- reminders", so the provider's Automations screen no longer offers a choice.
--
-- Before: each provider's automation_settings.clientReminderTiming picked
-- which of 24h / 48h / 72h went out (default ["24h"]). The screen also
-- offered 1h, 3h and 1 week, which this job never understood, so a provider
-- who picked only those left their clients with no reminder at all. Live on
-- 2026-11-26, 7 providers had saved the key, all ["24h"].
--
-- This stops reading that key and drops the 3-day reminder. Nothing else
-- changes: same 08:00 UTC daily run (cron user-24hr-reminders), same
-- confirmed-only and client-switch rules, same one-per-timing guard, same
-- day-before wording (the provider's own instructions or "read their
-- policies", and the prep line). Only the day-before reminder is emailed
-- (send-booking-update-email, same PR).
--
-- Redefined FROM LIVE, per supabase/MIGRATION_OWNER.md: reads the live
-- function, swaps three exact literals and re-creates it. The md5 guard is
-- the live definition read on 2026-11-26; if it has changed, or any literal
-- isn't there exactly once, the migration stops rather than guess.
-- Numbered above the live frontier (20261126120000).

BEGIN;

DO $mig$
DECLARE
  v_def  TEXT := pg_get_functiondef('public.process_client_appointment_reminders()'::regprocedure);
  v_old  TEXT[] := ARRAY[
    $o$FROM (VALUES ('24h', 1), ('48h', 2), ('72h', 3)) AS v(timing, days_ahead)$o$,
    $o$        AND COALESCE(p.automation_settings->'clientReminderTiming', '["24h"]'::jsonb) ? t.timing$o$ || chr(10),
    $o$WHEN '48h' THEN 'in 2 days' ELSE 'in 3 days' END$o$
  ];
  v_new  TEXT[] := ARRAY[
    $n$FROM (VALUES ('24h', 1), ('48h', 2)) AS v(timing, days_ahead)$n$,
    '',
    $n$ELSE 'in 2 days' END$n$
  ];
  v_count INT;
BEGIN
  IF md5(v_def) <> 'dec2cf9bbfaa7178ffb970cd646c2387' THEN
    RAISE EXCEPTION 'process_client_appointment_reminders changed live (md5 %). Re-read it before applying.', md5(v_def);
  END IF;

  FOR i IN 1 .. array_length(v_old, 1) LOOP
    v_count := (length(v_def) - length(replace(v_def, v_old[i], ''))) / length(v_old[i]);
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'process_client_appointment_reminders: expected literal % once, found % times. Live has changed; re-read it before applying.', i, v_count;
    END IF;
    v_def := replace(v_def, v_old[i], v_new[i]);
  END LOOP;

  EXECUTE v_def;
END
$mig$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261126130000', 'client_reminders_fixed_timing')
ON CONFLICT (version) DO NOTHING;

COMMIT;
