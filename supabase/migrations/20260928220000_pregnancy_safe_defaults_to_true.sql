-- Unspecified pregnancy-safety now means SAFE, on the WRITE side too.
--
-- The read side already treats a null/absent is_pregnancy_safe as safe:
-- prepare_checkout's gate is `is_pregnancy_safe = false` (an explicit false),
-- the profile mapper and registration service both read `?? true`, and
-- getServiceSafetyFlags reads `!== false`. The write side was the outlier —
-- the column default and replace_provider_services' COALESCE fallback both
-- landed an unspecified value as `false`, so a service created by any path
-- that didn't send the field became "unsafe in pregnancy" and got flagged in
-- the cart. This aligns the write default with every read of the column:
-- a service is unsafe in pregnancy ONLY when a provider explicitly turns on
-- "Not Safe During Pregnancy".
--
-- The in-app service editor already sends `is_pregnancy_safe: svc.isPregnancySafe ?? true`
-- on every save, so the COALESCE fallback below only fires for a payload that
-- omits the field entirely — this is a defensive alignment, not a change to
-- the normal app path. patch_test_required is deliberately left defaulting to
-- false: a treatment isn't patch-test-required unless it's explicitly said to be.
--
-- Existing bad rows are handled separately by a one-off backfill
-- (update ... set is_pregnancy_safe = true where is_pregnancy_safe is distinct from true);
-- this migration only governs rows written from here on.

ALTER TABLE public.services
  ALTER COLUMN is_pregnancy_safe SET DEFAULT true;

