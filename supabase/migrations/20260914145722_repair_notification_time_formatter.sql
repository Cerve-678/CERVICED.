-- The preceding notification formatting migration rewrote its new helper
-- function too. Restore its non-recursive body before notification functions
-- use it.
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
