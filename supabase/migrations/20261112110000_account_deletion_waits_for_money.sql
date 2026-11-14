-- Account deletion waits until no money on the account is still moving.
--
-- Before: deleting a profile (or the 30-day job deleting a whole account)
-- only checked for upcoming bookings, then deleted every booking, and with it,
-- by cascade, held payouts, the refund ledger, late/no-show fee charges, open
-- refund requests and provider debts. A past booking still waiting on its
-- payout, a refund request or a debt was erased without anything being paid,
-- refunded or recovered. A client who had ever tipped couldn't be deleted at
-- all (booking_tips is ON DELETE RESTRICT), and because the 30-day job ran
-- every account in one transaction, one such account undid every deletion in
-- the run, every day.
--
-- Now:
-- * account_deletion_blockers(user) lists what is still moving: unfinished
--   bookings of any date, payouts held or failed (the provider's, on the
--   client's own bookings too), unsettled debts, fee charges or fee payouts
--   in flight, tips not yet paid out or being paid, refunds processing or still
--   owed after a cancel, and open refund requests, on the side(s) being
--   deleted. Empty = safe. An unknown side is refused, not read as safe.
--   The account's rows are locked before the check, so nothing new can start
--   between the check and the delete.
-- * delete_provider_profile / delete_client_profile refuse with
--   'upcoming_bookings' (as before, for unfinished bookings) or the new
--   'money_in_progress' with the list.
-- * process_scheduled_account_deletions skips an account that has blockers
--   (it is tried again the next day), deletes settled tips before bookings,
--   and runs each account in its own subtransaction.
--
-- Settled money records are still deleted with the account, as before:
-- keeping them (anonymised) is a separate decision.
-- Redefined from live with md5 guards, per supabase/MIGRATION_OWNER.md.

BEGIN;

DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.delete_provider_profile()'::regprocedure)) <> 'ff8a723181a067328ef763c49fb961cc' THEN
    RAISE EXCEPTION 'delete_provider_profile changed live since this migration was written; rebuild it from live';
  END IF;
  IF md5(pg_get_functiondef('public.delete_client_profile()'::regprocedure)) <> '99855999fbbd4743762b1d948316a856' THEN
    RAISE EXCEPTION 'delete_client_profile changed live since this migration was written; rebuild it from live';
  END IF;
  IF md5(pg_get_functiondef('public.process_scheduled_account_deletions()'::regprocedure)) <> '6faed2a1f762e4964feb0d335417f51d' THEN
    RAISE EXCEPTION 'process_scheduled_account_deletions changed live since this migration was written; rebuild it from live';
  END IF;
END
$guard$;

CREATE FUNCTION public.account_deletion_blockers(p_user_id uuid, p_side text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  -- An unknown side would read as "nothing blocking", so it is refused.
  IF p_side IS NULL OR p_side NOT IN ('client', 'provider', 'both') THEN
    RAISE EXCEPTION 'account_deletion_blockers: unknown side %', p_side;
  END IF;

  -- p_side: 'client' (deleting only the client profile), 'provider' (only the
  -- provider profile) or 'both' (the whole account). A side not being deleted
  -- has a NULL id here, so its money never blocks.
  WITH me AS (
    SELECT CASE WHEN p_side IN ('client', 'both') THEN p_user_id END AS uid,
           CASE WHEN p_side IN ('provider', 'both')
                THEN (SELECT id FROM public.providers WHERE user_id = p_user_id LIMIT 1) END AS pid
  ),
  counts AS (
    SELECT
      -- Bookings on either side that haven't ended, whatever their date: a
      -- past confirmed booking still waiting for auto-complete counts too.
      (SELECT count(*) FROM public.bookings b, me
        WHERE (b.user_id = me.uid OR b.provider_id = me.pid)
          AND b.status IN ('pending', 'confirmed', 'in_progress', 'on_hold')) AS unfinished_bookings,
      -- Payouts on either side: a client's own bookings carry the provider's
      -- payout too, and deleting those bookings would erase it.
      (SELECT count(*) FROM public.provider_payouts pp JOIN public.bookings b ON b.id = pp.booking_id, me
        WHERE (pp.provider_id = me.pid OR b.user_id = me.uid)
          AND pp.status IN ('held', 'failed')) AS payouts_waiting,
      (SELECT count(*) FROM public.provider_shortfalls s, me
        WHERE s.provider_id = me.pid AND s.settled_at IS NULL) AS debts_owed,
      (SELECT count(*) FROM public.booking_fee_charges f JOIN public.bookings b ON b.id = f.booking_id, me
        WHERE (b.user_id = me.uid OR f.provider_id = me.pid)
          AND (f.status IN ('processing', 'awaiting_client')
               OR (f.status = 'succeeded' AND f.payout_status IN ('pending', 'held', 'failed')))) AS fees_in_progress,
      -- A tip paid but not yet paid out, or one being paid right now (an
      -- unpaid tip older than a day was abandoned and doesn't count).
      (SELECT count(*) FROM public.booking_tips t, me
        WHERE (t.client_user_id = me.uid OR t.provider_id = me.pid)
          AND ((t.status = 'succeeded' AND t.payout_status IN ('pending', 'held', 'failed'))
               OR (t.status = 'pending' AND t.created_at > now() - interval '1 day'))) AS tips_waiting,
      (SELECT count(*) FROM public.bookings b, me
        WHERE (b.user_id = me.uid OR b.provider_id = me.pid)
          AND b.payment_status = 'refund_pending') AS refunds_processing,
      -- Cancelled but the client's money is still taken, with no refund on
      -- record and no policy settlement (a kept deposit records
      -- policy_retained_amount): the refund never went out, or Stripe rejected
      -- it. Deleting the booking would lose it for good.
      (SELECT count(*) FROM public.bookings b, me
        WHERE (b.user_id = me.uid OR b.provider_id = me.pid)
          AND b.status = 'cancelled'
          AND b.payment_intent_id IS NOT NULL
          AND COALESCE(b.amount_paid, 0) > 0
          AND b.payment_status IN ('fully_paid', 'deposit_paid')
          AND b.policy_retained_amount IS NULL
          AND NOT EXISTS (SELECT 1 FROM public.booking_refunds br WHERE br.booking_id = b.id)) AS refunds_owed,
      (SELECT count(*) FROM public.refund_requests rr, me
        WHERE (rr.client_id = me.uid OR rr.provider_id = me.pid)
          AND rr.status IN ('with_provider', 'under_review')) AS refund_requests_open
  )
  SELECT COALESCE(jsonb_object_agg(k, v) FILTER (WHERE v > 0), '{}'::jsonb) INTO v_result
    FROM counts, LATERAL jsonb_each_text(to_jsonb(counts)) AS e(k, v_text),
         LATERAL (SELECT v_text::int AS v) AS n;
  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.account_deletion_blockers(uuid, text) IS
  'What on this account is still moving money; {} = safe to delete. Read by the account deletion functions.';
REVOKE EXECUTE ON FUNCTION public.account_deletion_blockers(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.delete_provider_profile()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid         UUID := auth.uid();
  v_provider_id UUID;
  v_has_client  BOOLEAN;
  v_upcoming    INT;
  v_blockers    JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not authenticated');
  END IF;

  SELECT id INTO v_provider_id FROM public.providers WHERE user_id = v_uid LIMIT 1;
  IF v_provider_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no provider profile');
  END IF;

  -- The column that owns the client hat. Was `(dob IS NOT NULL)`.
  SELECT COALESCE(has_client_profile, false) INTO v_has_client
    FROM public.users WHERE id = v_uid;

  -- Nothing may be deleted while money on this account is still moving:
  -- see account_deletion_blockers. Unfinished bookings keep their own
  -- message, which older app builds already show. The rows are locked first,
  -- so a booking or payout can't be added between the check and the delete.
  PERFORM 1 FROM public.users WHERE id = v_uid FOR UPDATE;
  PERFORM 1 FROM public.providers WHERE user_id = v_uid FOR UPDATE;
  v_blockers := public.account_deletion_blockers(v_uid, CASE WHEN v_has_client THEN 'provider' ELSE 'both' END);
  v_upcoming := COALESCE((v_blockers->>'unfinished_bookings')::int, 0);
  IF v_upcoming > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'upcoming_bookings', 'count', v_upcoming);
  END IF;
  IF v_blockers <> '{}'::jsonb THEN
    RETURN jsonb_build_object('ok', false, 'error', 'money_in_progress', 'blockers', v_blockers, 'audience', 'provider');
  END IF;

  INSERT INTO public.account_deletion_log
    (user_id, provider_id, email, deletion_type, had_client_profile, had_provider_profile, account_created_at)
  SELECT v_uid, v_provider_id, au.email,
         CASE WHEN NOT v_has_client THEN 'full_account' ELSE 'provider_profile' END,
         v_has_client, true, au.created_at
    FROM auth.users au WHERE au.id = v_uid;

  IF NOT v_has_client THEN
    UPDATE public.users     SET deletion_requested_at = NOW() WHERE id = v_uid;
    UPDATE public.providers  SET has_gone_live = false          WHERE id = v_provider_id;
    RETURN jsonb_build_object('ok', true, 'full_account_deleted', true, 'grace_period_days', 30);
  END IF;

  DELETE FROM public.reviews  WHERE provider_id = v_provider_id;
  -- Tips block a booking's delete (ON DELETE RESTRICT); every one is settled
  -- by now (account_deletion_blockers).
  DELETE FROM public.booking_tips WHERE provider_id = v_provider_id;
  DELETE FROM public.bookings WHERE provider_id = v_provider_id;

  DELETE FROM public.providers WHERE id = v_provider_id;

  UPDATE public.users SET
    role           = 'user',
    business_name  = NULL,
    business_email = NULL
  WHERE id = v_uid;

  -- auth metadata carries a `role` mirror that AuthContext falls back to when
  -- the profile fetch fails. Nothing ever reset it here, so an account that
  -- dropped its provider hat kept advertising one forever — which is how a hat
  -- the user no longer holds comes back on a bad launch. users.role stays the
  -- source of truth; this only stops the mirror contradicting it.
  UPDATE auth.users
     SET raw_user_meta_data =
           jsonb_set(COALESCE(raw_user_meta_data, '{}'::jsonb), '{role}', '"user"')
   WHERE id = v_uid;

  RETURN jsonb_build_object('ok', true, 'full_account_deleted', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_client_profile()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid         UUID := auth.uid();
  v_provider_id UUID;
  v_upcoming    INT;
  v_blockers    JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not authenticated');
  END IF;

  SELECT id INTO v_provider_id FROM public.providers WHERE user_id = v_uid LIMIT 1;

  -- Nothing may be deleted while money on this account is still moving:
  -- see account_deletion_blockers. Unfinished bookings keep their own
  -- message, which older app builds already show. The rows are locked first,
  -- so a booking or payout can't be added between the check and the delete.
  PERFORM 1 FROM public.users WHERE id = v_uid FOR UPDATE;
  PERFORM 1 FROM public.providers WHERE user_id = v_uid FOR UPDATE;
  v_blockers := public.account_deletion_blockers(v_uid, CASE WHEN v_provider_id IS NULL THEN 'both' ELSE 'client' END);
  v_upcoming := COALESCE((v_blockers->>'unfinished_bookings')::int, 0);
  IF v_upcoming > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'upcoming_bookings', 'count', v_upcoming);
  END IF;
  IF v_blockers <> '{}'::jsonb THEN
    RETURN jsonb_build_object('ok', false, 'error', 'money_in_progress', 'blockers', v_blockers, 'audience', 'client');
  END IF;

  INSERT INTO public.account_deletion_log
    (user_id, provider_id, email, deletion_type, had_client_profile, had_provider_profile, account_created_at)
  SELECT v_uid, v_provider_id, au.email,
         CASE WHEN v_provider_id IS NULL THEN 'full_account' ELSE 'client_profile' END,
         true, (v_provider_id IS NOT NULL), au.created_at
    FROM auth.users au WHERE au.id = v_uid;

  IF v_provider_id IS NULL THEN
    UPDATE public.users SET deletion_requested_at = NOW() WHERE id = v_uid;
    RETURN jsonb_build_object('ok', true, 'full_account_deleted', true, 'grace_period_days', 30);
  END IF;

  DELETE FROM public.reviews  WHERE user_id = v_uid;
  -- Tips block a booking's delete (ON DELETE RESTRICT); every one is settled
  -- by now (account_deletion_blockers).
  DELETE FROM public.booking_tips WHERE client_user_id = v_uid;
  DELETE FROM public.bookings WHERE user_id = v_uid;

  DELETE FROM public.bookmarks              WHERE user_id = v_uid;
  DELETE FROM public.event_plans            WHERE user_id = v_uid;
  DELETE FROM public.payment_methods        WHERE user_id = v_uid;
  DELETE FROM public.becca_chat_sessions    WHERE user_id = v_uid;
  DELETE FROM public.user_interactions      WHERE user_id = v_uid;
  DELETE FROM public.provider_follows       WHERE user_id = v_uid;
  DELETE FROM public.provider_conversations WHERE user_id = v_uid;
  DELETE FROM public.notifications          WHERE user_id = v_uid;
  DELETE FROM public.maintenance_items      WHERE user_id = v_uid;
  DELETE FROM public.maintenance_settings   WHERE user_id = v_uid;
  DELETE FROM public.client_external_bookings WHERE client_id = v_uid;
  DELETE FROM public.provider_stat_viewers    WHERE viewer_id = v_uid;
  DELETE FROM public.explore_collections      WHERE user_id = v_uid;

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
$function$;

CREATE OR REPLACE FUNCTION public.process_scheduled_account_deletions()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  v_processed INT := 0;
  v_waiting   INT := 0;
  v_failed    INT := 0;
  v_blockers  JSONB;
BEGIN
  FOR r IN
    SELECT id FROM public.users
     WHERE deletion_requested_at IS NOT NULL
       AND deletion_requested_at <= NOW() - INTERVAL '30 days'
  LOOP
    -- Each account on its own: one that fails rolls back alone instead of
    -- undoing every deletion in the run.
    BEGIN
      -- Locked, then checked: money that started moving during the 30 days
      -- (a refund request, a payout still held) waits, and the account is
      -- tried again tomorrow.
      PERFORM 1 FROM public.users WHERE id = r.id FOR UPDATE;
      PERFORM 1 FROM public.providers WHERE user_id = r.id FOR UPDATE;
      v_blockers := public.account_deletion_blockers(r.id, 'both');
      IF v_blockers <> '{}'::jsonb THEN
        RAISE WARNING 'process_scheduled_account_deletions: % waits, money still moving: %', r.id, v_blockers;
        v_waiting := v_waiting + 1;
        CONTINUE;
      END IF;

      DELETE FROM public.reviews  WHERE provider_id IN (SELECT id FROM public.providers WHERE user_id = r.id);
      DELETE FROM public.booking_tips
       WHERE client_user_id = r.id
          OR provider_id IN (SELECT id FROM public.providers WHERE user_id = r.id);
      DELETE FROM public.bookings WHERE provider_id IN (SELECT id FROM public.providers WHERE user_id = r.id);
      DELETE FROM public.providers WHERE user_id = r.id;
      DELETE FROM public.reviews  WHERE user_id = r.id;
      DELETE FROM public.bookings WHERE user_id = r.id;
      DELETE FROM public.users WHERE id = r.id;
      DELETE FROM auth.users   WHERE id = r.id;
      v_processed := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_scheduled_account_deletions: % failed: % (%)', r.id, SQLERRM, SQLSTATE;
      v_failed := v_failed + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'processed', v_processed, 'waiting', v_waiting, 'failed', v_failed);
END;
$function$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261112110000', 'account_deletion_waits_for_money')
ON CONFLICT (version) DO NOTHING;

COMMIT;
