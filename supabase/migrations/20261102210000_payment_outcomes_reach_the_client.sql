-- 20261102210000_payment_outcomes_reach_the_client.sql
--
-- Every checkout ends with the client being told how it went, even if the
-- app was closed, the connection dropped or the database was too busy to
-- answer in time.
--
-- Found 2026-11-02:
--   - On the real (Stripe) checkout nothing wrote "Payment received": only the
--     old mock path did. 29 Stripe bookings in 30 days, 0 notices.
--   - When the card was approved but confirming the booking failed, the app
--     showed "Your payment may have completed" and nothing ever followed. The
--     Stripe webhook that was meant to finish these receives no payment
--     events, and settleCheckout's cancel/refund outcomes were never recorded
--     or told to anyone.
--   - expire_checkout_batches() existed but nothing called it, so abandoned
--     checkouts sat as 'prepared' forever (8 on 2026-11-02, back to 7 Sep).
--
-- What this adds:
--   - checkout_batches.outcome: how a checkout that never became bookings
--     ended. 'not_charged' (the card was approved, then the payment was
--     cancelled), 'refunded' (it was taken, then refunded because the time
--     had gone) or 'abandoned' (never paid). The app reads it while it waits.
--   - notification type payment_not_completed (added to
--     notifications_type_check from the live list).
--   - record_checkout_outcome(): called by settleCheckout (service role
--     only). Records the outcome once and tells the client, except for
--     'abandoned', where nothing was ever taken.
--   - notify_client_payment_received(): "Payment received" when a checkout
--     is finalised, whoever finalised it (the app, the webhook or the job
--     below). One per checkout, on the first booking of it.
--   - process_stale_checkouts() + pg_cron job reconcile-checkouts, every 5
--     minutes. Marks unpaid checkouts past their hold as abandoned without
--     asking Stripe, and only calls the reconcile-checkouts edge function
--     when a paid-for checkout has been sitting for 3 minutes or more.
--   - Drops expire_checkout_batches(), which nothing called; the job above
--     replaces it.

BEGIN;

ALTER TABLE public.checkout_batches
  ADD COLUMN IF NOT EXISTS outcome text
  CHECK (outcome IN ('not_charged', 'refunded', 'abandoned'));

-- The job looks for prepared checkouts every 5 minutes; keep that cheap.
CREATE INDEX IF NOT EXISTS idx_checkout_batches_prepared
  ON public.checkout_batches (created_at) WHERE status = 'prepared';

