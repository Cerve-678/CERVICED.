-- Skin type and style vibe become multi-pick (user, 2026-11-08): a client can
-- pick more than one in sign-up and in the Beauty Profile editor.
--
-- users.skin_type and users.style_vibe go from text to text[]. Every existing
-- answer is kept as a one-answer list ('Oily' -> {Oily}); blank stays NULL.
-- A value that is a JSON array written as text (what an app build that sends a
-- list would leave in a text column, if it ran before this) becomes that list.
--
-- Hair type stays single: it is one classification that search and
-- get_providers_availability(p_hair_type text) match against a provider's
-- hair_types_catered.
--
-- The functions that hand these columns to a provider declare them as text in
-- RETURNS TABLE, so after the type change they would fail at call time
-- ("structure of query does not match function result type"). Each one that
-- exists at apply time is rebuilt FROM ITS LIVE DEFINITION
-- (pg_get_functiondef) with only those two OUT columns changed to text[], and
-- its execute grants and comment put back exactly as they were:
--   * get_client_beauty_profile_for_booking(uuid) — PR #342 (applied as
--     20261108110000), the current provider read.
--   * get_client_beauty_profile_for_provider(uuid) — the older whole-profile
--     read that #342 drops; handled too, in case it still exists.
-- So this works whichever of the two is live, and must be applied AFTER #342's
-- migration (it is numbered above it). If #342's migration were applied after
-- this one, its CREATE would declare text again and the provider read would
-- fail at call time — don't apply them in that order.
--
-- delete_client_profile() sets both columns to NULL, which is fine for text[].
-- Any OTHER function in public that mentions either column stops the
-- migration, so nothing reads them as a scalar unnoticed. A view that depends
-- on either column makes the ALTER itself fail.
--
-- App side: feat/beauty-profile-multi-pick. Its readers accept both shapes
-- (features/beauty-profile/pickList.ts), but its writers send lists, so merge
-- it only once this is applied.
--
-- App builds already installed (before that branch) write a plain string,
-- which PostgREST rejects for a text[] column: their Beauty Profile save,
-- sign-up switch and email-verification insert fail once this is applied.
-- Apply it together with the release that carries the branch.
--
-- Live when written (2026-11-08): max(version) 20261106190048; only
-- get_client_beauty_profile_for_provider exists; 19 users rows, 8 with a skin
-- type and 7 with a style vibe, all single strings (vibes include 'Minimal'
-- and 'Edgy' from the old sign-up list, which the editor still shows).
--
-- NOT applied. Before applying: take the lock in MIGRATION_OWNER.md, and
-- renumber above live max(version) and above any unapplied migration on an
-- open PR branch.

BEGIN;

DO $$
DECLARE
  v_unknown text;
BEGIN
  SELECT string_agg(DISTINCT p.proname, ', ')
    INTO v_unknown
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosrc ~ '\m(skin_type|style_vibe)\M'
    AND p.proname NOT IN (
      'get_client_beauty_profile_for_booking',
      'get_client_beauty_profile_for_provider',
      'delete_client_profile'
    );
  IF v_unknown IS NOT NULL THEN
    RAISE EXCEPTION 'skin_type/style_vibe are read by functions this migration does not rebuild: %. Check each one handles text[] first.', v_unknown;
  END IF;
END
$$;

CREATE FUNCTION pg_temp.to_pick_list(p text)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text := btrim(p);
  v_out text[];
BEGIN
  IF v IS NULL OR v = '' THEN
    RETURN NULL;
  END IF;
  IF left(v, 1) = '[' THEN
    BEGIN
      SELECT array_agg(btrim(e) ORDER BY i)
        INTO v_out
      FROM jsonb_array_elements_text(v::jsonb) WITH ORDINALITY AS t(e, i)
      WHERE btrim(e) <> '';
      RETURN v_out;
    EXCEPTION WHEN others THEN
      RETURN ARRAY[v];
    END;
  END IF;
  RETURN ARRAY[v];
