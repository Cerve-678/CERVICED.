-- More Beauty Profile answers become multi-pick (user, 2026-11-09: "allow
-- multiselect in beauty profile", everything including hair type).
--
-- users.hair_type, scalp_condition, nail_length, nail_shape, lash_style,
-- brow_style, brow_condition, makeup_coverage, makeup_finish, makeup_eyes and
-- makeup_lips go from text to text[]. Same pattern as
-- 20261108240000_beauty_profile_skin_type_and_style_vibe_multi_pick.sql:
-- every existing answer is kept as a one-answer list ('4C' -> {4C}), blank
-- stays NULL, and a JSON array written as text becomes that list.
--
-- Skin tone and lash status stay single: each has one true answer.
--
-- Hair type: on 2026-11-08 it stayed single because search matches on it.
-- That matching is Search's own Hair Type filter, a value the client picks
-- in Search and passes to get_providers_availability(p_hair_type text); it
-- compares against providers.hair_types_catered and never reads
-- users.hair_type. So nothing server-side changes for it.
--
-- get_client_beauty_profile_for_booking(uuid) declares these columns as text
-- in RETURNS TABLE, so it is rebuilt FROM ITS LIVE DEFINITION with only those
-- OUT columns changed to text[], its execute grants and comment put back
-- exactly as they were. delete_client_profile() only sets them to NULL, and
-- beauty_profile_fields_for_category(text) only names them as text labels;
-- neither cares about the type. Any OTHER function in public that mentions
-- one of these columns stops the migration. A view depending on one makes the
-- ALTER itself fail.
--
-- App side: feat/beauty-profile-multi-pick-all. Its readers accept both
-- shapes (features/beauty-profile/pickList.ts) and its writers send lists, so
-- merge it once this is applied. Installed builds from before it write plain
-- strings for these columns, which PostgREST rejects for text[]: their Beauty
-- Profile save, and sign-up's hair type, fail until they update.
--
-- Live when written (2026-11-09): max(version) 20261110100000; 18 users rows:
-- 7 with a hair type, 1–3 with each of the others, all single strings, none
-- JSON-shaped; no column defaults.

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
    AND p.prosrc ~ '\m(hair_type|scalp_condition|nail_length|nail_shape|lash_style|brow_style|brow_condition|makeup_coverage|makeup_finish|makeup_eyes|makeup_lips)\M'
    AND p.proname NOT IN (
      'get_client_beauty_profile_for_booking',
      'delete_client_profile',
      'beauty_profile_fields_for_category'
    );
  IF v_unknown IS NOT NULL THEN
    RAISE EXCEPTION 'These beauty profile columns are read by functions this migration does not rebuild: %. Check each one handles text[] first.', v_unknown;
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
  ALTER COLUMN hair_type       TYPE text[] USING pg_temp.to_pick_list(hair_type),
  ALTER COLUMN scalp_condition TYPE text[] USING pg_temp.to_pick_list(scalp_condition),
  ALTER COLUMN nail_length     TYPE text[] USING pg_temp.to_pick_list(nail_length),
  ALTER COLUMN nail_shape      TYPE text[] USING pg_temp.to_pick_list(nail_shape),
  ALTER COLUMN lash_style      TYPE text[] USING pg_temp.to_pick_list(lash_style),
  ALTER COLUMN brow_style      TYPE text[] USING pg_temp.to_pick_list(brow_style),
  ALTER COLUMN brow_condition  TYPE text[] USING pg_temp.to_pick_list(brow_condition),
  ALTER COLUMN makeup_coverage TYPE text[] USING pg_temp.to_pick_list(makeup_coverage),
  ALTER COLUMN makeup_finish   TYPE text[] USING pg_temp.to_pick_list(makeup_finish),
  ALTER COLUMN makeup_eyes     TYPE text[] USING pg_temp.to_pick_list(makeup_eyes),
  ALTER COLUMN makeup_lips     TYPE text[] USING pg_temp.to_pick_list(makeup_lips);

DO $$
DECLARE
  v_sig constant text := 'public.get_client_beauty_profile_for_booking(uuid)';
  v_cols constant text[] := ARRAY[
    'hair_type', 'scalp_condition', 'nail_length', 'nail_shape', 'lash_style',
    'brow_style', 'brow_condition', 'makeup_coverage', 'makeup_finish',
    'makeup_eyes', 'makeup_lips'
  ];
  v_col text;
  v_oid oid;
  v_def text;
  v_old_result text;
  v_new_result text;
  v_comment text;
  v_grantees text[];
  v_grantee text;
BEGIN
  v_oid := to_regprocedure(v_sig);
  IF v_oid IS NULL THEN
    RAISE EXCEPTION '% does not exist', v_sig;
  END IF;

  v_old_result := pg_get_function_result(v_oid);
  v_new_result := v_old_result;
  FOREACH v_col IN ARRAY v_cols LOOP
    IF position(v_col || ' text,' IN v_new_result) = 0 THEN
      RAISE EXCEPTION '% does not return % text as expected: %', v_sig, v_col, v_old_result;
    END IF;
    v_new_result := replace(v_new_result, v_col || ' text,', v_col || ' text[],');
  END LOOP;
  -- The ones that stay single must still be single.
  IF position('skin_tone text,' IN v_new_result) = 0 OR position('lash_status text,' IN v_new_result) = 0 THEN
    RAISE EXCEPTION 'Unexpected result type after rewrite: %', v_new_result;
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

  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', v_sig);
  FOREACH v_grantee IN ARRAY v_grantees LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %s', v_sig, v_grantee);
  END LOOP;
  IF v_comment IS NOT NULL THEN
    EXECUTE format('COMMENT ON FUNCTION %s IS %L', v_sig, v_comment);
  END IF;

  RAISE NOTICE 'Rebuilt % returning %; execute granted to %', v_sig, v_new_result, v_grantees;
END
$$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261110120000', 'beauty_profile_more_multi_pick')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- VERIFY
--   select column_name, udt_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'users'
--      and column_name in ('hair_type','scalp_condition','nail_length','nail_shape','lash_style',
--        'brow_style','brow_condition','makeup_coverage','makeup_finish','makeup_eyes','makeup_lips',
--        'skin_tone','lash_status');   → _text for the eleven, text for skin_tone and lash_status
--   select pg_get_function_result('public.get_client_beauty_profile_for_booking(uuid)'::regprocedure);
--   select has_function_privilege('anon', 'public.get_client_beauty_profile_for_booking(uuid)', 'execute');          → false
--   select has_function_privilege('authenticated', 'public.get_client_beauty_profile_for_booking(uuid)', 'execute'); → true
