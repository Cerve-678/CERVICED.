-- Beauty Profile: porosity, hair thickness, undertone, eye shape, lash curl
-- (owner, 2026-11-27: "add things like lash map … low porosity, high
-- porosity in hair etc.", from what people search on Pinterest about
-- themselves).
--
-- Five new answers on the client's own users row, all optional:
--   hair_porosity  text    Low / Medium / High porosity, Not sure
--   hair_thickness text    Fine / Medium / Thick / coarse
--   skin_undertone text    Cool / Warm / Neutral / Olive, Not sure
--   eye_shape      text[]  Almond, Hooded, Monolid… (a lash map's starting point)
--   lash_curl      text    J, B, C, CC, D, L / M, Let my tech decide
-- New columns get the users table's existing grants and RLS (own row only).
--
-- Shared with a provider exactly like the existing answers: only on an
-- accepted booking, and only for the categories that use them
-- (beauty_profile_fields_for_category):
--   porosity, thickness  HAIR, MALE, OTHER
--   undertone            HAIR (colour), BROWS (tint), MUA, OTHER
--   eye shape            LASHES, BROWS, MUA, OTHER
--   lash curl            LASHES, OTHER
--
-- Both profile RPCs return more columns, so each is dropped and recreated (a
-- RETURNS TABLE change can't be replaced in place) and given back its live
-- grants: authenticated and service_role execute, PUBLIC and anon don't.
-- All three functions are redefined from live on 2026-11-27; the md5 guards
-- refuse if any has changed since.

BEGIN;

DO $$
BEGIN
  IF md5(pg_get_functiondef('public.beauty_profile_fields_for_category(text)'::regprocedure))
     <> '0f975e79bdf906bee7277a9e59e99f37' THEN
    RAISE EXCEPTION 'beauty_profile_fields_for_category changed since this migration was written; redefine it from live again.';
  END IF;
  IF md5(pg_get_functiondef('public.get_client_beauty_profile_for_booking(uuid)'::regprocedure))
     <> '3b40eaf6fa463b9a9838367a28ef9902' THEN
    RAISE EXCEPTION 'get_client_beauty_profile_for_booking changed since this migration was written; redefine it from live again.';
  END IF;
  IF md5(pg_get_functiondef('public.get_client_beauty_profile_for_provider(uuid)'::regprocedure))
     <> 'dfdaa9d23069e11577b6f131c9680883' THEN
    RAISE EXCEPTION 'get_client_beauty_profile_for_provider changed since this migration was written; redefine it from live again.';
  END IF;
END $$;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS hair_porosity text,
  ADD COLUMN IF NOT EXISTS hair_thickness text,
  ADD COLUMN IF NOT EXISTS skin_undertone text,
  ADD COLUMN IF NOT EXISTS eye_shape text[],
  ADD COLUMN IF NOT EXISTS lash_curl text;

CREATE OR REPLACE FUNCTION public.beauty_profile_fields_for_category(p_category text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT ARRAY['allergies', 'medical_notes', 'photography_consent']::text[]
    || CASE upper(coalesce(p_category, ''))
         WHEN 'HAIR' THEN ARRAY['hair_type', 'hair_porosity', 'hair_thickness', 'scalp_condition', 'hair_goals', 'treatment_history', 'skin_undertone', 'style_vibe']
         WHEN 'NAILS' THEN ARRAY['nail_length', 'nail_shape', 'nail_condition', 'nail_service', 'nail_style', 'nail_colours']
         WHEN 'LASHES' THEN ARRAY['eye_shape', 'lash_style', 'lash_status', 'lash_curl', 'skin_type', 'skin_concerns', 'sensitive_areas']
         WHEN 'BROWS' THEN ARRAY['eye_shape', 'brow_style', 'brow_condition', 'skin_type', 'skin_undertone', 'skin_concerns', 'sensitive_areas']
         WHEN 'MUA' THEN ARRAY['skin_type', 'skin_tone', 'skin_undertone', 'skin_concerns', 'eye_shape', 'makeup_coverage', 'makeup_finish', 'makeup_eyes', 'makeup_lips', 'style_vibe']
         WHEN 'AESTHETICS' THEN ARRAY['skin_type', 'skin_tone', 'skin_concerns', 'sensitive_areas', 'treatment_history']
         WHEN 'MALE' THEN ARRAY['hair_type', 'hair_porosity', 'hair_thickness', 'scalp_condition', 'skin_type', 'skin_tone', 'skin_concerns']
         WHEN 'KIDS' THEN ARRAY['sensitive_areas']
         WHEN 'OTHER' THEN ARRAY[
           'hair_type', 'hair_porosity', 'hair_thickness', 'scalp_condition', 'hair_goals', 'treatment_history',
           'skin_type', 'skin_tone', 'skin_undertone', 'skin_concerns', 'sensitive_areas',
           'nail_length', 'nail_shape', 'nail_condition', 'nail_service', 'nail_style', 'nail_colours',
           'eye_shape', 'lash_style', 'lash_status', 'lash_curl',
           'brow_style', 'brow_condition', 'makeup_coverage', 'makeup_finish',
           'makeup_eyes', 'makeup_lips', 'style_vibe'
         ]
         ELSE ARRAY[]::text[]
       END;
$function$;

DROP FUNCTION public.get_client_beauty_profile_for_booking(uuid);

CREATE FUNCTION public.get_client_beauty_profile_for_booking(p_booking_id uuid)
 RETURNS TABLE(service_category text, hair_type text[], hair_porosity text, hair_thickness text, scalp_condition text[], hair_goals text[], treatment_history text[], skin_type text[], skin_tone text, skin_undertone text, skin_concerns text[], sensitive_areas text[], nail_length text[], nail_shape text[], nail_condition text[], nail_service text[], nail_style text[], nail_colours text[], eye_shape text[], lash_style text[], lash_status text, lash_curl text, brow_style text[], brow_condition text[], makeup_coverage text[], makeup_finish text[], makeup_eyes text[], makeup_lips text[], style_vibe text[], allergies text[], medical_notes text, photography_consent boolean)
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
         CASE WHEN 'hair_porosity' = ANY (f) THEN u.hair_porosity END,
         CASE WHEN 'hair_thickness' = ANY (f) THEN u.hair_thickness END,
         CASE WHEN 'scalp_condition' = ANY (f) THEN u.scalp_condition END,
         CASE WHEN 'hair_goals' = ANY (f) THEN u.hair_goals END,
         CASE WHEN 'treatment_history' = ANY (f) THEN u.treatment_history END,
         CASE WHEN 'skin_type' = ANY (f) THEN u.skin_type END,
         CASE WHEN 'skin_tone' = ANY (f) THEN u.skin_tone END,
         CASE WHEN 'skin_undertone' = ANY (f) THEN u.skin_undertone END,
         CASE WHEN 'skin_concerns' = ANY (f) THEN u.skin_concerns END,
         CASE WHEN 'sensitive_areas' = ANY (f) THEN u.sensitive_areas END,
         CASE WHEN 'nail_length' = ANY (f) THEN u.nail_length END,
         CASE WHEN 'nail_shape' = ANY (f) THEN u.nail_shape END,
         CASE WHEN 'nail_condition' = ANY (f) THEN u.nail_condition END,
         CASE WHEN 'nail_service' = ANY (f) THEN u.nail_service END,
         CASE WHEN 'nail_style' = ANY (f) THEN u.nail_style END,
         CASE WHEN 'nail_colours' = ANY (f) THEN u.nail_colours END,
         CASE WHEN 'eye_shape' = ANY (f) THEN u.eye_shape END,
         CASE WHEN 'lash_style' = ANY (f) THEN u.lash_style END,
         CASE WHEN 'lash_status' = ANY (f) THEN u.lash_status END,
         CASE WHEN 'lash_curl' = ANY (f) THEN u.lash_curl END,
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

DROP FUNCTION public.get_client_beauty_profile_for_provider(uuid);

CREATE FUNCTION public.get_client_beauty_profile_for_provider(p_client_id uuid)
 RETURNS TABLE(service_categories text[], hair_type text[], hair_porosity text, hair_thickness text, scalp_condition text[], hair_goals text[], treatment_history text[], skin_type text[], skin_tone text, skin_undertone text, skin_concerns text[], sensitive_areas text[], nail_length text[], nail_shape text[], nail_condition text[], nail_service text[], nail_style text[], nail_colours text[], eye_shape text[], lash_style text[], lash_status text, lash_curl text, brow_style text[], brow_condition text[], makeup_coverage text[], makeup_finish text[], makeup_eyes text[], makeup_lips text[], style_vibe text[], allergies text[], medical_notes text, photography_consent boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_categories text[];
  f text[];
BEGIN
  -- Every category this provider has an accepted booking with this client
  -- in. Same category pick as get_client_beauty_profile_for_booking: the
  -- first of service, snapshot, provider category that is a real category.
  SELECT array_agg(DISTINCT cat)
    INTO v_categories
  FROM (
    SELECT coalesce(
           (SELECT c FROM unnest(ARRAY[
              upper(s.service_category::text),
              upper(b.service_category_snapshot),
              upper(p.service_category::text)
            ]) WITH ORDINALITY AS t(c, n)
            WHERE c IN ('HAIR', 'NAILS', 'LASHES', 'BROWS', 'MUA', 'AESTHETICS', 'MALE', 'KIDS', 'OTHER')
            ORDER BY n
            LIMIT 1),
           'UNKNOWN') AS cat
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
    LEFT JOIN public.services s ON s.id = b.service_id
    WHERE b.user_id = p_client_id
      AND p.user_id = auth.uid()
      AND b.status IN ('confirmed', 'in_progress', 'completed')
  ) cats;

  IF v_categories IS NULL THEN
    RETURN;
  END IF;

  SELECT coalesce(array_agg(DISTINCT field), '{}')
    INTO f
  FROM unnest(v_categories) AS c(cat),
       unnest(public.beauty_profile_fields_for_category(c.cat)) AS x(field);

  RETURN QUERY
  SELECT v_categories,
         CASE WHEN 'hair_type' = ANY (f) THEN u.hair_type END,
         CASE WHEN 'hair_porosity' = ANY (f) THEN u.hair_porosity END,
         CASE WHEN 'hair_thickness' = ANY (f) THEN u.hair_thickness END,
         CASE WHEN 'scalp_condition' = ANY (f) THEN u.scalp_condition END,
         CASE WHEN 'hair_goals' = ANY (f) THEN u.hair_goals END,
         CASE WHEN 'treatment_history' = ANY (f) THEN u.treatment_history END,
         CASE WHEN 'skin_type' = ANY (f) THEN u.skin_type END,
         CASE WHEN 'skin_tone' = ANY (f) THEN u.skin_tone END,
         CASE WHEN 'skin_undertone' = ANY (f) THEN u.skin_undertone END,
         CASE WHEN 'skin_concerns' = ANY (f) THEN u.skin_concerns END,
         CASE WHEN 'sensitive_areas' = ANY (f) THEN u.sensitive_areas END,
         CASE WHEN 'nail_length' = ANY (f) THEN u.nail_length END,
         CASE WHEN 'nail_shape' = ANY (f) THEN u.nail_shape END,
         CASE WHEN 'nail_condition' = ANY (f) THEN u.nail_condition END,
         CASE WHEN 'nail_service' = ANY (f) THEN u.nail_service END,
         CASE WHEN 'nail_style' = ANY (f) THEN u.nail_style END,
         CASE WHEN 'nail_colours' = ANY (f) THEN u.nail_colours END,
         CASE WHEN 'eye_shape' = ANY (f) THEN u.eye_shape END,
         CASE WHEN 'lash_style' = ANY (f) THEN u.lash_style END,
         CASE WHEN 'lash_status' = ANY (f) THEN u.lash_status END,
         CASE WHEN 'lash_curl' = ANY (f) THEN u.lash_curl END,
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
  WHERE u.id = p_client_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_client_beauty_profile_for_provider(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_beauty_profile_for_provider(uuid) TO authenticated, service_role;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261127110000', 'beauty_profile_porosity_eye_shape')
ON CONFLICT DO NOTHING;

COMMIT;
