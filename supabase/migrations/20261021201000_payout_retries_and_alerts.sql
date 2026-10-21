-- Failed provider payouts are retried, and someone hears about them.
--
-- Until now a failed transfer in release-payouts was marked 'failed' and left:
-- nothing retried it and nobody was told. With this (and the release-payouts
-- and stripe-webhook deploys on feat/payout-retries-and-alerts):
--   * a failed transfer stays 'held' with release_after pushed back 1, 2 and
--     then 4 days, and only becomes 'failed' after the 4th try
--     (_shared/payoutRetry.ts; user decision 2026-10-21);
--   * every failure emails support@ straight away, and the provider gets a
--     'payout_failed' notification when the cause is their Stripe account (or
--     when their own bank payout fails, via the webhook);
--   * a daily 08:00 UTC email lists everything waiting on a person: failed
--     payouts, money providers owe, open refund requests. It isn't sent on a
--     day with nothing waiting.
--
-- 1. provider_payouts.attempt_count / last_failed_at / failure_cause.
-- 2. notifications_type_check gains 'payout_failed'. Restated from the list in
--    20261021195500_tip_received_notification (live 50 + 'tip_received',
--    checked against the live constraint 2026-10-21), so this MUST be applied
--    AFTER 20261021195500: applied before it, 195500 would re-narrow the CHECK
--    and drop 'payout_failed'. Not in send-push-notification's provider map,
--    so it always pushes (the provider has to act on it).
-- 3. money_needing_attention(): the one read of those three lists, for the
--    daily email now and the admin screen next. Service role only.
-- 4. process_money_daily_summary() + cron 'money-daily-summary', same
--    vault-key + net.http_post shape as process_due_payouts().
--
-- Frontier at authoring: 20261021112728. Written while cerviced-c2 holds the
-- migration lock for 20261021195500 (unapplied); 20261021114000 and
-- 20261021200000 are also written and unapplied. Apply order:
-- 195500 → 200000 → this.

-- ── 1. retry bookkeeping ────────────────────────────────────────────────────
ALTER TABLE public.provider_payouts
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0
    CONSTRAINT provider_payouts_attempt_count_check CHECK (attempt_count >= 0),
  ADD COLUMN IF NOT EXISTS last_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS failure_cause text
    CONSTRAINT provider_payouts_failure_cause_check
    CHECK (failure_cause IS NULL OR failure_cause IN ('platform_balance', 'provider_account', 'other'));

-- ── 2. allow the new type ──────────────────────────────────────────────────
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'cancel_window_closing', 'booking_pending', 'booking_confirmed', 'booking_declined',
    'booking_cancelled', 'booking_reminder', 'booking_in_progress', 'booking_not_started',
    'no_show', 'payment_success', 'new_provider', 'reschedule_request',
    'reschedule_provider_response', 'reschedule_confirmed', 'reschedule_declined',
    'reschedule_expired', 'review_request', 'review_received', 'promotion',
    'intake_form_reminder', 'intake_form_received', 'intake_form_completed',
    'info_pack_received', 'provider_message', 'announcement', 'balance_reminder',
    'waitlist_slot_available', 'new_message', 'address_released', 'birthday_greeting',
    'post_appt_check_in', 'rebooking_nudge', 'daily_recap', 'schedule_fully_booked',
    'pending_booking_reminder', 'provider_no_show', 'no_show_disputed', 'points_earned',
    'cancellation_settled', 'fee_charged', 'fee_disputed', 'fee_dispute_resolved',
    'refund_requested', 'refund_request_updated', 'maintenance_due', 'aftercare_available',
    'fee_payment_requested', 'fee_paid_by_client', 'fee_payment_lapsed',
    'provider_saved', 'tip_received', 'payout_failed'
  ]));

