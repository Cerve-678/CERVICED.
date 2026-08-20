-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260810154030
-- Remote name: harden_saved_portfolio_rpcs
-- Do not edit this recovery archive; create a new tracked migration for changes.

-- Saved portfolio mutations are self-service actions. Enforce ownership in
-- the function body as defence in depth, then keep the RPCs authenticated-only.
CREATE OR REPLACE FUNCTION public.append_saved_portfolio_item(p_user_id uuid, p_item_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.users
     SET saved_portfolio = CASE
           WHEN saved_portfolio @> to_jsonb(p_item_id) THEN saved_portfolio
           ELSE saved_portfolio || to_jsonb(p_item_id)
         END
   WHERE id = p_user_id;
END;
$$

CREATE OR REPLACE FUNCTION public.remove_saved_portfolio_item(p_user_id uuid, p_item_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.users
     SET saved_portfolio = (
           SELECT jsonb_agg(elem)
             FROM jsonb_array_elements(saved_portfolio) AS elem
            WHERE elem <> to_jsonb(p_item_id)
         )
   WHERE id = p_user_id;
END;
$$

REVOKE ALL ON FUNCTION public.append_saved_portfolio_item(uuid, text) FROM PUBLIC, anon

REVOKE ALL ON FUNCTION public.remove_saved_portfolio_item(uuid, text) FROM PUBLIC, anon

GRANT EXECUTE ON FUNCTION public.append_saved_portfolio_item(uuid, text) TO authenticated

GRANT EXECUTE ON FUNCTION public.remove_saved_portfolio_item(uuid, text) TO authenticated
