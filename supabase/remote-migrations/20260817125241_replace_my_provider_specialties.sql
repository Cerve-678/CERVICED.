-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260817125241
-- Remote name: replace_my_provider_specialties
-- Do not edit this recovery archive; create a new tracked migration for changes.

-- Atomic replace-set for a provider's specialties (provider_specialties
-- table). Mirrors replace_my_provider_message_templates: a plain client-side
-- delete-then-insert from ProviderBusinessEmailScreen.tsx would leave a
-- provider with zero specialties if the insert half failed after the delete
-- committed. Wrapping both in one SECURITY DEFINER transaction means either
-- both happen or neither does.
CREATE OR REPLACE FUNCTION public.replace_my_provider_specialties(p_specialties text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_provider_id uuid;
  v_specialty text;
BEGIN
  SELECT id INTO v_provider_id
  FROM public.providers
  WHERE user_id = auth.uid();

  IF v_provider_id IS NULL THEN
    RAISE EXCEPTION 'Only a provider can manage specialties';
  END IF;
  IF p_specialties IS NULL OR array_length(p_specialties, 1) > 50 THEN
    RAISE EXCEPTION 'Provide between zero and fifty specialties';
  END IF;

  DELETE FROM public.provider_specialties WHERE provider_id = v_provider_id;

  IF p_specialties IS NOT NULL THEN
    FOREACH v_specialty IN ARRAY p_specialties LOOP
      IF btrim(v_specialty) <> '' THEN
        INSERT INTO public.provider_specialties (provider_id, specialty)
        VALUES (v_provider_id, btrim(v_specialty));
      END IF;
    END LOOP;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_my_provider_specialties(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_my_provider_specialties(text[]) TO authenticated;
