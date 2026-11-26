-- The provider's "someone joined your waitlist" notification says who and
-- what for.
--
-- Was:  "Mini Manicure · 3rd in line" / "Faith joined your waitlist."
-- Now:  "Faith is on your waitlist for Mini Manicure" / "3rd in line."
--
-- The user's wording, 2026-11-24 ("x is on waitlist for x"). Only the title
-- and message change: notify_provider_waitlist_joined is rebuilt from its
-- live definition, guarded by md5 so a newer version is never overwritten.

BEGIN;

DO $$
BEGIN
  IF (SELECT md5(pg_get_functiondef('public.notify_provider_waitlist_joined()'::regprocedure)))
     <> 'd9ca615235ae7244368fb2c26bb9ea33' THEN
    RAISE EXCEPTION 'notify_provider_waitlist_joined changed live since this migration was written';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.notify_provider_waitlist_joined()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_provider_user uuid;
  v_who text;
  v_what text;
  v_title text;
  v_message text;
  v_place int;
BEGIN
  IF NEW.status IS DISTINCT FROM 'waiting' THEN
    RETURN NEW;
  END IF;

  SELECT p.user_id INTO v_provider_user
    FROM public.providers p
   WHERE p.id = NEW.provider_id;
  IF v_provider_user IS NULL OR v_provider_user = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Leaving and rejoining the same waitlist: tell them once a day.
  IF EXISTS (
    SELECT 1 FROM public.notifications n
     WHERE n.user_id = v_provider_user
       AND n.type = 'waitlist_joined'
       AND n.provider_id = NEW.provider_id
       AND n.metadata->>'client_id' = NEW.user_id::text
       AND n.metadata->>'service_id' IS NOT DISTINCT FROM NEW.service_id::text
       AND n.created_at > now() - interval '24 hours'
  ) THEN
    RETURN NEW;
  END IF;

  -- Who, then what for, then their place the way the app says it ("2nd in
  -- line", placeInLineLabel): "Faith is on your waitlist for Mini Manicure" /
  -- "3rd in line."
  SELECT count(*)::int INTO v_place
    FROM public.provider_waitlist w
   WHERE w.provider_id = NEW.provider_id
     AND w.service_id IS NOT DISTINCT FROM NEW.service_id
     AND w.status = 'waiting'
     AND w.position <= NEW.position;
  v_who := COALESCE(NULLIF(btrim(NEW.user_name_snapshot), ''), 'Someone');
  v_what := COALESCE(NULLIF(btrim(NEW.service_name_snapshot), ''), NULL);
  v_title := v_who || ' is on your waitlist' || CASE WHEN v_what IS NOT NULL THEN ' for ' || v_what ELSE '' END;
  v_message := CASE WHEN v_place >= 1 THEN v_place ||
    CASE WHEN v_place % 100 IN (11, 12, 13) THEN 'th'
         WHEN v_place % 10 = 1 THEN 'st'
         WHEN v_place % 10 = 2 THEN 'nd'
         WHEN v_place % 10 = 3 THEN 'rd'
         ELSE 'th' END || ' in line.' ELSE 'Waiting for a slot.' END;

  BEGIN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, provider_id, recipient_role, metadata)
    VALUES
      (v_provider_user, 'waitlist_joined', v_title,
       v_message,
       'low', true, NEW.provider_id, 'provider',
       jsonb_build_object('kind', 'waitlist_joined', 'waitlist_id', NEW.id,
                          'client_id', NEW.user_id, 'service_id', NEW.service_id));
  EXCEPTION WHEN OTHERS THEN
    -- A failed notification must never stop the client joining.
    RAISE WARNING 'waitlist_joined notification failed for waitlist %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261124210000', 'waitlist_joined_wording');

COMMIT;
