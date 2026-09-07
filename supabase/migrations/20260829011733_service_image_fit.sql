-- Per-photo display framing for service images.
--
-- Until now the app decided how every service photo was cropped and the
-- provider had no say: the detail carousel sized one box for a whole photo set
-- and rendered every image `cover`, so anything whose shape didn't match the
-- box lost its edges. For a beauty marketplace that is not cosmetic — it's the
-- difference between a nail set being in frame or cut off.
--
-- 'cover' fills the box and may crop; 'contain' fits the whole photo and
-- letterboxes. Defaulting to 'cover' keeps every existing row rendering
-- exactly as it does today, so this is additive with no visual change until a
-- provider actually chooses otherwise.

ALTER TABLE public.service_images
  ADD COLUMN IF NOT EXISTS fit TEXT NOT NULL DEFAULT 'cover';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'service_images_fit_check'
  ) THEN
    ALTER TABLE public.service_images
      ADD CONSTRAINT service_images_fit_check CHECK (fit IN ('cover', 'contain'));
  END IF;
END $$;

-- replace_provider_services() rewrites the whole catalogue on every provider
-- save, so it has to carry the new column through or the first save after this
-- migration would silently reset every provider's framing back to the default.
-- Reproduced in full from the live definition (pg_get_functiondef) rather than
-- patched, so LANGUAGE / SECURITY DEFINER / SET search_path survive.

CREATE OR REPLACE FUNCTION public.replace_provider_services(p_provider_id uuid, p_services jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      aftercare_notes, service_type, hair_types_suitable, audience
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
      CASE WHEN jsonb_typeof(v_svc->'hair_types_suitable') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'hair_types_suitable')) END,
      v_svc->>'audience'
    )
    RETURNING id INTO v_service_id;

    FOR v_img IN SELECT * FROM jsonb_array_elements(COALESCE(v_svc->'images', '[]'::jsonb))
    LOOP
      INSERT INTO public.service_images (service_id, url, sort_order, aspect_ratio, fit)
      VALUES (
        v_service_id,
        v_img->>'url',
        COALESCE((v_img->>'sort_order')::int, 0),
        -- NULLIF(...,'') so an image posted without a ratio (older app build,
        -- or an on-device measurement that failed) stores NULL — "not
        -- measured" — rather than 0, which the CHECK constraint rejects.
        NULLIF(v_img->>'aspect_ratio','')::numeric,
        -- An older app build posts no 'fit' at all; COALESCE keeps those on
        -- the default rather than writing NULL into a NOT NULL column.
        COALESCE(NULLIF(v_img->>'fit',''), 'cover')
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
$function$;
