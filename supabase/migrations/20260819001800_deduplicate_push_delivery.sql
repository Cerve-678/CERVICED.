-- A database webhook can occasionally be delivered more than once. Claim each
-- notification row before contacting Expo so repeated invocations cannot create
-- repeated device pushes. The claim is intentionally durable: automatically
-- retrying an uncertain Expo request could deliver the same visible alert twice.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS push_delivery_claimed_at timestamptz;

COMMENT ON COLUMN public.notifications.push_delivery_claimed_at IS
  'Set atomically before the notification is submitted to Expo; prevents duplicate webhook delivery.';

CREATE OR REPLACE FUNCTION public.claim_notification_push(
  p_notification_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_claimed_id uuid;
BEGIN
  UPDATE public.notifications
     SET push_delivery_claimed_at = clock_timestamp()
   WHERE id = p_notification_id
     AND push_delivery_claimed_at IS NULL
  RETURNING id INTO v_claimed_id;

  RETURN v_claimed_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_notification_push(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_push(uuid)
  TO service_role;
