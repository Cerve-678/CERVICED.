-- Refunds that never went out get sent again, and support hears about them.
--
-- Before: a provider cancel or decline (provider_cancel_own_booking,
-- decline_reschedule_offer) or an unanswered request expiring
-- (process_expire_stale_pending_bookings) cancels the booking and fires
-- refund_booking_async, an HTTP call nobody checks. A client cancel asks the
-- app to call apply-cancellation-refund afterwards. If either call failed (the
-- function down, the vault key missing, the app closed), the booking stayed
-- cancelled with the client's money taken and nothing ever tried again.
--
-- Now:
-- * bookings_owed_a_refund(): cancelled bookings still paid, with no refund
--   and (for a client's own cancellation) no policy settlement, 10+ minutes on,
--   with why: 'provider_cancelled', 'request_expired' (an unanswered request:
--   cancelled_by 'system' with declined_at set), 'offer_declined' (the client
--   declined the provider's new time: refunded in full, though the cancel is
--   stamped as the client's), 'client_cancelled' (the only one settled by the
--   frozen policy) or 'other_automatic' (some other server cancel: listed for
--   a person, never refunded automatically). "Still owed" means still paid
--   with no recorded refund, so a refund Stripe rejected counts too.
-- * process_unsent_refunds() (cron, every 10 minutes): sends each again, at
--   most every 30 minutes for 5 tries, then once a day, within 30 days of the
--   cancel; a missing vault key uses up no tries. A
--   client's own cancel goes through apply-cancellation-refund (which now
--   accepts the server); everything else back through refund_booking_async.
--   Both are idempotent: they count what Stripe already refunded.
-- * unsent_refund_retries records the tries. Server-only.
-- * money_needing_attention() and process_money_daily_summary(): anything
--   still owed an hour on is in support's daily email.
-- Redefined from live with md5 guards, per supabase/MIGRATION_OWNER.md.

BEGIN;

DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.money_needing_attention()'::regprocedure)) <> '30e055f6a43b22013134d524d86eb063' THEN
    RAISE EXCEPTION 'money_needing_attention changed live since this migration was written; rebuild it from live';
  END IF;
  IF md5(pg_get_functiondef('public.process_money_daily_summary()'::regprocedure)) <> '26415379c65c6923420f95a7f933a2cc' THEN
    RAISE EXCEPTION 'process_money_daily_summary changed live since this migration was written; rebuild it from live';
  END IF;
END
$guard$;

CREATE TABLE public.unsent_refund_retries (
  booking_id      uuid PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  attempts        integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_attempt_at timestamptz
);
ALTER TABLE public.unsent_refund_retries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.unsent_refund_retries FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.unsent_refund_retries IS
  'How often process_unsent_refunds has sent a cancelled booking''s refund again. Server-only.';

CREATE FUNCTION public.bookings_owed_a_refund()
 RETURNS TABLE (booking_id uuid, cause text, cancelled_at timestamptz, amount_pence integer,
                client_name text, provider_name text, service_name text)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT b.id,
         CASE
           WHEN b.cancelled_by = 'provider' THEN 'provider_cancelled'
           WHEN b.cancelled_by = 'system' AND b.declined_at IS NOT NULL THEN 'request_expired'
           WHEN b.cancelled_by = 'system' THEN 'other_automatic'
           WHEN d.declined_offer THEN 'offer_declined'
           ELSE 'client_cancelled'
         END,
         b.cancelled_at,
         ROUND(COALESCE(b.amount_paid, 0) * 100)::integer,
         b.customer_name, b.provider_name_snapshot, b.service_name_snapshot
    FROM public.bookings b
    CROSS JOIN LATERAL (
      SELECT EXISTS (SELECT 1 FROM public.booking_reschedule_requests r
                      WHERE r.booking_id = b.id AND r.status = 'rejected' AND r.cancel_if_declined) AS declined_offer
    ) d
   WHERE b.status = 'cancelled'
     AND b.payment_intent_id IS NOT NULL
     AND COALESCE(b.amount_paid, 0) > 0
     AND b.payment_status IN ('fully_paid', 'deposit_paid')
     -- No refund on record. Not stripe_refund_id: a refund Stripe rejected
     -- leaves its id behind while the money stays taken.
     AND NOT EXISTS (SELECT 1 FROM public.booking_refunds br WHERE br.booking_id = b.id)
     AND b.cancelled_at IS NOT NULL
     AND b.cancelled_at < now() - interval '10 minutes'
     AND (b.cancelled_by IN ('provider', 'system')
          -- A client's cancellation is settled by its frozen policy: a kept
          -- deposit leaves no refund id but records policy_retained_amount.
          OR (b.cancelled_by = 'client' AND (d.declined_offer OR b.policy_retained_amount IS NULL)));
