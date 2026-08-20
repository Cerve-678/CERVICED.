-- PROVENANCE: applied out-of-band (SQL editor), so it has NO row in
-- supabase_migrations.schema_migrations and does NOT appear in
-- supabase/remote-migrations/. Confirmed live 2026-08-20 during the
-- migration-record reconciliation: public.provider_message_templates table + replace_my_provider_message_templates() exist live.
-- Left un-backfilled rather than hand-inserting a migration row; the
-- version above is this file's authored timestamp, not a recorded one.

-- Private, reusable provider message templates. Clients never receive or read
-- templates; a template only fills the provider's editable chat composer.
CREATE TABLE IF NOT EXISTS public.provider_message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 60),
  content text NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 1000),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_message_templates_owner
  ON public.provider_message_templates(provider_id, sort_order, created_at);

ALTER TABLE public.provider_message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "providers manage own message templates"
  ON public.provider_message_templates
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.providers p
    WHERE p.id = provider_id AND p.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.providers p
    WHERE p.id = provider_id AND p.user_id = auth.uid()
  ));

REVOKE ALL ON TABLE public.provider_message_templates FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.provider_message_templates TO authenticated;

-- Replacing the complete list in one transaction avoids partially-saved
-- templates if a provider loses connectivity mid-save.
CREATE OR REPLACE FUNCTION public.replace_my_provider_message_templates(p_templates jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_provider_id uuid;
  v_item jsonb;
  v_label text;
  v_content text;
  v_index integer := 0;
BEGIN
  SELECT id INTO v_provider_id
  FROM public.providers
  WHERE user_id = auth.uid();

  IF v_provider_id IS NULL THEN
    RAISE EXCEPTION 'Only a provider can manage message templates';
  END IF;
  IF jsonb_typeof(p_templates) <> 'array' OR jsonb_array_length(p_templates) > 12 THEN
    RAISE EXCEPTION 'Provide between zero and twelve templates';
  END IF;

  -- Validate all input before deleting the prior saved list.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_templates) LOOP
    v_label := btrim(v_item->>'label');
    v_content := btrim(v_item->>'content');
    IF char_length(v_label) NOT BETWEEN 1 AND 60
       OR char_length(v_content) NOT BETWEEN 1 AND 1000 THEN
      RAISE EXCEPTION 'Template labels must be 1–60 characters and messages 1–1000 characters';
    END IF;
  END LOOP;

  DELETE FROM public.provider_message_templates WHERE provider_id = v_provider_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_templates) LOOP
    INSERT INTO public.provider_message_templates (provider_id, label, content, sort_order)
    VALUES (v_provider_id, btrim(v_item->>'label'), btrim(v_item->>'content'), v_index);
    v_index := v_index + 1;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_my_provider_message_templates(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_my_provider_message_templates(jsonb) TO authenticated;
