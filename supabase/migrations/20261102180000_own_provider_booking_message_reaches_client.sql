-- 20261102180000_own_provider_booking_message_reaches_client.sql
--
-- "You can't book your own provider profile." was written for the client but
-- never reached them. The trigger raised it as check_violation (23514), and
-- the app only shows a database message in its own words when it's a plain
-- guard (P0001): any other code is treated as technical and replaced by
-- "We couldn't reserve that time. Please try again." So a provider checking
-- out their own service from the client side was told to retry something
-- that could never work.
--
-- The only change is the error code: P0001, like every other booking guard
-- (enforce_booking_bookability, refuse_booking_for_external_provider). No
-- function catches check_violation from this trigger (checked live
-- 2026-11-02), so nothing downstream depends on the old code.
--
-- Redefined from the live definition on 2026-11-02.

BEGIN;

DO $guard$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc
       WHERE oid = 'public.prevent_booking_with_own_provider()'::regprocedure)
     IS DISTINCT FROM '2da74b35d4f05e0f4f89934abfdc0f08' THEN
    RAISE EXCEPTION 'prevent_booking_with_own_provider changed since this migration was written; redo it from the live definition';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.prevent_booking_with_own_provider()
 RETURNS trigger
 LANGUAGE plpgsql
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
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261102180000', 'own_provider_booking_message_reaches_client')
ON CONFLICT (version) DO NOTHING;

COMMIT;