END;
$$;

ALTER TABLE public.users
  ALTER COLUMN skin_type  TYPE text[] USING pg_temp.to_pick_list(skin_type),
  ALTER COLUMN style_vibe TYPE text[] USING pg_temp.to_pick_list(style_vibe);

DO $$
DECLARE
  v_sig text;
  v_oid oid;
  v_def text;
  v_old_result text;
  v_new_result text;
  v_comment text;
  v_grantees text[];
  v_grantee text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.get_client_beauty_profile_for_booking(uuid)',
    'public.get_client_beauty_profile_for_provider(uuid)'
  ] LOOP
    v_oid := to_regprocedure(v_sig);
    CONTINUE WHEN v_oid IS NULL;

    v_old_result := pg_get_function_result(v_oid);
    v_new_result := replace(replace(v_old_result,
      'skin_type text,',  'skin_type text[],'),
      'style_vibe text,', 'style_vibe text[],');
    IF v_new_result = v_old_result
       OR position('skin_type text[],' IN v_new_result) = 0
       OR position('style_vibe text[],' IN v_new_result) = 0 THEN
      RAISE EXCEPTION '% does not return skin_type text and style_vibe text as expected: %', v_sig, v_old_result;
    END IF;

    v_def := pg_get_functiondef(v_oid);
    IF position('RETURNS ' || v_old_result IN v_def) = 0 THEN
      RAISE EXCEPTION 'Could not find the RETURNS clause in the live definition of %', v_sig;
    END IF;
    v_def := replace(v_def, 'RETURNS ' || v_old_result, 'RETURNS ' || v_new_result);

    v_comment := obj_description(v_oid, 'pg_proc');
    SELECT coalesce(array_agg(CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(r.rolname) END), '{}')
      INTO v_grantees
    FROM aclexplode(coalesce(
           (SELECT proacl FROM pg_proc WHERE oid = v_oid),
           acldefault('f', (SELECT proowner FROM pg_proc WHERE oid = v_oid)))) a
    LEFT JOIN pg_roles r ON r.oid = a.grantee
    WHERE a.privilege_type = 'EXECUTE';

    -- A changed OUT column type needs DROP + CREATE; CREATE OR REPLACE refuses.
    -- No CASCADE: fails loudly if anything depends on the function.
    EXECUTE format('DROP FUNCTION %s', v_sig);
    EXECUTE v_def;

    -- Supabase's default privileges grant a new public function to anon,
    -- authenticated and service_role; clear those too, then put back exactly
    -- what the live function had (today: authenticated, service_role, owner).
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', v_sig);
    FOREACH v_grantee IN ARRAY v_grantees LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %s', v_sig, v_grantee);
    END LOOP;
    IF v_comment IS NOT NULL THEN
      EXECUTE format('COMMENT ON FUNCTION %s IS %L', v_sig, v_comment);
    END IF;

    RAISE NOTICE 'Rebuilt % returning %; execute granted to %', v_sig, v_new_result, v_grantees;
  END LOOP;
END
$$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261108170000', 'beauty_profile_skin_type_and_style_vibe_multi_pick')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- VERIFY
--   select data_type, udt_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'users'
--      and column_name in ('skin_type', 'style_vibe');            → ARRAY / _text, both
--   select count(*) from public.users where skin_type = '{}' or style_vibe = '{}';  → 0 straight after
--   select pg_get_function_result('public.get_client_beauty_profile_for_booking(uuid)'::regprocedure);
--     → ... skin_type text[], ... style_vibe text[], ...
--   select has_function_privilege('anon', 'public.get_client_beauty_profile_for_booking(uuid)', 'execute');  → false
--   select has_function_privilege('authenticated', 'public.get_client_beauty_profile_for_booking(uuid)', 'execute');  → true
--   As a provider on a booking: the skin_type / style_vibe columns come back as arrays.
