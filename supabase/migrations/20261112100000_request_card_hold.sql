-- Requests hold the card instead of charging it.
--
-- Until now every checkout was captured the moment the card was approved,
-- including requests a provider still had to accept. A declined or unanswered
-- request was then refunded, which takes the client's bank 5–10 working days
-- to show, for money that should never have left.
--
-- Checkout already authorises first and captures second (capture_method
-- 'manual' in create-payment-intent). This keeps a checkout uncaptured while
-- the provider decides, when — and only when — EVERY booking in it is a
-- request. A Stripe PaymentIntent can be captured once, so a basket that mixes
-- requests with instant bookings is still charged at checkout as before, and a
-- request in it that is later declined is refunded as before.
--
-- While held:
--   * the bookings carry payment_status 'authorised' (money approved, not
--     taken) and no provider payout row exists for them;
--   * the first acceptance captures everything still standing in the checkout
--     (requests already declined, expired or withdrawn are left out of the
--     amount); a request in it that is declined later is refunded as usual;
--   * when every request ends without one being accepted, the hold is released
--     and the bookings read 'not_charged';
--   * a client withdrawing a held request is never charged, whatever the
--     provider's late-cancellation rule (user decision 2026-11-12).
--
-- Stripe calls happen in the settle-held-payment edge function. The decision
-- is taken here, under a row lock on the checkout, so two answers arriving
-- together can't capture twice or capture the wrong amount; a retry reuses the
-- decision already recorded. A 5-minute sweep picks up anything a dropped
-- trigger call missed.
--
-- Live functions are patched with md5 guards.

BEGIN;

-- 1. The two new payment states ─────────────────────────────────────────────
ALTER TABLE public.bookings DROP CONSTRAINT bookings_payment_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_payment_status_check
  CHECK (payment_status = ANY (ARRAY[
    'pending', 'deposit_paid', 'fully_paid', 'refund_pending', 'refunded',
    'partially_refunded', 'failed',
    -- Approved on the card and held, not taken: a request awaiting an answer.
    'authorised',
    -- The hold was released without taking anything.
    'not_charged'
  ]));

-- 2. Where a held checkout is up to ──────────────────────────────────────────
ALTER TABLE public.checkout_batches
  ADD COLUMN IF NOT EXISTS capture_state text
    CHECK (capture_state IN ('held', 'settling', 'captured', 'released')),
  ADD COLUMN IF NOT EXISTS held_action text
    CHECK (held_action IN ('capture', 'release')),
  ADD COLUMN IF NOT EXISTS held_capture_pence integer
    CHECK (held_capture_pence IS NULL OR held_capture_pence > 0),
  ADD COLUMN IF NOT EXISTS held_settled_at timestamptz;

COMMENT ON COLUMN public.checkout_batches.capture_state IS
  'NULL: captured at checkout (the normal case). held: every booking is a request and the card is only authorised. settling: a capture/release is decided and being sent to Stripe (held_action, held_capture_pence). captured / released: done.';

CREATE INDEX IF NOT EXISTS checkout_batches_capture_state_open_idx
  ON public.checkout_batches (capture_state)
  WHERE capture_state IN ('held', 'settling');

