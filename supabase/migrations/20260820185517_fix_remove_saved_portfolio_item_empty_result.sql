-- remove_saved_portfolio_item() rebuilt the saved list with jsonb_agg(), which
-- returns NULL over zero rows. Removing the LAST saved item (or removing an
-- item from an already-empty list) therefore tried to write NULL into
-- users.saved_portfolio, which is NOT NULL DEFAULT '[]'::jsonb — so the call
-- failed with 23502 and the app logged "Failed to unsave portfolio item" and
-- rolled its optimistic update back, leaving the heart stuck filled.
-- COALESCE back to an empty array so emptying the list is a normal write.
CREATE OR REPLACE FUNCTION public.remove_saved_portfolio_item(p_user_id uuid, p_item_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.users
     SET saved_portfolio = COALESCE(
           (
             SELECT jsonb_agg(elem)
               FROM jsonb_array_elements(saved_portfolio) AS elem
              WHERE elem <> to_jsonb(p_item_id)
           ),
           '[]'::jsonb
         )
   WHERE id = p_user_id;
END;
$function$;

-- append_saved_portfolio_item() is safe against a NULL column today (the
-- column is NOT NULL DEFAULT '[]'), but `saved_portfolio || to_jsonb(...)`
-- would silently evaluate to NULL if that ever changed. Make it explicit so
-- the two halves of this pair fail the same way — which is to say, not at all.
CREATE OR REPLACE FUNCTION public.append_saved_portfolio_item(p_user_id uuid, p_item_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.users
     SET saved_portfolio = CASE
           WHEN COALESCE(saved_portfolio, '[]'::jsonb) @> to_jsonb(p_item_id)
             THEN COALESCE(saved_portfolio, '[]'::jsonb)
           ELSE COALESCE(saved_portfolio, '[]'::jsonb) || to_jsonb(p_item_id)
         END
   WHERE id = p_user_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.remove_saved_portfolio_item(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.append_saved_portfolio_item(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_saved_portfolio_item(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.append_saved_portfolio_item(uuid, text) TO authenticated;
