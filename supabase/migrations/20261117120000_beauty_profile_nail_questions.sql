-- Better nail questions in the Beauty Profile (owner, 2026-11-17: "nails
-- should have better questions, add more").
--
-- Four new answers on the client's own users row, all optional multi-picks:
-- nail_condition (their natural nails), nail_service (what they usually get:
-- gel, BIAB, acrylic…), nail_style (French, chrome, art…) and nail_colours.
-- They're shared with a provider exactly like the existing nail answers:
-- only on an accepted NAILS (or OTHER) booking, through
-- beauty_profile_fields_for_category and get_client_beauty_profile_for_booking.
-- New columns get the users table's existing grants and RLS (own row only).
--
-- get_client_beauty_profile_for_booking returns four more columns, so it is
-- dropped and recreated (a RETURNS TABLE change can't be replaced in place),
-- then given back exactly its old grants: authenticated and service_role
-- execute, PUBLIC and anon don't. Both functions are redefined from live on
-- 2026-11-17; the md5 guards refuse if either has changed since.

BEGIN;

DO $$
BEGIN
  IF md5(pg_get_functiondef('public.get_client_beauty_profile_for_booking(uuid)'::regprocedure))
     <> '6ee6ddfa3201d25941d746dc464f1d45' THEN
    RAISE EXCEPTION 'get_client_beauty_profile_for_booking changed since this migration was written; redefine it from live again.';
  END IF;
  IF md5(pg_get_functiondef('public.beauty_profile_fields_for_category(text)'::regprocedure))
     <> '74cfaa79b67f6f18a7258cb95717e165' THEN
    RAISE EXCEPTION 'beauty_profile_fields_for_category changed since this migration was written; redefine it from live again.';
  END IF;
END $$;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS nail_condition text[],
  ADD COLUMN IF NOT EXISTS nail_service text[],
  ADD COLUMN IF NOT EXISTS nail_style text[],
  ADD COLUMN IF NOT EXISTS nail_colours text[];

CREATE OR REPLACE FUNCTION public.beauty_profile_fields_for_category(p_category text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT ARRAY['allergies', 'medical_notes', 'photography_consent']::text[]
    || CASE upper(coalesce(p_category, ''))
         WHEN 'HAIR' THEN ARRAY['hair_type', 'scalp_condition', 'hair_goals', 'treatment_history', 'style_vibe']
         WHEN 'NAILS' THEN ARRAY['nail_length', 'nail_shape', 'nail_condition', 'nail_service', 'nail_style', 'nail_colours']
         WHEN 'LASHES' THEN ARRAY['lash_style', 'lash_status', 'skin_type', 'skin_concerns', 'sensitive_areas']
         WHEN 'BROWS' THEN ARRAY['brow_style', 'brow_condition', 'skin_type', 'skin_concerns', 'sensitive_areas']
         WHEN 'MUA' THEN ARRAY['skin_type', 'skin_tone', 'skin_concerns', 'makeup_coverage', 'makeup_finish', 'makeup_eyes', 'makeup_lips', 'style_vibe']
         WHEN 'AESTHETICS' THEN ARRAY['skin_type', 'skin_tone', 'skin_concerns', 'sensitive_areas', 'treatment_history']
         WHEN 'MALE' THEN ARRAY['hair_type', 'scalp_condition', 'skin_type', 'skin_tone', 'skin_concerns']
         WHEN 'KIDS' THEN ARRAY['sensitive_areas']
         WHEN 'OTHER' THEN ARRAY[
           'hair_type', 'scalp_condition', 'hair_goals', 'treatment_history',
           'skin_type', 'skin_tone', 'skin_concerns', 'sensitive_areas',
           'nail_length', 'nail_shape', 'nail_condition', 'nail_service', 'nail_style', 'nail_colours',
           'lash_style', 'lash_status',
           'brow_style', 'brow_condition', 'makeup_coverage', 'makeup_finish',
           'makeup_eyes', 'makeup_lips', 'style_vibe'
         ]
         ELSE ARRAY[]::text[]
       END;
$function$;

DROP FUNCTION public.get_client_beauty_profile_for_booking(uuid);

CREATE FUNCTION public.get_client_beauty_profile_for_booking(p_booking_id uuid)
 RETURNS TABLE(service_category text, hair_type text[], scalp_condition text[], hair_goals text[], treatment_history text[], skin_type text[], skin_tone text, skin_concerns text[], sensitive_areas text[], nail_length text[], nail_shape text[], nail_condition text[], nail_service text[], nail_style text[], nail_colours text[], lash_style text[], lash_status text, brow_style text[], brow_condition text[], makeup_coverage text[], makeup_finish text[], makeup_eyes text[], makeup_lips text[], style_vibe text[], allergies text[], medical_notes text, photography_consent boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_client uuid;
  v_category text;
  f text[];
BEGIN
  -- Only the provider on this booking gets anything back, and only once they
  -- have accepted it: a request, a declined or cancelled booking, or a
  -- checkout hold shares nothing.
  -- The first of these that is a real category. The snapshot once held a
  -- provider's menu heading ("Acrylic") instead, which would otherwise win
  -- the coalesce and leave the provider with the safety fields only.
  SELECT b.user_id,
         coalesce(
           (SELECT c FROM unnest(ARRAY[
              upper(s.service_category::text),
              upper(b.service_category_snapshot),
              upper(p.service_category::text)
            ]) WITH ORDINALITY AS t(c, n)
            WHERE c IN ('HAIR', 'NAILS', 'LASHES', 'BROWS', 'MUA', 'AESTHETICS', 'MALE', 'KIDS', 'OTHER')
            ORDER BY n
            LIMIT 1),
           'UNKNOWN')
    INTO v_client, v_category
  FROM public.bookings b
  JOIN public.providers p ON p.id = b.provider_id
  LEFT JOIN public.services s ON s.id = b.service_id
  WHERE b.id = p_booking_id
    AND p.user_id = auth.uid()
    AND b.status IN ('confirmed', 'in_progress', 'completed');

  IF v_client IS NULL THEN
    RETURN;
  END IF;

  f := public.beauty_profile_fields_for_category(v_category);

  RETURN QUERY
  SELECT v_category,
         CASE WHEN 'hair_type' = ANY (f) THEN u.hair_type END,
         CASE WHEN 'scalp_condition' = ANY (f) THEN u.scalp_condition END,
         CASE WHEN 'hair_goals' = ANY (f) THEN u.hair_goals END,
         CASE WHEN 'treatment_history' = ANY (f) THEN u.treatment_history END,
         CASE WHEN 'skin_type' = ANY (f) THEN u.skin_type END,
         CASE WHEN 'skin_tone' = ANY (f) THEN u.skin_tone END,
         CASE WHEN 'skin_concerns' = ANY (f) THEN u.skin_concerns END,
         CASE WHEN 'sensitive_areas' = ANY (f) THEN u.sensitive_areas END,
         CASE WHEN 'nail_length' = ANY (f) THEN u.nail_length END,
         CASE WHEN 'nail_shape' = ANY (f) THEN u.nail_shape END,
         CASE WHEN 'nail_condition' = ANY (f) THEN u.nail_condition END,
         CASE WHEN 'nail_service' = ANY (f) THEN u.nail_service END,
         CASE WHEN 'nail_style' = ANY (f) THEN u.nail_style END,
         CASE WHEN 'nail_colours' = ANY (f) THEN u.nail_colours END,
         CASE WHEN 'lash_style' = ANY (f) THEN u.lash_style END,
         CASE WHEN 'lash_status' = ANY (f) THEN u.lash_status END,
         CASE WHEN 'brow_style' = ANY (f) THEN u.brow_style END,
         CASE WHEN 'brow_condition' = ANY (f) THEN u.brow_condition END,
         CASE WHEN 'makeup_coverage' = ANY (f) THEN u.makeup_coverage END,
         CASE WHEN 'makeup_finish' = ANY (f) THEN u.makeup_finish END,
         CASE WHEN 'makeup_eyes' = ANY (f) THEN u.makeup_eyes END,
         CASE WHEN 'makeup_lips' = ANY (f) THEN u.makeup_lips END,
         CASE WHEN 'style_vibe' = ANY (f) THEN u.style_vibe END,
         u.allergies,
         u.medical_notes,
         u.photography_consent
  FROM public.users u
  WHERE u.id = v_client;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_client_beauty_profile_for_booking(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_beauty_profile_for_booking(uuid) TO authenticated, service_role;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261117120000', 'beauty_profile_nail_questions')
ON CONFLICT DO NOTHING;

COMMIT;
