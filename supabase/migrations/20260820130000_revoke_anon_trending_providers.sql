-- get_trending_providers() aggregates booking counts across ALL providers,
-- bypassing the owner-scoped RLS on bookings by design (see
-- 20260802160906_convert_trending_providers_view_to_definer_function.sql).
-- It was granted to anon on the assumption it powered a public browse
-- section, but that section is dead: homeSections.ts declares a 'trending'
-- entry whose showWhen guard reads data.trending, and nothing ever populates
-- that key -- HomeScreen has no trending state. Its only wrapper,
-- getTrendingProviderIds(), had zero callers and is removed in this change.
--
-- Revoking anon rather than dropping the function: the aggregation itself is
-- sound and the home section may be finished later. Requiring a login to read
-- cross-provider booking volume is the correct default for a business metric.
REVOKE ALL ON FUNCTION public.get_trending_providers(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_trending_providers(integer) TO authenticated;
