-- Defence in depth: RLS already denies these (support_requests has no
-- INSERT/UPDATE/DELETE policy — writes are service-role only), but the
-- project's default grants handed `authenticated` the table privileges
-- anyway. Make the grant match the intent so the two can't drift, and so a
-- future policy added by mistake doesn't silently become reachable.
revoke insert, update, delete, truncate, references, trigger
  on public.support_requests from authenticated;
