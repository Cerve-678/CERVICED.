-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260802160906
-- Remote name: convert_trending_providers_view_to_definer_function
-- Do not edit this recovery archive; create a new tracked migration for changes.

-- Security audit fix, part 2: Supabase flags ANY bare view as
-- "security_definer_view" (ERROR) unless it explicitly opts into
-- security_invoker — because by default a view runs with its owner's
-- privileges against the underlying tables' RLS, not the querying user's.
-- Setting security_invoker=true here would break the view's actual purpose
-- (aggregating booking counts across ALL providers for every querying
-- client, when bookings RLS is owner-scoped to each individual booking's
-- own user/provider). The correct pattern for an intentional, audited
-- cross-account aggregation like this is a SECURITY DEFINER FUNCTION
-- instead of a bare view — Supabase's linter treats an explicit, pinned
-- definer function as the expected pattern rather than an anti-pattern.
DROP VIEW IF EXISTS public.trending_providers;

CREATE FUNCTION public.get_trending_providers(p_limit int DEFAULT 10)
RETURNS TABLE (provider_id uuid, booking_count_7d bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT b.provider_id, count(*) AS booking_count_7d
  FROM public.bookings b
  JOIN public.providers p ON p.id = b.provider_id
  WHERE b.created_at > (now() - '7 days'::interval)
    AND b.status <> ALL (ARRAY['cancelled'::text, 'no_show'::text])
    AND p.has_gone_live = true
    AND p.is_active = true
  GROUP BY b.provider_id
  ORDER BY count(*) DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_trending_providers(int) TO anon, authenticated;
