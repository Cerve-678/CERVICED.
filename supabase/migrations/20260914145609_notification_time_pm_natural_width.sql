-- Notifications use 2:00pm in the afternoon and 09:00am in the morning.
-- Keep each existing notification function's body, ownership, configuration and
-- grants intact by replacing only its appointment-time expression.
CREATE OR REPLACE FUNCTION public.format_notification_time(p_time time without time zone)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $function$
  SELECT CASE
    WHEN p_time < time '12:00' THEN to_char(p_time, 'HH12:MIam')
    ELSE to_char(p_time, 'FMHH12:MIam')
  END
$function$;

REVOKE ALL ON FUNCTION public.format_notification_time(time without time zone) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.format_notification_time(time without time zone) TO authenticated, service_role;

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
      AND pg_get_functiondef(p.oid) LIKE '%HH12:MIam%'
  LOOP
    current_definition := pg_get_functiondef(fn.oid);
    updated_definition := regexp_replace(
      current_definition,
      $$(?i)to_char\(([^\n]+?), 'HH12:MIam'\)$$,
      $$public.format_notification_time(\1)$$,
      'g'
    );
    IF updated_definition = current_definition THEN
      RAISE EXCEPTION 'notification time format anchor changed for %', fn.oid::regprocedure;
    END IF;
    EXECUTE updated_definition;
  END LOOP;
END;
$migration$;