-- 3. Is every booking in this checkout a request? ───────────────────────────
-- The same rule finalize_checkout uses: a provider without auto-accept, or an
-- emergency request (never auto-accepted).
CREATE FUNCTION public.checkout_batch_all_requests(p_checkout_batch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT EXISTS (
           SELECT 1 FROM public.bookings b
            WHERE b.hold_batch_id = p_checkout_batch_id AND b.status = 'on_hold')
     AND NOT EXISTS (
           SELECT 1
             FROM public.bookings b
             JOIN public.providers p ON p.id = b.provider_id
            WHERE b.hold_batch_id = p_checkout_batch_id
              AND b.status = 'on_hold'
              AND COALESCE(p.auto_accept_bookings, false)
              AND NOT COALESCE(b.is_emergency_request, false));
$function$;

-- 4. Finalise a checkout without taking the money ───────────────────────────
-- Marks the bookings 'authorised' BEFORE finalize_checkout moves them out of
-- on_hold, so the payout trigger (step 6) sees them as uncharged and creates
-- no payout. Atomic with the finalise: a checkout is never left finalised but
-- unmarked.
CREATE FUNCTION public.finalize_checkout_held(p_checkout_batch_id uuid, p_payment_intent_id text)
RETURNS TABLE(booking_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NOT public.checkout_batch_all_requests(p_checkout_batch_id) THEN
    RAISE EXCEPTION 'Checkout is not all requests';
  END IF;

  UPDATE public.bookings
     SET payment_status = 'authorised'
   WHERE hold_batch_id = p_checkout_batch_id
     AND status = 'on_hold';

  -- Before finalising: finalising fires the client's payment notice, which
  -- reads capture_state to say "held", not "received" (step 7).
  UPDATE public.checkout_batches
     SET capture_state = 'held'
   WHERE id = p_checkout_batch_id;

  RETURN QUERY SELECT f.booking_id FROM public.finalize_checkout(p_checkout_batch_id, p_payment_intent_id) f;
END;
$function$;

-- 5. Decide, then record, a held checkout's outcome ─────────────────────────
-- Returns what the edge function must do: 'capture' (with the amount),
-- 'release', or 'wait'. Once decided the batch is 'settling' and the same
-- decision comes back on every retry, so Stripe's idempotency key always sees
-- identical parameters.
CREATE FUNCTION public.begin_held_settlement(p_payment_intent_id text)
RETURNS TABLE(action text, amount_pence integer, checkout_batch_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_batch    public.checkout_batches%ROWTYPE;
  v_accepted boolean;
  v_pending  boolean;
  v_amount   integer;
BEGIN
  SELECT * INTO v_batch
    FROM public.checkout_batches
   WHERE payment_intent_id = p_payment_intent_id
     AND capture_state IN ('held', 'settling')
   FOR UPDATE;
  IF NOT FOUND THEN
    action := 'none'; amount_pence := NULL; checkout_batch_id := NULL;
    RETURN NEXT; RETURN;
  END IF;

  checkout_batch_id := v_batch.id;

  IF v_batch.capture_state = 'settling' THEN
    action := v_batch.held_action; amount_pence := v_batch.held_capture_pence;
    RETURN NEXT; RETURN;
  END IF;

  SELECT bool_or(b.status NOT IN ('pending', 'cancelled')),
         bool_or(b.status = 'pending')
    INTO v_accepted, v_pending
    FROM public.bookings b
   WHERE b.payment_intent_id = p_payment_intent_id;

  IF COALESCE(v_accepted, false) THEN
    -- Everything still standing: the accepted bookings and any request in the
    -- same checkout still waiting (charged now; refunded as usual if it is
    -- declined later). Cancelled ones were never charged.
    SELECT SUM(ROUND(b.amount_paid * 100))::integer INTO v_amount
      FROM public.bookings b
     WHERE b.payment_intent_id = p_payment_intent_id
       AND b.status <> 'cancelled';
    UPDATE public.checkout_batches
       SET capture_state = 'settling', held_action = 'capture', held_capture_pence = v_amount
     WHERE id = v_batch.id;
    action := 'capture'; amount_pence := v_amount;
  ELSIF NOT COALESCE(v_pending, false) THEN
    UPDATE public.checkout_batches
       SET capture_state = 'settling', held_action = 'release', held_capture_pence = NULL
     WHERE id = v_batch.id;
    action := 'release'; amount_pence := NULL;
  ELSE
    action := 'wait'; amount_pence := NULL;
  END IF;
  RETURN NEXT;
END;
$function$;

-- Called once Stripe has done it. Moving a booking from 'authorised' to paid
-- is what creates its provider payout (step 6).
CREATE FUNCTION public.complete_held_settlement(p_payment_intent_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_batch public.checkout_batches%ROWTYPE;
BEGIN
  SELECT * INTO v_batch
    FROM public.checkout_batches
   WHERE payment_intent_id = p_payment_intent_id
     AND capture_state = 'settling'
   FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_batch.held_action = 'capture' THEN
    UPDATE public.bookings
       SET payment_status = CASE WHEN payment_type = 'deposit' THEN 'deposit_paid' ELSE 'fully_paid' END
     WHERE payment_intent_id = p_payment_intent_id
       AND payment_status = 'authorised'
       AND status <> 'cancelled';

    -- The checkout's notice said the card was held; this is the payment.
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role, metadata)
    SELECT v_batch.user_id, 'payment_success', 'Payment received',
           'Your request was accepted, so we took the £' ||
             TO_CHAR(v_batch.held_capture_pence / 100.0, 'FM999990.00') || ' held on your card.',
           'medium', FALSE, b.id, b.provider_id, 'client',
           jsonb_build_object('checkout_batch_id', v_batch.id, 'amount_pence', v_batch.held_capture_pence)
      FROM public.bookings b
     WHERE b.payment_intent_id = p_payment_intent_id
       AND b.status NOT IN ('pending', 'cancelled')
     ORDER BY b.booking_date, b.booking_time, b.id
     LIMIT 1;
  END IF;

  UPDATE public.bookings
     SET payment_status = 'not_charged'
   WHERE payment_intent_id = p_payment_intent_id
     AND payment_status = 'authorised';

  UPDATE public.checkout_batches
     SET capture_state = CASE WHEN v_batch.held_action = 'capture' THEN 'captured' ELSE 'released' END,
         held_settled_at = now()
   WHERE id = v_batch.id;
END;
$function$;

-- 6. No payout for money that hasn't been taken ─────────────────────────────
DO $$
BEGIN
  IF md5(pg_get_functiondef('public.create_held_payout_on_finalize'::regproc))
     <> '3e45e6d13215a4c7c11d15ae6e2a3dd3' THEN
    RAISE EXCEPTION 'create_held_payout_on_finalize changed since this migration was written';
  END IF;
END $$;

-- Replace `p_old` in `p_def` exactly `p_expected` times, or stop.
CREATE FUNCTION pg_temp.patch(p_def TEXT, p_old TEXT, p_new TEXT, p_expected INT)
 RETURNS TEXT
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_found INT := (length(p_def) - length(replace(p_def, p_old, ''))) / length(p_old);
BEGIN
  IF v_found <> p_expected THEN
    RAISE EXCEPTION 'expected % of [%], found %', p_expected, p_old, v_found;
  END IF;
  RETURN replace(p_def, p_old, p_new);
END;
$function$;

DO $$
BEGIN
  EXECUTE pg_temp.patch(
    pg_get_functiondef('public.create_held_payout_on_finalize'::regproc),
    $old$  IF NOT (OLD.status = 'on_hold'
          AND NEW.status IN ('pending', 'confirmed')
          AND NEW.payment_intent_id IS NOT NULL) THEN
    RETURN NEW;
  END IF;$old$,
    $new$  -- Two moments create a payout: a checkout captured at once being
  -- finalised, and a held request's money being captured (authorised → paid).
  -- A held booking being finalised is neither: nothing has been taken.
  IF NOT (
       (OLD.status = 'on_hold'
        AND NEW.status IN ('pending', 'confirmed')
        AND NEW.payment_status IS DISTINCT FROM 'authorised')
    -- Only the server records a capture (complete_held_settlement, run by
    -- the edge function as service role), never a signed-in user's call.
    OR (OLD.payment_status = 'authorised'
        AND NEW.payment_status IN ('fully_paid', 'deposit_paid')
        AND auth.uid() IS NULL)
  ) OR NEW.payment_intent_id IS NULL THEN
    RETURN NEW;
  END IF;$new$,
    1);
END $$;

DROP TRIGGER IF EXISTS on_booking_held_payment_captured_create_payout ON public.bookings;
CREATE TRIGGER on_booking_held_payment_captured_create_payout
  AFTER UPDATE OF payment_status ON public.bookings
  FOR EACH ROW
  WHEN (OLD.payment_status = 'authorised' AND NEW.payment_status IN ('fully_paid', 'deposit_paid'))
  EXECUTE FUNCTION public.create_held_payout_on_finalize();

-- 7a. The checkout notice says "held", not "received", for a held checkout ──
DO $$
BEGIN
  IF md5(pg_get_functiondef('public.notify_client_payment_received'::regproc))
     <> 'c5b191263668dc4e16360d5b1b837d08' THEN
    RAISE EXCEPTION 'notify_client_payment_received changed since this migration was written';
  END IF;
  EXECUTE pg_temp.patch(
    pg_get_functiondef('public.notify_client_payment_received'::regproc),
    $old$    NEW.user_id, 'payment_success', 'Payment received',
    CASE WHEN v_count > 1
      THEN 'We received your payment of ' || v_figure || ' for ' || v_count || ' services.'
      ELSE 'We received your payment of ' || v_figure || ' for ' || v_service || '.'
    END,$old$,
    $new$    NEW.user_id, 'payment_success',
    CASE WHEN NEW.capture_state = 'held' THEN 'Card held, not charged' ELSE 'Payment received' END,
    CASE
      WHEN NEW.capture_state = 'held'
      THEN 'We''ve put a hold of ' || v_figure || ' on your card for ' ||
           CASE WHEN v_count > 1 THEN v_count || ' requests' ELSE v_service END ||
           '. You''re only charged if it''s accepted.'
      WHEN v_count > 1
      THEN 'We received your payment of ' || v_figure || ' for ' || v_count || ' services.'
      ELSE 'We received your payment of ' || v_figure || ' for ' || v_service || '.'
    END,$new$,
    1);
END $$;

-- 7b. Tell the client a declined held request costs them nothing ───────────
DO $$
BEGIN
  IF md5(pg_get_functiondef('public.handle_booking_status_change'::regproc))
     <> 'a1aad41031c4caa4f4621e7ab1466419' THEN
    RAISE EXCEPTION 'handle_booking_status_change changed since this migration was written';
  END IF;
END $$;

DO $$
DECLARE
  v_def text := pg_get_functiondef('public.handle_booking_status_change'::regproc);
  v_line text := $l$ || CASE WHEN NEW.payment_status = 'authorised'
                 THEN ' You won''t be charged: the hold on your card is released.' ELSE '' END,$l$;
BEGIN
  v_def := pg_temp.patch(v_def,
    $old$              ' requested service(s), starting with ' || NEW.service_name_snapshot ||
              ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || '.',$old$,
    $new$              ' requested service(s), starting with ' || NEW.service_name_snapshot ||
              ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || '.'$new$ || v_line,
    1);
  v_def := pg_temp.patch(v_def,
    $old$            ' is unable to accept your booking for ' ||
            NEW.service_name_snapshot ||
            ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || '.',$old$,
    $new$            ' is unable to accept your booking for ' ||
            NEW.service_name_snapshot ||
            ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || '.'$new$ || v_line,
    1);
  EXECUTE v_def;
END $$;

-- 8. Settle when a held request is answered ─────────────────────────────────
-- Posts to the edge function the same way refund_booking_async does.
CREATE FUNCTION public.settle_held_payment_async(p_payment_intent_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_key text;
BEGIN
  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
   WHERE name = 'service_role_key'
   LIMIT 1;
  IF v_key IS NULL OR v_key = '' OR v_key LIKE '<%' THEN
    RAISE WARNING 'settle_held_payment_async: service_role_key unavailable; the sweep will settle %', p_payment_intent_id;
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := 'https://ztrfpfvvejzaysrelmfm.supabase.co/functions/v1/settle-held-payment',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body    := CASE WHEN p_payment_intent_id IS NULL THEN '{"sweep":true}'::jsonb
                    ELSE jsonb_build_object('paymentIntentId', p_payment_intent_id) END,
    timeout_milliseconds := 30000
  );
END;
$function$;

CREATE FUNCTION public.on_held_request_answered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  PERFORM public.settle_held_payment_async(NEW.payment_intent_id);
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS on_held_request_answered ON public.bookings;
CREATE TRIGGER on_held_request_answered
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW
  WHEN (OLD.status = 'pending' AND NEW.status IS DISTINCT FROM 'pending'
        AND NEW.payment_status = 'authorised' AND NEW.payment_intent_id IS NOT NULL)
  EXECUTE FUNCTION public.on_held_request_answered();

-- The safety net: only posts when there is something to do.
CREATE FUNCTION public.process_held_payments()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.checkout_batches cb
     WHERE cb.capture_state = 'settling'
        OR (cb.capture_state = 'held'
            AND NOT EXISTS (SELECT 1 FROM public.bookings b
                             WHERE b.payment_intent_id = cb.payment_intent_id
                               AND b.status = 'pending'))
        OR (cb.capture_state = 'held'
            AND EXISTS (SELECT 1 FROM public.bookings b
                         WHERE b.payment_intent_id = cb.payment_intent_id
                           AND b.status NOT IN ('pending', 'cancelled')))
  ) THEN
    RETURN false;
  END IF;
  PERFORM public.settle_held_payment_async(NULL);
  RETURN true;
END;
$function$;

SELECT cron.schedule('settle-held-payments', '*/5 * * * *', $$ SELECT public.process_held_payments(); $$);

-- 9. Server-only ────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.checkout_batch_all_requests(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_checkout_held(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.begin_held_settlement(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_held_settlement(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_held_payment_async(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_held_request_answered() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_held_payments() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkout_batch_all_requests(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_checkout_held(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.begin_held_settlement(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_held_settlement(text) TO service_role;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261112100000', 'request_card_hold')
ON CONFLICT (version) DO NOTHING;

COMMIT;