DO $$
DECLARE
  v_def   text;
  v_types text[];
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conrelid = 'public.notifications'::regclass AND conname = 'notifications_type_check';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'notifications_type_check not found; refusing to rebuild it blind';
  END IF;

  IF v_def ~ '''\{[a-z_,]+\}''' THEN
    v_types := (substring(v_def from '''(\{[a-z_,]+\})'''))::text[];
  ELSE
    SELECT array_agg(DISTINCT r.m[1]) INTO v_types
      FROM regexp_matches(v_def, '''([a-z_]+)''::text', 'g') AS r(m);
  END IF;
  IF COALESCE(array_length(v_types, 1), 0) < 50 THEN
    RAISE EXCEPTION 'read only % types from notifications_type_check; refusing to rebuild it',
      COALESCE(array_length(v_types, 1), 0);
  END IF;

  v_types := ARRAY(
    SELECT DISTINCT t FROM unnest(v_types || ARRAY['payment_not_completed']) AS t ORDER BY t
  );
  ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
  EXECUTE format(
    'ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (%L::text[]))',
    v_types);
END $$;

CREATE OR REPLACE FUNCTION public.record_checkout_outcome(p_checkout_batch_id uuid, p_outcome text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid;
  v_amount  numeric;
  v_figure  text;
BEGIN
  IF p_outcome NOT IN ('not_charged', 'refunded', 'abandoned') THEN
    RAISE EXCEPTION 'Unknown checkout outcome %', p_outcome;
  END IF;

  -- Once only: a second settle of the same checkout records nothing more.
  UPDATE public.checkout_batches
     SET outcome = p_outcome,
         status  = CASE WHEN status = 'prepared' THEN 'expired' ELSE status END
   WHERE id = p_checkout_batch_id
     AND outcome IS NULL
     AND status <> 'finalised'
  RETURNING user_id, amount_due INTO v_user_id, v_amount;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF p_outcome = 'abandoned' THEN
    RETURN true;
  END IF;

  v_figure := '£' || TO_CHAR(COALESCE(v_amount, 0), 'FM999990.00');
  -- The held bookings may already have been cleared by expire_cart_holds, so
  -- the notice names the amount rather than a service.
  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role, metadata)
  VALUES (
    v_user_id, 'payment_not_completed',
    CASE p_outcome WHEN 'refunded' THEN 'Booking not completed' ELSE 'Payment didn''t go through' END,
    CASE p_outcome
      WHEN 'refunded' THEN
        'Your time was no longer available by the time your payment of ' || v_figure ||
        ' went through, so we''ve refunded it in full. It can take 5–10 working days to show on your statement.'
      ELSE
        'We couldn''t confirm your booking in time, so your payment of ' || v_figure ||
        ' was cancelled and you haven''t been charged. If your bank shows it as pending, it will drop off in a few days.'
    END,
    'high', FALSE, NULL, NULL, 'client',
    jsonb_build_object('checkout_batch_id', p_checkout_batch_id, 'outcome', p_outcome,
                       'amount_pence', ROUND(COALESCE(v_amount, 0) * 100))
  );
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_checkout_outcome(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_checkout_outcome(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.notify_client_payment_received()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count       integer;
  v_first       uuid;
  v_service     text;
  v_providers   integer;
  v_provider_id uuid;
  v_figure      text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'finalised' OR OLD.status = 'finalised' THEN
    RETURN NEW;
  END IF;

  SELECT count(*),
         (array_agg(b.id ORDER BY b.booking_date, b.booking_time, b.id))[1],
         (array_agg(COALESCE(NULLIF(BTRIM(b.service_name_snapshot), ''), 'your booking')
                    ORDER BY b.booking_date, b.booking_time, b.id))[1],
         count(DISTINCT b.provider_id),
         (array_agg(b.provider_id ORDER BY b.booking_date, b.booking_time, b.id))[1]
    INTO v_count, v_first, v_service, v_providers, v_provider_id
    FROM public.checkout_batch_items i
    JOIN public.bookings b ON b.id = i.booking_id
   WHERE i.checkout_batch_id = NEW.id;
  IF COALESCE(v_count, 0) = 0 THEN
    RETURN NEW;
  END IF;

  v_figure := '£' || TO_CHAR(COALESCE(NEW.amount_due, 0), 'FM999990.00');
  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role, metadata)
  VALUES (
    NEW.user_id, 'payment_success', 'Payment received',
    CASE WHEN v_count > 1
      THEN 'We received your payment of ' || v_figure || ' for ' || v_count || ' services.'
      ELSE 'We received your payment of ' || v_figure || ' for ' || v_service || '.'
    END,
    'medium', FALSE, v_first, CASE WHEN v_providers = 1 THEN v_provider_id END, 'client',
    jsonb_build_object('checkout_batch_id', NEW.id, 'amount_pence', ROUND(COALESCE(NEW.amount_due, 0) * 100))
  );
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_client_payment_received() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS after_checkout_finalised_notify_client ON public.checkout_batches;
CREATE TRIGGER after_checkout_finalised_notify_client
  AFTER UPDATE OF status ON public.checkout_batches
  FOR EACH ROW EXECUTE FUNCTION public.notify_client_payment_received();

CREATE OR REPLACE FUNCTION public.process_stale_checkouts()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_key text;
BEGIN
  -- Never paid and past the hold: nothing to ask Stripe.
  UPDATE public.checkout_batches
     SET status = 'expired', outcome = 'abandoned'
   WHERE status = 'prepared' AND payment_intent_id IS NULL AND expires_at <= now();

  -- A payment was started 3+ minutes ago and the checkout is still open: the
  -- edge function asks Stripe how it ended and finishes it.
  IF NOT EXISTS (
    SELECT 1 FROM public.checkout_batches
     WHERE status = 'prepared' AND payment_intent_id IS NOT NULL
       AND created_at <= now() - interval '3 minutes'
  ) THEN
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
    url     := 'https://ztrfpfvvejzaysrelmfm.supabase.co/functions/v1/reconcile-checkouts',
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

REVOKE ALL ON FUNCTION public.process_stale_checkouts() FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.expire_checkout_batches();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reconcile-checkouts') THEN
    PERFORM cron.unschedule('reconcile-checkouts');
  END IF;
  PERFORM cron.schedule('reconcile-checkouts', '*/5 * * * *', 'SELECT public.process_stale_checkouts();');
END $$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261102210000', 'payment_outcomes_reach_the_client')
ON CONFLICT (version) DO NOTHING;

COMMIT;
