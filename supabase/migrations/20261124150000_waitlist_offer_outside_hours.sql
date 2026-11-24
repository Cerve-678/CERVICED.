-- A provider can offer a waitlist client a time outside their working hours,
-- after the app asks "Offer it anyway?".
--
-- provider_offer_waitlist_slot used to be refused by the bookings check
-- ("This appointment is outside the provider's working hours") for any time
-- outside the provider's set hours, or past a service's latest start. A
-- provider booking someone in by hand already may go outside their own hours
-- (provider_create_manual_booking sets cerviced.bypass_working_hours); an
-- offer they make by hand is the same choice about their own diary. The
-- user's call, 2026-11-24 ("Ask, then allow").
--
-- p_outside_hours defaults to FALSE, so older app builds calling with three
-- arguments behave exactly as before, and the app only sends TRUE after the
-- provider has said yes. It skips only what the bypass skips (working hours,
-- a service's latest start, a one-off closed day); blocked dates, notice,
-- the booking window and clashes are still checked. Automatic offers
-- (offer_waitlist_slot called by the waitlist itself) are unchanged.

BEGIN;

DO $$
BEGIN
  IF (SELECT md5(pg_get_functiondef('public.provider_offer_waitlist_slot(uuid,date,time without time zone)'::regprocedure)))
     <> '64e2e2a1893ce4a28884da113ab80143' THEN
    RAISE EXCEPTION 'provider_offer_waitlist_slot changed live since this migration was written';
  END IF;
END $$;

DROP FUNCTION public.provider_offer_waitlist_slot(uuid, date, time without time zone);

CREATE FUNCTION public.provider_offer_waitlist_slot(
  p_entry_id uuid,
  p_booking_date date,
  p_booking_time time without time zone,
  p_outside_hours boolean DEFAULT FALSE
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  w public.provider_waitlist%ROWTYPE;
  v_id uuid;
BEGIN
  SELECT pw.* INTO w
    FROM public.provider_waitlist pw
    JOIN public.providers p ON p.id = pw.provider_id
   WHERE pw.id = p_entry_id AND p.user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That client isn''t on your waitlist';
  END IF;
  IF w.service_id IS NULL THEN
    RAISE EXCEPTION 'This client joined for any service. Offer them a slot when one opens up';
  END IF;
  -- The provider said yes to a time outside their hours. Transaction-local,
  -- the same switch provider_create_manual_booking() uses; only the bookings
  -- check reads it.
  IF p_outside_hours THEN
    PERFORM set_config('cerviced.bypass_working_hours', 'on', true);
  END IF;
  v_id := public.offer_waitlist_slot(p_entry_id, w.service_id, p_booking_date, p_booking_time);
  IF p_outside_hours THEN
    PERFORM set_config('cerviced.bypass_working_hours', 'off', true);
  END IF;
  UPDATE public.waitlist_released_slots
     SET resolved_at = now()
   WHERE provider_id = w.provider_id AND booking_date = p_booking_date
     AND booking_time = p_booking_time AND resolved_at IS NULL;
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.provider_offer_waitlist_slot(uuid, date, time without time zone, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provider_offer_waitlist_slot(uuid, date, time without time zone, boolean) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261124150000', 'waitlist_offer_outside_hours');

COMMIT;
