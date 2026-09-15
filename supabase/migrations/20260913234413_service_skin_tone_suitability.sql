-- Explicit service suitability: NULL/empty is unspecified, never inferred.
-- Patch the current RPC rather than overwrite its owner checks, ID-preserving
-- updates, image/add-on handling or execute grants with an older definition.
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS skin_tones_suitable text[];
ALTER TABLE public.services ADD CONSTRAINT services_skin_tones_suitable_check
  CHECK (skin_tones_suitable IS NULL OR (
    skin_tones_suitable <@ ARRAY['Fair','Light','Medium','Tan','Deep','Rich']::text[]
    AND array_position(skin_tones_suitable, NULL) IS NULL
  ));
COMMENT ON COLUMN public.services.skin_tones_suitable IS
  'Provider-selected skin tones. NULL/empty is unspecified; all six means all skin tones.';

DO $migration$
DECLARE
  original text := pg_get_functiondef('public.replace_provider_services(uuid,jsonb)'::regprocedure);
  patched text;
BEGIN
  IF position('skin_tones_suitable' in original) > 0 THEN
    RAISE EXCEPTION 'RPC already handles skin tones; reconcile before applying';
  END IF;
  patched := replace(original,
    $old$        audience              = v_svc->>'audience'$old$,
    $new$        skin_tones_suitable   = CASE WHEN v_svc ? 'skin_tones_suitable' THEN
          CASE WHEN jsonb_typeof(v_svc->'skin_tones_suitable') = 'array'
            THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'skin_tones_suitable')) END
          ELSE skin_tones_suitable END,
        audience              = v_svc->>'audience'$new$);
  IF patched = original THEN RAISE EXCEPTION 'RPC update anchor changed'; END IF;
  original := patched;
  patched := replace(patched,
    'aftercare_notes, service_type, hair_types_suitable, audience',
    'aftercare_notes, service_type, hair_types_suitable, skin_tones_suitable, audience');
  IF patched = original THEN RAISE EXCEPTION 'RPC insert columns changed'; END IF;
  original := patched;
  patched := replace(patched,
    $old$        v_svc->>'audience'$old$,
    $new$        CASE WHEN jsonb_typeof(v_svc->'skin_tones_suitable') = 'array'
          THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'skin_tones_suitable')) END,
        v_svc->>'audience'$new$);
  IF patched = original THEN RAISE EXCEPTION 'RPC insert values changed'; END IF;
  EXECUTE patched;
END;
$migration$;
NOTIFY pgrst, 'reload schema';
