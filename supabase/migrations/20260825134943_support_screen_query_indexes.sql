-- Query shapes used by notification, bookmark and offer browsing screens.
-- Keep these narrow: each leading column is constrained by RLS/the query and
-- the trailing timestamp satisfies the screen's newest-first ordering.

CREATE INDEX IF NOT EXISTS idx_notifications_user_role_created_at
  ON public.notifications (user_id, recipient_role, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_unread_user_role
  ON public.notifications (user_id, recipient_role)
  WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_bookmarks_user_created_at
  ON public.bookmarks (user_id, created_at DESC)
  INCLUDE (provider_id);

CREATE INDEX IF NOT EXISTS idx_promotions_active_valid_created_at
  ON public.promotions (valid_until, created_at DESC)
  INCLUDE (provider_id)
  WHERE is_active = true;
