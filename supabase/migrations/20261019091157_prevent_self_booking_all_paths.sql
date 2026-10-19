-- One authority for every booking path. Checkout RPCs, direct inserts and
-- future function replacements all pass through this row trigger.
CREATE OR REPLACE FUNCTION public.prevent_booking_with_own_provider()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.providers p
     WHERE p.id = NEW.provider_id
       AND p.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'You can''t book your own provider profile.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.prevent_booking_with_own_provider() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS prevent_booking_with_own_provider ON public.bookings;
CREATE TRIGGER prevent_booking_with_own_provider
  BEFORE INSERT OR UPDATE OF user_id, provider_id
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_booking_with_own_provider();
