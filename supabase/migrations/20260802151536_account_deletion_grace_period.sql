-- Account deletion — grace period + reactivation
-- TESTING VALUE: grace period set to 1 DAY (not the intended 30 days) for
-- testing purposes. Must be changed to 30 days before launch — see
-- PRE-LAUNCH-TODO.md.
--
-- 1. User taps "Delete Account" (their only hat) → immediately signed out,
--    but NOTHING is deleted yet. We only stamp users.deletion_requested_at.
-- 2. If they log back in within the grace window, the app intercepts the
--    login (AuthContext.loadUserProfile) and offers to reactivate instead.
-- 3. If the window passes with no reactivation, a daily cron job
--    (process_scheduled_account_deletions) performs the real, permanent
--    deletion.
--
-- Partial deletions (dual-role account removing just ONE hat) stay instant
-- + permanent, exactly as before.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_deletion_requested_at
  ON public.users(deletion_requested_at)
  WHERE deletion_requested_at IS NOT NULL;

-- ── Reactivation ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_account_deletion()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not authenticated');
  END IF;

  UPDATE public.users SET deletion_requested_at = NULL WHERE id = v_uid;

  UPDATE public.providers SET has_gone_live = true
   WHERE user_id = v_uid;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_account_deletion() FROM public;
GRANT EXECUTE ON FUNCTION public.cancel_account_deletion() TO authenticated;

-- ── The actual purge, deferred by the grace window ──────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
GRANT USAGE ON SCHEMA cron TO postgres;

CREATE OR REPLACE FUNCTION public.process_scheduled_account_deletions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_processed INT := 0;
BEGIN
  FOR r IN
    SELECT id FROM public.users
     WHERE deletion_requested_at IS NOT NULL
       -- TESTING VALUE: 1 day instead of 30 — change before launch.
       AND deletion_requested_at <= NOW() - INTERVAL '1 day'
  LOOP
    DELETE FROM public.reviews  WHERE provider_id IN (SELECT id FROM public.providers WHERE user_id = r.id);
    DELETE FROM public.bookings WHERE provider_id IN (SELECT id FROM public.providers WHERE user_id = r.id);
    DELETE FROM public.providers WHERE user_id = r.id;

    DELETE FROM public.reviews  WHERE user_id = r.id;
    DELETE FROM public.bookings WHERE user_id = r.id;

    DELETE FROM public.users WHERE id = r.id;
    DELETE FROM auth.users   WHERE id = r.id;

    v_processed := v_processed + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'processed', v_processed);
END;
$$;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'process-scheduled-account-deletions';
SELECT cron.schedule(
  'process-scheduled-account-deletions',
  '0 3 * * *',
  $$ SELECT public.process_scheduled_account_deletions(); $$
);
;
