-- ============================================================
-- Delete Account — per-hat self-service (client side / provider side)
-- ------------------------------------------------------------
-- PREREQUISITES, run in this order:
--   1. transactions_survive_account_deletion.sql — drops the enforced
--      FKs on transactions.*, creates account_deletion_log.
--   2. account_deletion_grace_period.sql — adds users.deletion_requested_at,
--      cancel_account_deletion(), and the 30-day purge cron job.
-- Then run this file.
--
-- Replaces the earlier single-shot delete_account() with two
-- functions, one per hat, because a dual-role account (client +
-- provider) must be able to drop ONE hat without silently deleting
-- the other's data too.
--
--   supabase.rpc('delete_client_profile')   — ProfileInfoScreen (client)
--   supabase.rpc('delete_provider_profile') — ProviderAccountInfoScreen (provider)
--
-- Each function only ever touches ITS OWN side. If the caller has
-- another hat, only that side's data is removed — instantly and
-- permanently — and they stay signed in as the other role.
--
-- If the caller has NO other hat, removing "the last hat" means
-- removing the whole account — but NOT instantly. Per
-- account_deletion_grace_period.sql, this only stamps
-- users.deletion_requested_at = NOW() and signs them out; nothing is
-- actually deleted. A 30-day-later cron job does the real deletion
-- unless they log back in and reactivate first (AuthContext intercepts
-- that login — see loadUserProfile). Partial (keep-the-other-hat)
-- deletions get no such grace period: there's no "log back in" moment
-- to hang a reactivation prompt on since the user never leaves the app.
--
-- Both functions refuse to run (whether the result is instant or
-- deferred) while there's an upcoming (not yet completed/cancelled)
-- booking on the relevant side — deleting out from under a paid,
-- scheduled appointment with no refund/notice to the other party is
-- not something either button should be able to do silently.
--
-- Both functions log to account_deletion_log first (user_id, email,
-- which hat(s), timestamp) — not a soft-delete/undo, just a record for
-- support/dispute/analytics after the profile data is genuinely gone.
--
-- SECURITY: both run as definer but are scoped to auth.uid() / the
-- caller's own provider row throughout — a caller can only ever act
-- on their own data.
--
-- KNOWN LIMITATION: when the provider hat is actually purged (either
-- instantly, if there's no client hat and the 30 days elapsed, or via
-- process_scheduled_account_deletions()), reviews ABOUT that provider
-- (written by other, still-existing clients) are hard-deleted along
-- with it — reviews.provider_id is NOT NULL with no ON DELETE CASCADE,
-- so there is no way to keep them without the same nullable-FK
-- treatment given to transactions. transactions themselves are never
-- deleted at all (see transactions_survive_account_deletion.sql).
-- ============================================================

DROP FUNCTION IF EXISTS public.delete_account();

-- ── Client-side deletion ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_client_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         UUID := auth.uid();
  v_provider_id UUID;
  v_upcoming    INT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not authenticated');
  END IF;

  SELECT id INTO v_provider_id FROM public.providers WHERE user_id = v_uid LIMIT 1;

  SELECT COUNT(*) INTO v_upcoming
    FROM public.bookings
   WHERE user_id = v_uid
     AND booking_date >= CURRENT_DATE
     AND status IN ('pending', 'confirmed', 'in_progress');

  IF v_upcoming > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'upcoming_bookings', 'count', v_upcoming);
  END IF;

  INSERT INTO public.account_deletion_log
    (user_id, provider_id, email, deletion_type, had_client_profile, had_provider_profile, account_created_at)
  SELECT v_uid, v_provider_id, au.email,
         CASE WHEN v_provider_id IS NULL THEN 'full_account' ELSE 'client_profile' END,
         true, (v_provider_id IS NOT NULL), au.created_at
    FROM auth.users au WHERE au.id = v_uid;

  IF v_provider_id IS NULL THEN
    -- No provider hat — this IS the whole account, but nothing is
    -- deleted yet. Flag it; process_scheduled_account_deletions() (see
    -- account_deletion_grace_period.sql) does the real deletion in 30
    -- days unless they log back in and reactivate before then.
    UPDATE public.users SET deletion_requested_at = NOW() WHERE id = v_uid;
    RETURN jsonb_build_object('ok', true, 'full_account_deleted', true, 'grace_period_days', 30);
  END IF;

  -- Keeping the provider hat — this deletion is instant and permanent,
  -- no grace period (the user never leaves the app, so there's no
  -- "log back in" moment to offer reactivation on).
  --
  -- Reviews reference bookings with no ON DELETE CASCADE — must go
  -- before the bookings they point at. Client side only: rows this
  -- user authored/paid as a customer, never the provider side.
  -- transactions are deliberately left untouched (see prerequisite file).
  DELETE FROM public.reviews  WHERE user_id = v_uid;
  DELETE FROM public.bookings WHERE user_id = v_uid;

  -- Keep the users row (the provider hat still needs it) — manually
  -- strip only the client-owned tables (these all cascade from
  -- users.id, but deleting users.id here would take the provider row
  -- with it since providers.user_id is itself ON DELETE CASCADE).
  DELETE FROM public.bookmarks              WHERE user_id = v_uid;
  DELETE FROM public.event_plans            WHERE user_id = v_uid; -- cascades tasks + checklist
  DELETE FROM public.payment_methods        WHERE user_id = v_uid;
  DELETE FROM public.becca_chat_sessions    WHERE user_id = v_uid; -- cascades messages
  DELETE FROM public.user_interactions      WHERE user_id = v_uid;
  DELETE FROM public.provider_follows       WHERE user_id = v_uid;
  DELETE FROM public.provider_conversations WHERE user_id = v_uid; -- cascades messages
  DELETE FROM public.notifications          WHERE user_id = v_uid;

  -- has_client_profile is the client hat itself, not a side effect of some
  -- other field — clearing dob alone would leave the hat set (added live by
  -- migration 20260823110027; this file was not updated at the time).
  UPDATE public.users SET
    dob                = NULL,
    has_client_profile = false,
    hair_type          = NULL,
    skin_type          = NULL,
    allergies          = '{}',
    skin_concerns      = '{}',
    style_vibe         = NULL,
    medical_notes      = NULL,
    treatment_history  = '{}',
    service_interests  = '{}',
    saved_portfolio    = '[]'::jsonb
  WHERE id = v_uid;

  RETURN jsonb_build_object('ok', true, 'full_account_deleted', false);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_client_profile() FROM public;
