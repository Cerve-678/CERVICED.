-- 20261110190000_more_service_types.sql
--
-- More "Service Type" choices in the provider's service editor. Until now a
-- service could only be a treatment, enhancement, maintenance, restorative or
-- consultation. The editor now offers choices that fit the kind of service:
-- a lash or nail service can be a Full set, Infill or Removal, a makeup one an
-- Event, Trial or Lesson, an aesthetics one a Top-up, Course or Review.
--
-- Widens services_service_type_check only. The five existing values stay, so
-- every saved row still passes, and nothing server-side reads service_type
-- except replace_provider_services, which stores the text as given.
--
-- THIS LIST IS MIRRORED IN src/constants/serviceTypes.ts (SERVICE_TYPE_KEYS).
-- src/tests/serviceTypes.test.ts parses the ARRAY below and fails if the two
-- disagree.

BEGIN;

-- Guard: refuse if the live constraint isn't the five-value one this replaces.
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conrelid = 'public.services'::regclass
     AND conname = 'services_service_type_check';
  IF v_def IS DISTINCT FROM
     'CHECK ((service_type = ANY (ARRAY[''treatment''::text, ''enhancement''::text, ''maintenance''::text, ''restorative''::text, ''consultation''::text])))'
  THEN
    RAISE EXCEPTION 'services_service_type_check changed since this was written: %', v_def;
  END IF;
END $$;

ALTER TABLE public.services DROP CONSTRAINT services_service_type_check;

ALTER TABLE public.services ADD CONSTRAINT services_service_type_check
  CHECK (service_type = ANY (ARRAY[
    'treatment', 'enhancement', 'maintenance', 'restorative', 'consultation',
    'full_set', 'infill', 'removal', 'repair', 'express',
    'touch_up', 'top_up', 'patch_test', 'install', 'trial',
    'occasion', 'lesson', 'review', 'course'
  ]::text[]));

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261110190000', 'more_service_types')
ON CONFLICT (version) DO NOTHING;

COMMIT;
