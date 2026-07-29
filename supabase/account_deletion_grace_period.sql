-- ============================================================
-- Account deletion — 30-day grace period + reactivation
-- ------------------------------------------------------------
-- Run this AFTER transactions_survive_account_deletion.sql and
-- BEFORE (re-)running delete_account.sql — that file's full-account
-- branches now just flag the row here instead of deleting it.
--
-- Industry-standard pattern (same as Instagram/Discord/Slack):
--   1. User taps "Delete Account" (their only hat) → immediately
--      signed out, but NOTHING is deleted yet. We only stamp
--      users.deletion_requested_at = NOW(). All their data — bookings,
--      reviews, messages, provider profile — sits completely untouched.
--   2. If they log back in within 30 days, the app intercepts the
--      login (see AuthContext.loadUserProfile) and offers to
--      reactivate instead of dropping them into the app normally.
--      Reactivating just clears the flag — since nothing was ever
--      deleted, everything comes back exactly as it was.
--   3. If 30 days pass with no reactivation, a daily cron job
--      (process_scheduled_account_deletions, below) performs the real,
--      permanent deletion — the same statements delete_account.sql's
--      full-account branches used to run immediately.
--
-- Partial deletions (dual-role account removing just ONE hat while
-- keeping the other) are deliberately NOT part of this — the user
-- stays logged in the whole time, so there's no "log back in" moment
-- to hang a reactivation prompt on. Those stay instant + permanent,
-- exactly as before.
-- ============================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_deletion_requested_at
  ON public.users(deletion_requested_at)
  WHERE deletion_requested_at IS NOT NULL;

-- ── Reactivation ─────────────────────────────────────────────
-- Called the moment someone with a pending deletion logs back in and
-- confirms "yes, reactivate". Self-scoped to auth.uid() — you can only
-- ever reactivate your own account. If has_gone_live was reset when
-- deletion was requested (provider hat), restore it: nothing about
-- their schedule/services was touched during the grace window, so
-- there's nothing else to rebuild.
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

-- ── The actual purge, deferred 30 days ──────────────────────
-- Unattended cron job (not scoped to a caller — it sweeps every
-- account whose grace period has expired). Mirrors exactly what
-- delete_client_profile()/delete_provider_profile()'s full-account
-- branches used to do immediately: reviews then bookings on both
-- sides, the providers row (cascades everything provider-owned),
-- then the account itself. transactions are never touched — see
-- transactions_survive_account_deletion.sql.
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
       AND deletion_requested_at <= NOW() - INTERVAL '30 days'
  LOOP
    -- Provider side, if any — reviews/bookings before the providers
    -- row (cascades services/portfolio/availability/etc.).
    DELETE FROM public.reviews  WHERE provider_id IN (SELECT id FROM public.providers WHERE user_id = r.id);
    DELETE FROM public.bookings WHERE provider_id IN (SELECT id FROM public.providers WHERE user_id = r.id);
    DELETE FROM public.providers WHERE user_id = r.id;

    -- Client side.
    DELETE FROM public.reviews  WHERE user_id = r.id;
    DELETE FROM public.bookings WHERE user_id = r.id;

    -- The account itself (cascades bookmarks, event plans, payment
    -- methods, becca chat, notifications, follows, conversations, etc.)
    DELETE FROM public.users WHERE id = r.id;
    DELETE FROM auth.users   WHERE id = r.id;

    v_processed := v_processed + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'processed', v_processed);
END;
$$;

-- Daily at 03:00 UTC — off-peak, well clear of the daily provider recap
-- (07:00 UTC, see info_packs_bookings.sql) and reminder jobs.
SELECT cron.schedule(
  'process-scheduled-account-deletions',
  '0 3 * * *',
  $$ SELECT public.process_scheduled_account_deletions(); $$
);
