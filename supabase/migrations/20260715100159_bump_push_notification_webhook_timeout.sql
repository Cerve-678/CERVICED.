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
    timeout_milliseconds := 15000
  );
  RETURN NEW;
END;
$$;;
