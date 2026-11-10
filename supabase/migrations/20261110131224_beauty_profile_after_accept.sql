-- A provider sees a client's Beauty Profile only once they have accepted the
-- booking (user, 2026-11-10).
--
-- Before this, get_client_beauty_profile_for_booking returned the profile for
-- any booking the caller was the provider on, whatever its status: a booking
-- request the provider had not answered yet, one they declined, and one that
-- was cancelled all showed the client's allergies and medical notes. The
-- Privacy Policy had to say so.
--
-- Now only confirmed, in_progress and completed bookings return a row.
-- pending (a request), on_hold (a checkout hold), cancelled (which includes
-- declined), no_show and provider_no_show return nothing. The app reads "no
-- row" as "not shared" and says so, instead of showing an empty profile that
-- would read as "no allergies".
--
-- Redefined from the live definition on 2026-11-10; the only change is the
-- status filter. The md5 guard refuses if live has changed since.
-- APPLIED 2026-11-10 via the Supabase MCP, which recorded it as 20261110131224
-- (authored as 20261110180000; live max was 20261110170000, nothing higher on an open
-- branch). No later migration redefines this function.

BEGIN;

DO $$
BEGIN
  IF md5(pg_get_functiondef('public.get_client_beauty_profile_for_booking(uuid)'::regprocedure))
     <> 'e2684f224d1264fea11af1f3d6f18c92' THEN
    RAISE EXCEPTION 'get_client_beauty_profile_for_booking changed since this migration was written; redefine it from live again.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_client_beauty_profile_for_booking(p_booking_id uuid)
 RETURNS TABLE(service_category text, hair_type text[], scalp_condition text[], hair_goals text[], treatment_history text[], skin_type text[], skin_tone text, skin_concerns text[], sensitive_areas text[], nail_length text[], nail_shape text[], lash_style text[], lash_status text, brow_style text[], brow_condition text[], makeup_coverage text[], makeup_finish text[], makeup_eyes text[], makeup_lips text[], style_vibe text[], allergies text[], medical_notes text, photography_consent boolean)
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

-- CREATE OR REPLACE keeps the existing grants (authenticated only); restated
-- so a replay lands in the same place.
REVOKE ALL ON FUNCTION public.get_client_beauty_profile_for_booking(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_beauty_profile_for_booking(uuid) TO authenticated;

COMMIT;
