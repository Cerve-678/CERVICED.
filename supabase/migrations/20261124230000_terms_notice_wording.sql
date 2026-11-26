-- The "We've Updated Our Terms" notice is only a notice now: tapping it opens
-- its message, not the Terms (#762). Its last line said "Tap to read what's
-- changed.", which nothing does any more, so it points to the website instead.
--
-- Frontier: live 20261124220000 (2026-11-24). Lock (none) on main, no
-- unapplied migration above it on any open PR. Re-check max(version) and the
-- lock in MIGRATION_OWNER.md before applying.
--
-- What this changes:
--   - send_terms_updated_notice: same function, last line now "You can read
--     the full Terms at cerviced.co/legal." (md5-guarded against the live copy).
--   - the terms_updated rows already sent get the same new last line.
--     Nothing else on those rows changes.

BEGIN;

DO $$
BEGIN
  IF md5(pg_get_functiondef('public.send_terms_updated_notice(text,text)'::regprocedure))
     <> '3c40f820264e60c6d6fea0fd1c3fd887' THEN
    RAISE EXCEPTION 'send_terms_updated_notice changed since this was written; re-read it before applying';
  END IF;
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
           COALESCE(v_summary || ' ', '') || 'You can read the full Terms at cerviced.co/legal.',
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

UPDATE public.notifications
   SET message = left(message, length(message) - length('Tap to read what''s changed.'))
                 || 'You can read the full Terms at cerviced.co/legal.'
 WHERE type = 'terms_updated'
   AND message LIKE '%Tap to read what''s changed.';

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261124230000', 'terms_notice_wording')
ON CONFLICT (version) DO NOTHING;

COMMIT;