GRANT EXECUTE ON FUNCTION public.delete_client_profile() TO authenticated;

-- ── Provider-side deletion ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_provider_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         UUID := auth.uid();
  v_provider_id UUID;
  v_has_client  BOOLEAN;
  v_upcoming    INT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not authenticated');
  END IF;

  SELECT id INTO v_provider_id FROM public.providers WHERE user_id = v_uid LIMIT 1;
  IF v_provider_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no provider profile');
  END IF;

  -- The column that owns the client hat (migration 20260823105742). This read
  -- was `(dob IS NOT NULL)` — the inference that column replaced — until
  -- 20260829120000_delete_provider_profile_reads_client_hat_column.sql.
  -- Never re-derive the client hat from dob: a provider who upgraded from a
  -- client account was never asked for one, and a provider who gave one at
  -- signup Step 2 may never have added a client profile at all.
  SELECT COALESCE(has_client_profile, false) INTO v_has_client
    FROM public.users WHERE id = v_uid;

  SELECT COUNT(*) INTO v_upcoming
    FROM public.bookings
   WHERE provider_id = v_provider_id
     AND booking_date >= CURRENT_DATE
     AND status IN ('pending', 'confirmed', 'in_progress');

  IF v_upcoming > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'upcoming_bookings', 'count', v_upcoming);
  END IF;

  INSERT INTO public.account_deletion_log
    (user_id, provider_id, email, deletion_type, had_client_profile, had_provider_profile, account_created_at)
  SELECT v_uid, v_provider_id, au.email,
         CASE WHEN NOT v_has_client THEN 'full_account' ELSE 'provider_profile' END,
         v_has_client, true, au.created_at
    FROM auth.users au WHERE au.id = v_uid;

  IF NOT v_has_client THEN
    -- No client hat — this IS the whole account, but nothing is
    -- deleted yet. Flag it and hide the provider from client-facing
    -- search immediately (has_gone_live gates every such query — see
    -- provider-visibility-gating memory) without touching their
    -- schedule/services, so reactivation restores everything exactly.
    UPDATE public.users     SET deletion_requested_at = NOW() WHERE id = v_uid;
    UPDATE public.providers  SET has_gone_live = false          WHERE id = v_provider_id;
    RETURN jsonb_build_object('ok', true, 'full_account_deleted', true, 'grace_period_days', 30);
  END IF;

  -- Keeping the client hat — this deletion is instant and permanent,
  -- no grace period (the user never leaves the app, so there's no
  -- "log back in" moment to offer reactivation on).
  --
  -- Reviews reference bookings with no ON DELETE CASCADE — must go
  -- before the bookings they point at. Provider side only.
  -- (See KNOWN LIMITATION above: this also removes reviews other
  -- clients wrote about this provider — the schema has no way to
  -- keep those once the provider row they point at is gone.)
  -- transactions are deliberately left untouched (see prerequisite file).
  DELETE FROM public.reviews  WHERE provider_id = v_provider_id;
  DELETE FROM public.bookings WHERE provider_id = v_provider_id;

  -- Cascades every provider-owned table: services (+images/add-ons),
  -- portfolio, availability, promotions, form library, private details,
  -- conversations (+messages), waitlist entries, follows, interactions.
  DELETE FROM public.providers WHERE id = v_provider_id;

  -- Keep the account (the client hat still needs it) — but make sure
  -- it no longer reads as a provider anywhere. `role` gates the
  -- "Switch to Provider Mode" vs "Become a Provider" UI; leaving it
  -- as 'provider' with no providers row left would flip the user into
  -- an empty provider dashboard on next tap.
  UPDATE public.users SET
    role           = 'user',
    business_name  = NULL,
    business_email = NULL
  WHERE id = v_uid;

  -- auth metadata carries a `role` mirror that AuthContext falls back to when
  -- the profile fetch fails. Nothing reset it here until 20260829120000, so an
  -- account that dropped its provider hat kept advertising one indefinitely.
  UPDATE auth.users
     SET raw_user_meta_data =
           jsonb_set(COALESCE(raw_user_meta_data, '{}'::jsonb), '{role}', '"user"')
   WHERE id = v_uid;

  RETURN jsonb_build_object('ok', true, 'full_account_deleted', false);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_provider_profile() FROM public;
GRANT EXECUTE ON FUNCTION public.delete_provider_profile() TO authenticated;