$function$;
REVOKE EXECUTE ON FUNCTION public.bookings_owed_a_refund() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.process_unsent_refunds()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r     record;
  v_key text;
  v_sent integer := 0;
BEGIN
  -- Without the key nothing can be sent, so no try is used up.
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  IF v_key IS NULL OR v_key = '' OR v_key LIKE '<%' THEN
    RAISE WARNING 'process_unsent_refunds: service_role_key unavailable; nothing sent';
    RETURN 0;
  END IF;

  FOR r IN
    SELECT o.booking_id, o.cause
      FROM public.bookings_owed_a_refund() o
      LEFT JOIN public.unsent_refund_retries x ON x.booking_id = o.booking_id
     WHERE o.cancelled_at > now() - interval '30 days'
       AND o.cause <> 'other_automatic'
       -- Five tries 30 minutes apart, then once a day while it's still owed.
       AND (x.last_attempt_at IS NULL
            OR (x.attempts < 5 AND x.last_attempt_at < now() - interval '30 minutes')
            OR x.last_attempt_at < now() - interval '1 day')
     ORDER BY o.cancelled_at
     LIMIT 20
  LOOP
    INSERT INTO public.unsent_refund_retries (booking_id, attempts, last_attempt_at)
    VALUES (r.booking_id, 1, now())
    ON CONFLICT (booking_id) DO UPDATE
      SET attempts = unsent_refund_retries.attempts + 1, last_attempt_at = now();

    IF r.cause = 'client_cancelled' THEN
      PERFORM net.http_post(
        url     := 'https://ztrfpfvvejzaysrelmfm.supabase.co/functions/v1/apply-cancellation-refund',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
        body    := jsonb_build_object('bookingId', r.booking_id),
        timeout_milliseconds := 30000
      );
    ELSE
      -- A full refund, as the original cancel meant: refund-payment counts what
      -- Stripe already refunded, so a refund that did go out isn't repeated.
      PERFORM public.refund_booking_async(r.booking_id, 'unsent_refund_retry');
    END IF;
    v_sent := v_sent + 1;
  END LOOP;
  RETURN v_sent;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.process_unsent_refunds() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.money_needing_attention()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
         LIMIT 100) r), '[]'::jsonb),
    -- Cancelled bookings still owed a refund an hour on: the refund never
    -- went out (process_unsent_refunds keeps trying for a while).
    'unsent_refunds_count', (SELECT count(*) FROM public.bookings_owed_a_refund()
                              WHERE cancelled_at < now() - interval '1 hour'),
    'unsent_refunds', COALESCE((
      SELECT jsonb_agg(row_to_json(u) ORDER BY u.cancelled_at) FROM (
        SELECT o.booking_id, o.cause, o.cancelled_at, o.amount_pence,
               o.client_name, o.provider_name, o.service_name,
               COALESCE(x.attempts, 0) AS attempts
          FROM public.bookings_owed_a_refund() o
          LEFT JOIN public.unsent_refund_retries x ON x.booking_id = o.booking_id
         WHERE o.cancelled_at < now() - interval '1 hour'
         ORDER BY o.cancelled_at
         LIMIT 100) u), '[]'::jsonb)
  );
$function$;

CREATE OR REPLACE FUNCTION public.process_money_daily_summary()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_key text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.provider_payouts
                  WHERE status = 'failed' OR (status = 'held' AND attempt_count > 0))
     AND NOT EXISTS (SELECT 1 FROM public.provider_shortfalls WHERE settled_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.refund_requests WHERE status IN ('with_provider', 'under_review'))
     AND NOT EXISTS (SELECT 1 FROM public.bookings_owed_a_refund() WHERE cancelled_at < now() - interval '1 hour')
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

-- Safe to re-run: an existing job of this name is replaced.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'retry-unsent-refunds';
SELECT cron.schedule('retry-unsent-refunds', '3,13,23,33,43,53 * * * *', 'SELECT public.process_unsent_refunds();');

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261112120000', 'retry_unsent_refunds')
ON CONFLICT (version) DO NOTHING;

COMMIT;
