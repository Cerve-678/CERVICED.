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

-- The service_role key lives in Supabase Vault. ALTER DATABASE ... SET is
-- NOT permitted on hosted Supabase (error 42501: permission denied to set
-- parameter), so the key is stored as a Vault secret and read at runtime.
-- ⚠️  Replace <YOUR_SERVICE_ROLE_KEY> with the key from:
--     Supabase Dashboard → Settings → API → service_role (secret)
--     Re-run safe: if the placeholder is left in, any previously stored
--     real key is kept untouched.
DO $$
BEGIN
  IF '<YOUR_SERVICE_ROLE_KEY>' NOT LIKE '<%' THEN
    DELETE FROM vault.secrets WHERE name = 'service_role_key';
    PERFORM vault.create_secret('<YOUR_SERVICE_ROLE_KEY>', 'service_role_key');
  END IF;
END $$;

-- Function that fires the Edge Function on every notification INSERT
CREATE OR REPLACE FUNCTION public.send_push_on_notification_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key TEXT;
BEGIN
  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
   WHERE name = 'service_role_key'
   LIMIT 1;

  -- Key not configured (or placeholder left in) — skip the push quietly;
  -- the in-app notification insert must never fail because of this.
  IF v_key IS NULL OR v_key = '' OR v_key LIKE '<%' THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := 'https://ztrfpfvvejzaysrelmfm.supabase.co/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
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

-- Attach the trigger to notifications
DROP TRIGGER IF EXISTS send_push_on_notification ON public.notifications;
CREATE TRIGGER send_push_on_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.send_push_on_notification_insert();
