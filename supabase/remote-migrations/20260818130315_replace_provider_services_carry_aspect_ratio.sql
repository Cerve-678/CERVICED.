-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260818130315
-- Remote name: replace_provider_services_carry_aspect_ratio
-- Do not edit this recovery archive; create a new tracked migration for changes.

-- Carries the new service_images.aspect_ratio through the atomic
-- services-replace RPC. Body is byte-identical to the previously-live
-- definition except for the service_images INSERT, which now writes the
-- measured ratio the app sends alongside each image's url.
--
-- NULLIF(...,'')::numeric so an image posted without a ratio (older app
-- build, or a measurement that failed on device) stores NULL — "not
-- measured" — rather than 0, which the CHECK constraint would reject.
CREATE OR REPLACE FUNCTION public.replace_provider_services(
  p_provider_id uuid,
  p_services    jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_owner      uuid;
  v_svc        jsonb;
  v_service_id uuid;
  v_img        jsonb;
  v_addon      jsonb;
  v_count      int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT user_id INTO v_owner FROM public.providers WHERE id = p_provider_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'provider not found'; END IF;
  IF v_owner <> v_uid THEN RAISE EXCEPTION 'not your provider'; END IF;

  DELETE FROM public.services WHERE provider_id = p_provider_id;

  FOR v_svc IN SELECT * FROM jsonb_array_elements(COALESCE(p_services, '[]'::jsonb))
  LOOP
    INSERT INTO public.services (
      provider_id, category_name, category_description, name, description, price, duration_minutes,
      buffer_before_mins, buffer_after_mins, is_active, sort_order,
      tags, technique_tags, outcome_tags, occasion_tags, trend_names,
      is_pregnancy_safe, patch_test_required, min_age, contraindications,
      aftercare_notes, service_type, hair_types_suitable
    ) VALUES (
      p_provider_id,
      v_svc->>'category_name',
      v_svc->>'category_description',
      v_svc->>'name',
      v_svc->>'description',
      (v_svc->>'price')::numeric,
      (v_svc->>'duration_minutes')::int,
      NULLIF(v_svc->>'buffer_before_mins','')::int,
      NULLIF(v_svc->>'buffer_after_mins','')::int,
      COALESCE((v_svc->>'is_active')::boolean, true),
      COALESCE((v_svc->>'sort_order')::int, v_count),
      CASE WHEN jsonb_typeof(v_svc->'tags')          = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'tags')) END,
      CASE WHEN jsonb_typeof(v_svc->'technique_tags') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'technique_tags')) END,
      CASE WHEN jsonb_typeof(v_svc->'outcome_tags')   = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'outcome_tags')) END,
      CASE WHEN jsonb_typeof(v_svc->'occasion_tags')  = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'occasion_tags')) END,
      CASE WHEN jsonb_typeof(v_svc->'trend_names')    = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'trend_names')) END,
      COALESCE((v_svc->>'is_pregnancy_safe')::boolean, false),
      COALESCE((v_svc->>'patch_test_required')::boolean, false),
      NULLIF(v_svc->>'min_age','')::int,
      CASE WHEN jsonb_typeof(v_svc->'contraindications') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'contraindications')) END,
      v_svc->>'aftercare_notes',
      v_svc->>'service_type',
      CASE WHEN jsonb_typeof(v_svc->'hair_types_suitable') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'hair_types_suitable')) END
    )
    RETURNING id INTO v_service_id;

    FOR v_img IN SELECT * FROM jsonb_array_elements(COALESCE(v_svc->'images', '[]'::jsonb))
    LOOP
      INSERT INTO public.service_images (service_id, url, sort_order, aspect_ratio)
      VALUES (
        v_service_id,
        v_img->>'url',
        COALESCE((v_img->>'sort_order')::int, 0),
        NULLIF(v_img->>'aspect_ratio','')::numeric
      );
    END LOOP;

    FOR v_addon IN SELECT * FROM jsonb_array_elements(COALESCE(v_svc->'add_ons', '[]'::jsonb))
    LOOP
      INSERT INTO public.service_add_ons (service_id, name, price, is_active)
      VALUES (v_service_id, v_addon->>'name', (v_addon->>'price')::numeric, true);
    END LOOP;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_provider_services(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.replace_provider_services(uuid, jsonb) TO authenticated;
