-- PROVENANCE: applied out-of-band (SQL editor), so it has NO row in
-- supabase_migrations.schema_migrations and does NOT appear in
-- supabase/remote-migrations/. Confirmed live 2026-08-20 during the
-- migration-record reconciliation: public.claim_notification_push() exists live.
-- BACKFILLED 2026-08-27: it now HAS a schema_migrations row at the version
-- above, so it no longer reads as unapplied to a ledger diff. Leaving it
-- un-backfilled had cost three separate re-investigations (2026-08-20,
-- 08-25, 08-27), which is what the missing row actually buys you. The row's
-- `statements` records only a pointer back to this file plus how it was
-- verified -- no SQL was re-executed to create it, because the text actually
-- run out-of-band was never captured. THIS FILE remains the authoritative
-- body; the ledger row is a record that it ran, not a copy of what ran.

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
