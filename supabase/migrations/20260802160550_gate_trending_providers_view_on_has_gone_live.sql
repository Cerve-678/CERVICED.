-- Security audit fix: public.trending_providers is a SECURITY DEFINER-style
-- view (default Postgres view behavior — runs as the view owner, bypassing
-- RLS on the underlying bookings table for whoever queries it, which is
-- what a "trending providers" feature needs to aggregate across all users'
-- bookings). It previously had no has_gone_live/is_active filter at all, so
-- a provider who had gone live and later deactivated/delisted would still
-- surface as "trending" to any client querying this view directly. Kept as
-- a definer-style view (flipping to security_invoker would break the
-- intended cross-account aggregation, since bookings RLS is owner-scoped),
-- but now explicitly filters to currently-live, active providers only —
-- the same gate CLAUDE.md requires everywhere else.
CREATE OR REPLACE VIEW public.trending_providers AS
SELECT b.provider_id, count(*) AS booking_count_7d
FROM public.bookings b
JOIN public.providers p ON p.id = b.provider_id
WHERE b.created_at > (now() - '7 days'::interval)
  AND b.status <> ALL (ARRAY['cancelled'::text, 'no_show'::text])
  AND p.has_gone_live = true
  AND p.is_active = true
GROUP BY b.provider_id
ORDER BY count(*) DESC;
;