-- ── 3. what's waiting on a person ──────────────────────────────────────────
-- Each list is capped at 100 rows; the counts are uncapped so a backlog shows.
CREATE OR REPLACE FUNCTION public.money_needing_attention()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'failed_count', (SELECT count(*) FROM provider_payouts
                      WHERE status = 'failed' OR (status = 'held' AND attempt_count > 0)),
    'failed', COALESCE((
      SELECT jsonb_agg(row_to_json(f) ORDER BY f.last_failed_at DESC NULLS LAST) FROM (
        SELECT pp.id AS payout_id, pp.booking_id, pp.provider_id, p.display_name AS provider_name,
               pp.payout_amount AS amount_pence, pp.status, pp.attempt_count, pp.failure_cause,
               pp.last_failed_at,
               CASE WHEN pp.status = 'held' THEN pp.release_after END AS next_try_at,
               b.service_name_snapshot AS service_name, b.booking_date
          FROM provider_payouts pp
          LEFT JOIN providers p ON p.id = pp.provider_id
          LEFT JOIN bookings b ON b.id = pp.booking_id
         WHERE pp.status = 'failed' OR (pp.status = 'held' AND pp.attempt_count > 0)
         ORDER BY pp.last_failed_at DESC NULLS LAST
         LIMIT 100) f), '[]'::jsonb),
    'owed_count', (SELECT count(*) FROM provider_shortfalls WHERE settled_at IS NULL),
    'owed', COALESCE((
      SELECT jsonb_agg(row_to_json(o) ORDER BY o.created_at) FROM (
        SELECT s.id AS shortfall_id, s.provider_id, p.display_name AS provider_name,
               s.amount_pence - s.recovered_pence AS owed_pence, s.source, s.created_at,
               b.service_name_snapshot AS service_name
          FROM provider_shortfalls s
          LEFT JOIN providers p ON p.id = s.provider_id
          LEFT JOIN bookings b ON b.id = s.booking_id
         WHERE s.settled_at IS NULL
         ORDER BY s.created_at
         LIMIT 100) o), '[]'::jsonb),
    'refunds_count', (SELECT count(*) FROM refund_requests WHERE status IN ('with_provider', 'under_review')),
    'refunds', COALESCE((
      SELECT jsonb_agg(row_to_json(r) ORDER BY r.created_at) FROM (
        SELECT rr.id AS request_id, rr.booking_id, rr.status, rr.reason, rr.message,
               rr.provider_note, rr.created_at, rr.passed_to_cerviced_at,
               b.customer_name AS client_name, p.display_name AS provider_name,
               b.service_name_snapshot AS service_name, b.booking_date,
               ROUND(COALESCE(b.amount_paid, 0) * 100)::integer AS paid_pence,
               ROUND(COALESCE(b.refunded_amount, 0) * 100)::integer AS refunded_pence
          FROM refund_requests rr
          LEFT JOIN bookings b ON b.id = rr.booking_id
          LEFT JOIN providers p ON p.id = rr.provider_id
         WHERE rr.status IN ('with_provider', 'under_review')
         ORDER BY rr.created_at
         LIMIT 100) r), '[]'::jsonb)
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.money_needing_attention() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.money_needing_attention() TO service_role;

-- ── 4. the daily email ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_money_daily_summary()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.provider_payouts
                  WHERE status = 'failed' OR (status = 'held' AND attempt_count > 0))
     AND NOT EXISTS (SELECT 1 FROM public.provider_shortfalls WHERE settled_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.refund_requests WHERE status IN ('with_provider', 'under_review'))
  THEN
    RETURN false;
  END IF;

  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
   WHERE name = 'service_role_key'
   LIMIT 1;
  IF v_key IS NULL OR v_key = '' OR v_key LIKE '<%' THEN
    RETURN false;
  END IF;

  PERFORM net.http_post(
    url     := 'https://ztrfpfvvejzaysrelmfm.supabase.co/functions/v1/money-daily-summary',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  RETURN true;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.process_money_daily_summary() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('money-daily-summary')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'money-daily-summary');
SELECT cron.schedule('money-daily-summary', '0 8 * * *', 'SELECT public.process_money_daily_summary();');

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261021201000', 'payout_retries_and_alerts')
ON CONFLICT (version) DO NOTHING;
