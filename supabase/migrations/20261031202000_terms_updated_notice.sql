-- A one-off "We've updated our Terms" notice, sent on release day.
--
-- Frontier at authoring: 20261031173214 (verified live 2026-10-31).
-- 20261031200000 and 20261031201000 (same lock holder) touch none of the
-- same objects. Check the lock in MIGRATION_OWNER.md and re-check
-- max(version) before applying.
--
-- Decided with the user 2026-10-31: when Terms that people already accepted
-- change, everyone gets one in-app notification linking to the Terms. Nobody
-- has to re-accept. The first use is the reschedule rule (#191) and the
-- refund-request deadline (#192).
--
-- What this adds:
--   - notification type terms_updated, added to notifications_type_check by
--     reading the live list (refuses to rebuild if it reads fewer than 50).
--     send-push-notification needs no change: a type in neither preference
--     map always pushes.
--   - send_terms_updated_notice(p_version text, p_summary text), service role
--     only. One row per hat a user holds (client and/or provider), so it shows
--     in whichever bell they open. Safe to run twice: a user who already has
--     a terms_updated row for p_version is skipped. Returns how many rows it
--     wrote.
--
-- Applying this sends nothing. On release day, once the new app build is out
-- (older builds don't know the type and just show it in the list), run:
--   SELECT public.send_terms_updated_notice('2026-10-31',
--     'Rescheduling once a cancellation window has started, and how refund requests reach us.');

BEGIN;

DO $$
DECLARE
  v_def   text;
  v_types text[];
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conrelid = 'public.notifications'::regclass AND conname = 'notifications_type_check';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'notifications_type_check not found; refusing to rebuild it blind';
  END IF;

  SELECT array_agg(DISTINCT r.m[1]) INTO v_types
    FROM regexp_matches(v_def, '''([a-z_]+)''::text', 'g') AS r(m);
  -- 54 types live at authoring. Far fewer means the definition wasn't read
  -- the way this expects; stop rather than shrink the list.
  IF COALESCE(array_length(v_types, 1), 0) < 50 THEN
    RAISE EXCEPTION 'read only % types from notifications_type_check; refusing to rebuild it',
      COALESCE(array_length(v_types, 1), 0);
  END IF;

  v_types := ARRAY(
    SELECT DISTINCT t FROM unnest(v_types || ARRAY['terms_updated']) AS t ORDER BY t
  );
  ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
  EXECUTE format(
    'ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (%L::text[]))',
    v_types);
END $$;

CREATE OR REPLACE FUNCTION public.send_terms_updated_notice(p_version text, p_summary text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_version text := NULLIF(BTRIM(COALESCE(p_version, '')), '');
  v_summary text := NULLIF(BTRIM(COALESCE(p_summary, '')), '');
  v_count   integer;
BEGIN
  IF v_version IS NULL THEN
    RAISE EXCEPTION 'Say which Terms version this is, e.g. 2026-10-31.';
  END IF;

  WITH hats AS (
    SELECT u.id AS user_id, 'provider'::text AS role
      FROM public.users u
     WHERE EXISTS (SELECT 1 FROM public.providers p WHERE p.user_id = u.id)
    UNION
    SELECT u.id, 'client'
      FROM public.users u
     WHERE COALESCE(u.has_client_profile, false)
        OR NOT EXISTS (SELECT 1 FROM public.providers p WHERE p.user_id = u.id)
  ), sent AS (
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, recipient_role, metadata)
    SELECT h.user_id, 'terms_updated', 'We''ve Updated Our Terms',
           COALESCE(v_summary || ' ', '') || 'Tap to read what''s changed.',
           'medium', TRUE, h.role,
           jsonb_build_object('terms_version', v_version)
      FROM hats h
     WHERE NOT EXISTS (
       SELECT 1 FROM public.notifications n
        WHERE n.user_id = h.user_id AND n.type = 'terms_updated'
          AND n.recipient_role = h.role
          AND n.metadata->>'terms_version' = v_version
     )
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM sent;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.send_terms_updated_notice(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_terms_updated_notice(text, text) TO service_role;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261031202000', 'terms_updated_notice')
ON CONFLICT (version) DO NOTHING;

COMMIT;