-- Reproduced verbatim from the verified-live pg_get_functiondef, with ONLY the
-- two is_pregnancy_safe COALESCE fallbacks changed false -> true (UPDATE branch
-- and INSERT branch). SET search_path preserved exactly.
CREATE OR REPLACE FUNCTION public.replace_provider_services(p_provider_id uuid, p_services jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid              uuid := auth.uid();
  v_owner            uuid;
  v_svc              jsonb;
  v_service_id       uuid;
  v_incoming_id      uuid;
  v_img              jsonb;
  v_addon            jsonb;
  v_addon_id         uuid;
  v_count            int := 0;
  v_kept_service_ids uuid[] := '{}';
  v_kept_addon_ids   uuid[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT user_id INTO v_owner FROM public.providers WHERE id = p_provider_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'provider not found'; END IF;
  IF v_owner <> v_uid THEN RAISE EXCEPTION 'not your provider'; END IF;

  FOR v_svc IN SELECT * FROM jsonb_array_elements(COALESCE(p_services, '[]'::jsonb))
  LOOP
    v_incoming_id := NULLIF(v_svc->>'id', '')::uuid;

    IF v_incoming_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.services WHERE id = v_incoming_id AND provider_id = p_provider_id
    ) THEN
      UPDATE public.services SET
        category_name         = v_svc->>'category_name',
        service_category      = v_svc->>'service_category',
        category_description  = v_svc->>'category_description',
        name                  = v_svc->>'name',
        description           = v_svc->>'description',
        price                 = (v_svc->>'price')::numeric,
        duration_minutes      = (v_svc->>'duration_minutes')::int,
        buffer_before_mins    = NULLIF(v_svc->>'buffer_before_mins','')::int,
        buffer_after_mins     = NULLIF(v_svc->>'buffer_after_mins','')::int,
        is_active             = COALESCE((v_svc->>'is_active')::boolean, true),
        sort_order            = COALESCE((v_svc->>'sort_order')::int, v_count),
        tags                  = CASE WHEN jsonb_typeof(v_svc->'tags')          = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'tags')) END,
        technique_tags        = CASE WHEN jsonb_typeof(v_svc->'technique_tags') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'technique_tags')) END,
        outcome_tags          = CASE WHEN jsonb_typeof(v_svc->'outcome_tags')   = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'outcome_tags')) END,
        occasion_tags         = CASE WHEN jsonb_typeof(v_svc->'occasion_tags')  = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'occasion_tags')) END,
        trend_names           = CASE WHEN jsonb_typeof(v_svc->'trend_names')    = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'trend_names')) END,
        is_pregnancy_safe     = COALESCE((v_svc->>'is_pregnancy_safe')::boolean, true),
        patch_test_required   = COALESCE((v_svc->>'patch_test_required')::boolean, false),
        min_age               = NULLIF(v_svc->>'min_age','')::int,
        contraindications     = CASE WHEN jsonb_typeof(v_svc->'contraindications') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'contraindications')) END,
        aftercare_notes       = v_svc->>'aftercare_notes',
        service_type          = v_svc->>'service_type',
        hair_types_suitable   = CASE WHEN jsonb_typeof(v_svc->'hair_types_suitable') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'hair_types_suitable')) END,
        skin_tones_suitable   = CASE WHEN v_svc ? 'skin_tones_suitable' THEN
          CASE WHEN jsonb_typeof(v_svc->'skin_tones_suitable') = 'array'
            THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'skin_tones_suitable')) END
          ELSE skin_tones_suitable END,
        audience              = v_svc->>'audience'
      WHERE id = v_incoming_id;
      v_service_id := v_incoming_id;
    ELSE
      INSERT INTO public.services (
        provider_id, category_name, service_category, category_description, name, description, price, duration_minutes,
        buffer_before_mins, buffer_after_mins, is_active, sort_order,
        tags, technique_tags, outcome_tags, occasion_tags, trend_names,
        is_pregnancy_safe, patch_test_required, min_age, contraindications,
        aftercare_notes, service_type, hair_types_suitable, skin_tones_suitable, audience
      ) VALUES (
        p_provider_id,
        v_svc->>'category_name',
        v_svc->>'service_category',
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
        COALESCE((v_svc->>'is_pregnancy_safe')::boolean, true),
        COALESCE((v_svc->>'patch_test_required')::boolean, false),
        NULLIF(v_svc->>'min_age','')::int,
        CASE WHEN jsonb_typeof(v_svc->'contraindications') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'contraindications')) END,
        v_svc->>'aftercare_notes',
        v_svc->>'service_type',
        CASE WHEN jsonb_typeof(v_svc->'hair_types_suitable') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'hair_types_suitable')) END,
        CASE WHEN jsonb_typeof(v_svc->'skin_tones_suitable') = 'array'
          THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'skin_tones_suitable')) END,
        v_svc->>'audience'
      )
      RETURNING id INTO v_service_id;
    END IF;

    v_kept_service_ids := v_kept_service_ids || v_service_id;

    DELETE FROM public.service_images WHERE service_id = v_service_id;
    FOR v_img IN SELECT * FROM jsonb_array_elements(COALESCE(v_svc->'images', '[]'::jsonb))
    LOOP
      INSERT INTO public.service_images (service_id, url, sort_order, aspect_ratio, fit)
      VALUES (
        v_service_id,
        v_img->>'url',
        COALESCE((v_img->>'sort_order')::int, 0),
        NULLIF(v_img->>'aspect_ratio','')::numeric,
        COALESCE(NULLIF(v_img->>'fit',''), 'cover')
      );
    END LOOP;

    v_kept_addon_ids := '{}';
    FOR v_addon IN SELECT * FROM jsonb_array_elements(COALESCE(v_svc->'add_ons', '[]'::jsonb))
    LOOP
      v_addon_id := NULLIF(v_addon->>'id', '')::uuid;

      IF v_addon_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.service_add_ons WHERE id = v_addon_id AND service_id = v_service_id
      ) THEN
        UPDATE public.service_add_ons SET
          name     = v_addon->>'name',
          price    = (v_addon->>'price')::numeric,
          is_active = true
        WHERE id = v_addon_id;
      ELSE
        INSERT INTO public.service_add_ons (service_id, name, price, is_active)
        VALUES (v_service_id, v_addon->>'name', (v_addon->>'price')::numeric, true)
        RETURNING id INTO v_addon_id;
      END IF;

      v_kept_addon_ids := v_kept_addon_ids || v_addon_id;
    END LOOP;

    DELETE FROM public.service_add_ons
     WHERE service_id = v_service_id
       AND NOT (id = ANY(v_kept_addon_ids));

    v_count := v_count + 1;
  END LOOP;

  DELETE FROM public.services
   WHERE provider_id = p_provider_id
     AND NOT (id = ANY(v_kept_service_ids));

  RETURN v_count;
END;
$function$;
