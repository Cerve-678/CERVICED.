-- A provider sees only the part of a client's Beauty Profile that fits the
-- service the client booked.
--
-- Before this, get_client_beauty_profile_for_provider(client) returned the
-- whole profile (hair, skin, nails, lashes, brows, makeup, allergies, medical
-- notes) to any provider with a booking from that client, and the app hid the
-- unrelated parts on screen. The data still reached the provider's phone, and
-- the app's filter keyed off the provider's headline category, not the booked
-- service, falling back to everything when that category was unknown.
--
-- Now the database decides. get_client_beauty_profile_for_booking(booking)
-- checks the caller is that booking's provider, works out the booked service's
-- category (the service's own category, then the booking's snapshot, then the
-- provider's headline), and returns NULL for every field that category doesn't
-- get. Allergies, medical notes and photography consent go to every category:
-- they are safety information. The old whole-profile function is dropped.
--
-- Nails gets nail length and shape only, plus the safety fields (user,
-- 2026-11-08). Every other category keeps the fields the app showed it before
-- (Kids: sensitive areas).
-- OTHER still gets everything, as before; an unknown category gets only the
-- safety fields (it used to get everything).
--
-- Apply together with the app change on feat/beauty-profile-by-booked-service:
-- an app build that still calls the old function shows the profile as failed
-- to load once this is applied.
--
-- Also brings the older SQL that defined or granted the old function in line
-- (fix_users_table_pii_leak.sql, manual-apply/20260809_…_hardening.sql), so a
-- replay can't recreate the whole-profile lookup.
--
-- NOT applied. Before applying: take the lock in MIGRATION_OWNER.md, and
-- renumber above live max(version) and above any unapplied migration on an
-- open PR branch.

BEGIN;

-- Which profile fields a booked service's category gets. Internal helper: only
-- the SECURITY DEFINER function below calls it.
CREATE OR REPLACE FUNCTION public.beauty_profile_fields_for_category(p_category text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT ARRAY['allergies', 'medical_notes', 'photography_consent']::text[]
    || CASE upper(coalesce(p_category, ''))
         WHEN 'HAIR' THEN ARRAY['hair_type', 'scalp_condition', 'hair_goals', 'treatment_history', 'style_vibe']
         WHEN 'NAILS' THEN ARRAY['nail_length', 'nail_shape']
         WHEN 'LASHES' THEN ARRAY['lash_style', 'lash_status', 'skin_type', 'skin_concerns', 'sensitive_areas']
         WHEN 'BROWS' THEN ARRAY['brow_style', 'brow_condition', 'skin_type', 'skin_concerns', 'sensitive_areas']
         WHEN 'MUA' THEN ARRAY['skin_type', 'skin_tone', 'skin_concerns', 'makeup_coverage', 'makeup_finish', 'makeup_eyes', 'makeup_lips', 'style_vibe']
         WHEN 'AESTHETICS' THEN ARRAY['skin_type', 'skin_tone', 'skin_concerns', 'sensitive_areas', 'treatment_history']
         WHEN 'MALE' THEN ARRAY['hair_type', 'scalp_condition', 'skin_type', 'skin_tone', 'skin_concerns']
         WHEN 'KIDS' THEN ARRAY['sensitive_areas']
         WHEN 'OTHER' THEN ARRAY[
           'hair_type', 'scalp_condition', 'hair_goals', 'treatment_history',
           'skin_type', 'skin_tone', 'skin_concerns', 'sensitive_areas',
           'nail_length', 'nail_shape', 'lash_style', 'lash_status',
           'brow_style', 'brow_condition', 'makeup_coverage', 'makeup_finish',
           'makeup_eyes', 'makeup_lips', 'style_vibe'
         ]
         ELSE ARRAY[]::text[]
       END;
$$;

REVOKE ALL ON FUNCTION public.beauty_profile_fields_for_category(text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_client_beauty_profile_for_booking(p_booking_id uuid)
RETURNS TABLE(
  service_category text,
  hair_type text, scalp_condition text, hair_goals text[], treatment_history text[],
  skin_type text, skin_tone text, skin_concerns text[], sensitive_areas text[],
  nail_length text, nail_shape text,
  lash_style text, lash_status text, brow_style text, brow_condition text,
  makeup_coverage text, makeup_finish text, makeup_eyes text, makeup_lips text,
  style_vibe text, allergies text[], medical_notes text, photography_consent boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_client uuid;
  v_category text;
  f text[];
BEGIN
  -- Only the provider on this booking gets anything back.
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
    AND p.user_id = auth.uid();

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
$$;

REVOKE ALL ON FUNCTION public.get_client_beauty_profile_for_booking(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_beauty_profile_for_booking(uuid)
  TO authenticated;

-- The whole-profile lookup has no caller left in the app. Without CASCADE, so
-- this fails loudly if anything in the database still depends on it.
DROP FUNCTION IF EXISTS public.get_client_beauty_profile_for_provider(uuid);

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261108110000', 'beauty_profile_shared_by_booked_service')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- VERIFY
--   select has_function_privilege('anon', 'public.get_client_beauty_profile_for_booking(uuid)', 'execute');  → false
--   select has_function_privilege('authenticated', 'public.beauty_profile_fields_for_category(text)', 'execute'); → false
--   select to_regprocedure('public.get_client_beauty_profile_for_provider(uuid)'); → null
--   select public.beauty_profile_fields_for_category('NAILS');
--     → {allergies,medical_notes,photography_consent,nail_length,nail_shape}
--   As a nail provider on a booking: hair/skin/lash/brow/makeup columns are null.
