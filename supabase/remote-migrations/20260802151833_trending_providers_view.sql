-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260802151833
-- Remote name: trending_providers_view
-- Do not edit this recovery archive; create a new tracked migration for changes.

CREATE OR REPLACE VIEW public.trending_providers AS
  SELECT
    provider_id,
    COUNT(*) AS booking_count_7d
  FROM public.bookings
  WHERE
    created_at > NOW() - INTERVAL '7 days'
    AND status NOT IN ('cancelled', 'no_show')
  GROUP BY provider_id
  ORDER BY booking_count_7d DESC;

GRANT SELECT ON public.trending_providers TO authenticated, anon;
