-- Notification text is generated in several client- and provider-facing
-- functions. Keep their existing logic, ownership checks, configuration and
-- grants; only change the display picture from `02:00 PM` to `02:00pm`.
DO $migration$
DECLARE
  fn record;
  current_definition text;
  updated_definition text;
BEGIN
  FOR fn IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND pg_get_functiondef(p.oid) LIKE '%HH12:MI AM%'
  LOOP
    current_definition := pg_get_functiondef(fn.oid);
    updated_definition := replace(
      current_definition,
      '''HH12:MI AM''',
      '''HH12:MIam'''
    );
    IF updated_definition = current_definition THEN
      RAISE EXCEPTION 'notification time format anchor changed for %', fn.oid::regprocedure;
    END IF;
    EXECUTE updated_definition;
  END LOOP;
END;
$migration$;
