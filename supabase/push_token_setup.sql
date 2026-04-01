-- ============================================================
-- PUSH NOTIFICATIONS SETUP
-- Run in Supabase SQL editor BEFORE configuring the webhook.
-- ============================================================

-- 1. Add push_token column to users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS push_token TEXT;

-- Index for fast lookup (Edge Function reads token by user_id)
CREATE INDEX IF NOT EXISTS idx_users_push_token
  ON public.users(push_token)
  WHERE push_token IS NOT NULL;

-- ============================================================
-- 2. Create the webhook trigger via SQL (no Dashboard UI needed)
-- ============================================================

-- pg_net is pre-installed on all Supabase projects
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Function that fires the Edge Function on every notification INSERT
CREATE OR REPLACE FUNCTION public.send_push_on_notification_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://ztrfpfvvejzaysrelmfm.supabase.co/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body    := jsonb_build_object(
      'type',   TG_OP,
      'table',  TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', row_to_json(NEW)
    ),
    timeout_milliseconds := 5000
  );
  RETURN NEW;
END;
$$;

-- Set the service role key so the trigger can read it at runtime
-- ⚠️  Replace <YOUR_SERVICE_ROLE_KEY> with the key from:
--     Supabase Dashboard → Settings → API → service_role (secret)
ALTER DATABASE postgres
  SET app.settings.service_role_key = '<YOUR_SERVICE_ROLE_KEY>';

-- Attach the trigger to notifications
DROP TRIGGER IF EXISTS send_push_on_notification ON public.notifications;
CREATE TRIGGER send_push_on_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.send_push_on_notification_insert();
