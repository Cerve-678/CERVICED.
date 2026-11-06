-- Keep both text accepted by the service editor and text actually published.
-- A draft can survive a later profile refresh/save that sends older form state.
BEGIN;

CREATE TABLE public.service_description_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  draft_key text CHECK (draft_key IS NULL OR char_length(draft_key) <= 80),
  service_name text NOT NULL CHECK (char_length(service_name) BETWEEN 1 AND 200),
  description text NOT NULL CHECK (char_length(description) <= 10000),
  source text NOT NULL CHECK (source IN ('draft', 'published')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_description_history_identity CHECK (service_id IS NOT NULL OR draft_key IS NOT NULL)
);

CREATE INDEX service_description_history_service_idx
  ON public.service_description_history (provider_id, service_id, created_at DESC);
CREATE INDEX service_description_history_service_fk_idx
  ON public.service_description_history (service_id) WHERE service_id IS NOT NULL;
CREATE INDEX service_description_history_draft_idx
  ON public.service_description_history (provider_id, draft_key, created_at DESC)
  WHERE draft_key IS NOT NULL;

ALTER TABLE public.service_description_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_description_history_owner_read
  ON public.service_description_history FOR SELECT TO authenticated
  USING (provider_id IN (
    SELECT p.id FROM public.providers p WHERE p.user_id = (SELECT auth.uid())
  ));
CREATE POLICY service_description_history_owner_draft
  ON public.service_description_history FOR INSERT TO authenticated
  WITH CHECK (
    source = 'draft'
    AND provider_id IN (
      SELECT p.id FROM public.providers p WHERE p.user_id = (SELECT auth.uid())
    )
    AND (service_id IS NULL OR EXISTS (
      SELECT 1 FROM public.services s
      WHERE s.id = service_id AND s.provider_id = service_description_history.provider_id
    ))
  );
REVOKE ALL ON public.service_description_history FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.service_description_history TO authenticated;

-- The trigger captures writes from either service editor and from the full
-- catalogue RPC. Its function is outside the exposed public API schema.
CREATE SCHEMA IF NOT EXISTS internal;
REVOKE ALL ON SCHEMA internal FROM PUBLIC, anon, authenticated;
CREATE FUNCTION internal.capture_service_description_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.description IS NOT DISTINCT FROM OLD.description THEN
      RETURN NEW;
    END IF;
  END IF;
  INSERT INTO public.service_description_history
    (provider_id, service_id, draft_key, service_name, description, source)
  VALUES
    (NEW.provider_id, NEW.id, NEW.id::text, NEW.name, COALESCE(NEW.description, ''), 'published');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION internal.capture_service_description_history()
  FROM PUBLIC, anon, authenticated;
CREATE TRIGGER capture_service_description_history
  AFTER INSERT OR UPDATE OF description ON public.services
  FOR EACH ROW EXECUTE FUNCTION internal.capture_service_description_history();

-- Preserve the currently published wording as the first restorable version.
INSERT INTO public.service_description_history
  (provider_id, service_id, draft_key, service_name, description, source)
SELECT provider_id, id, id::text, name, COALESCE(description, ''), 'published'
FROM public.services;

COMMIT;
