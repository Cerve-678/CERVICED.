-- Phase 5.4 — Trending providers view
-- Counts bookings in the last 7 days (excluding cancellations / no-shows).

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
