-- ============================================================
-- USER PREFERENCES
-- Adds saved_portfolio and notification_preferences to users.
-- Run this in the Supabase SQL editor.
-- ============================================================

-- Array of portfolio item IDs the user has saved/hearted
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS saved_portfolio JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Notification preference toggles (mirrors NotificationsSettingsScreen)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB NOT NULL DEFAULT '{
    "bookingConfirm": true,
    "bookingReminder": true,
    "bookingUpdates": true,
    "promotions": false,
    "newProviders": true,
    "weeklySummary": false
  }'::jsonb;

-- ── RPC helpers for saved_portfolio JSONB array ───────────────────────────────

-- Append an item ID (no-op if already present)
CREATE OR REPLACE FUNCTION public.append_saved_portfolio_item(
  p_user_id UUID,
  p_item_id TEXT
) RETURNS VOID AS $$
BEGIN
  UPDATE public.users
     SET saved_portfolio = CASE
           WHEN saved_portfolio @> to_jsonb(p_item_id) THEN saved_portfolio
           ELSE saved_portfolio || to_jsonb(p_item_id)
         END
   WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remove an item ID
CREATE OR REPLACE FUNCTION public.remove_saved_portfolio_item(
  p_user_id UUID,
  p_item_id TEXT
) RETURNS VOID AS $$
BEGIN
  UPDATE public.users
     SET saved_portfolio = (
           SELECT jsonb_agg(elem)
             FROM jsonb_array_elements(saved_portfolio) AS elem
            WHERE elem <> to_jsonb(p_item_id)
         )
   WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
