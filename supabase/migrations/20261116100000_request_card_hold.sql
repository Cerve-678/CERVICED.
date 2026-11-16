-- Each request holds the card on its own, and is charged only when accepted.
--
-- Until now every checkout was charged at the payment sheet, including
-- requests a provider still had to accept. A declined or unanswered request
-- was then refunded, which takes the client's bank 5–10 working days to show,
-- for money that should never have left.
--
-- From here (user decision 2026-11-14), every request in a checkout gets its
-- own card hold (a Stripe PaymentIntent with capture_method 'manual'):
--
--   * Instant bookings in the checkout are charged at the sheet, as before.
--   * Each request's hold is taken the moment its provider accepts, whatever
--     the other bookings in the basket are doing; declined, unanswered or
--     withdrawn, it is released and nothing is taken. A withdrawn request is
--     never charged, whatever the provider's late-cancellation rule.
--   * The payment sheet confirms one payment. It covers the instant bookings;
--     a basket of requests only has no instant part, so the sheet's payment
--     is instead the hold for its first request ("on the sheet"). Every other
--     request's hold is placed by the server right after, on the card the
--     sheet saved (create-payment-intent sets setup_future_usage).
--   * If the bank wants a security check on one of those holds, the client
--     gets 30 minutes to confirm it in the app. Until then the request stays
--     reserved but isn't sent to the provider; if it lapses, the slot is
--     freed and nothing is held. A hold the bank refuses outright is dropped
--     the same way.
--
-- Rows in request_card_holds carry each hold through:
--   planned → (needs_action) → authorised → settling → captured | released
--   planned | needs_action → dropped (never placed: refused, check lapsed,
--                                      or the checkout failed)
--
-- Stripe calls happen in edge functions (_shared/requestCardHolds.ts). The
-- decisions are taken here, under a row lock on the hold, so two answers
-- arriving together can't capture twice; a retry repeats the decision already
-- recorded, so Stripe's idempotency key always sees identical parameters. A
-- 5-minute sweep picks up anything a dropped call missed.
--
-- Supersedes the unapplied 20261112100000_request_card_hold (one hold per
-- all-request checkout, taken once every request was answered), which was
-- never applied anywhere.
--
-- Live functions are redefined or patched with md5 guards (read 2026-11-14,
-- re-checked unchanged 2026-11-16). Renumbered 2026-11-16 from 20261113220000
-- to sit above the live frontier (20261115090000); #474 and the dispute change,
-- now live, redefine none of the functions guarded here.

BEGIN;

-- 0. Guards ──────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_expected CONSTANT jsonb := jsonb_build_object(
    'finalize_checkout',              'c17ab61fb0a8c17046761fbeb161dcbb',
    'create_held_payout_on_finalize', '3e45e6d13215a4c7c11d15ae6e2a3dd3',
    'notify_client_payment_received', 'c5b191263668dc4e16360d5b1b837d08',
    'handle_booking_status_change',   'a1aad41031c4caa4f4621e7ab1466419');
  v_name text;
BEGIN
  FOR v_name IN SELECT jsonb_object_keys(v_expected) LOOP
    IF md5(pg_get_functiondef(('public.' || v_name)::regproc)) <> v_expected ->> v_name THEN
      RAISE EXCEPTION '% changed since this migration was written', v_name;
    END IF;
  END LOOP;
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint
       WHERE conrelid = 'public.bookings'::regclass AND conname = 'bookings_payment_status_check')
     <> 'CHECK ((payment_status = ANY (ARRAY[''pending''::text, ''deposit_paid''::text, ''fully_paid''::text, ''refund_pending''::text, ''refunded''::text, ''partially_refunded''::text, ''failed''::text])))' THEN
    RAISE EXCEPTION 'bookings_payment_status_check changed since this migration was written';
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

-- Every settle step, the sweep and refunds look bookings up by their payment.
CREATE INDEX IF NOT EXISTS bookings_payment_intent_id_idx
  ON public.bookings (payment_intent_id)
  WHERE payment_intent_id IS NOT NULL;

-- 2. What the payment sheet charges ─────────────────────────────────────────
-- NULL: amount_due (a checkout whose payment was created before this).
ALTER TABLE public.checkout_batches
  ADD COLUMN IF NOT EXISTS sheet_amount_pence integer
    CHECK (sheet_amount_pence IS NULL OR sheet_amount_pence > 0);

COMMENT ON COLUMN public.checkout_batches.sheet_amount_pence IS
  'What the payment sheet''s PaymentIntent is for, fixed by plan_checkout_holds when the payment is created: the instant bookings, or the first request''s hold when every booking is a request. NULL = amount_due (a payment created before this column existed).';

-- 3. One hold per request ───────────────────────────────────────────────────
CREATE TABLE public.request_card_holds (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SET NULL: a request that was never placed is deleted with its expired
  -- reservation (expire_cart_holds); the hold row keeps what happened.
  booking_id        uuid UNIQUE REFERENCES public.bookings(id) ON DELETE SET NULL,
  checkout_batch_id uuid NOT NULL REFERENCES public.checkout_batches(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL,
  amount_pence      integer NOT NULL CHECK (amount_pence > 0),
  currency          text NOT NULL,
  -- For the client's notices once the booking itself may be gone.
  service_name      text NOT NULL,
  provider_name     text,
  -- The sheet's own payment is this request's hold (a basket of requests only).
  on_sheet          boolean NOT NULL DEFAULT false,
  payment_intent_id text UNIQUE,
  state             text NOT NULL DEFAULT 'planned'
    CHECK (state IN ('planned', 'needs_action', 'authorised', 'settling', 'captured', 'released', 'dropped')),
  settle_action     text CHECK (settle_action IN ('capture', 'release')),
  -- needs_action: the bank's check must be confirmed in the app by then.
  action_deadline   timestamptz,
  captured_pence    integer,
  -- Set the first time support is told a hold couldn't be taken, so the
  -- sweep doesn't email again every five minutes.
  alerted_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.request_card_holds IS
  'One card hold per request in a checkout (20261116100000). Server-only: the app reads its own through get_my_request_card_holds.';

CREATE INDEX request_card_holds_batch_idx ON public.request_card_holds (checkout_batch_id);
CREATE INDEX request_card_holds_open_idx ON public.request_card_holds (state)
  WHERE state IN ('planned', 'needs_action', 'authorised', 'settling');

ALTER TABLE public.request_card_holds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.request_card_holds FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.request_card_holds TO service_role;

-- 4. Which bookings in a checkout are requests ──────────────────────────────
-- The same rule finalize_checkout uses: a provider without auto-accept, or an
-- emergency request (never auto-accepted). Only bookings that charge
-- something get a hold; a free one (a patch test) is a plain request.
CREATE FUNCTION public.checkout_request_bookings(p_checkout_batch_id uuid)
RETURNS TABLE(booking_id uuid, amount_pence integer, booking_date date, booking_time time)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT b.id, ROUND(b.amount_paid * 100)::integer, b.booking_date, b.booking_time
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
   WHERE b.hold_batch_id = p_checkout_batch_id
     AND b.status = 'on_hold'
     AND (NOT COALESCE(p.auto_accept_bookings, false) OR COALESCE(b.is_emergency_request, false))
     AND ROUND(COALESCE(b.amount_paid, 0) * 100) > 0;
$function$;

-- 5. Fix the plan when the payment is created ───────────────────────────────
-- Called by create-payment-intent before it creates the sheet's payment, and
-- never again for that checkout: the amounts are frozen from then on, so a
-- provider switching auto-accept on mid-checkout can't change what the sheet
-- was for. Returns what the sheet charges, in pence.
CREATE FUNCTION public.plan_checkout_holds(p_checkout_batch_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_batch public.checkout_batches%ROWTYPE;
  v_due   integer;
  v_held  integer;
  v_sheet integer;
BEGIN
  SELECT * INTO v_batch FROM public.checkout_batches WHERE id = p_checkout_batch_id FOR UPDATE;
  IF NOT FOUND OR v_batch.status <> 'prepared' THEN
    RAISE EXCEPTION 'Checkout has expired or is unavailable';
  END IF;
  IF v_batch.sheet_amount_pence IS NOT NULL THEN
    RETURN v_batch.sheet_amount_pence;
  END IF;

  v_due := ROUND(v_batch.amount_due * 100)::integer;

  INSERT INTO public.request_card_holds
    (booking_id, checkout_batch_id, user_id, amount_pence, currency, service_name, provider_name)
  SELECT r.booking_id, v_batch.id, v_batch.user_id, r.amount_pence, v_batch.currency,
         COALESCE(NULLIF(BTRIM(b.service_name_snapshot), ''), 'your request'),
         NULLIF(BTRIM(b.provider_name_snapshot), '')
    FROM public.checkout_request_bookings(v_batch.id) r
    JOIN public.bookings b ON b.id = r.booking_id
  ON CONFLICT (booking_id) DO NOTHING;

  SELECT COALESCE(SUM(amount_pence), 0)::integer INTO v_held
    FROM public.request_card_holds WHERE checkout_batch_id = v_batch.id;

  IF v_held > v_due THEN
    RAISE EXCEPTION 'Checkout amounts do not add up (% held of % due)', v_held, v_due;
  END IF;

  IF v_held = 0 THEN
    v_sheet := v_due;
  ELSIF v_due - v_held > 0 THEN
    -- The sheet takes the instant bookings; each request is held on its own.
    v_sheet := v_due - v_held;
  ELSE
    -- Requests only: the sheet's payment is the first request's own hold.
    UPDATE public.request_card_holds h
       SET on_sheet = true, updated_at = now()
     WHERE h.id = (
       SELECT h2.id FROM public.request_card_holds h2
         JOIN public.bookings b ON b.id = h2.booking_id
        WHERE h2.checkout_batch_id = v_batch.id
        ORDER BY b.booking_date, b.booking_time, b.id
        LIMIT 1)
    RETURNING h.amount_pence INTO v_sheet;
  END IF;

  UPDATE public.checkout_batches SET sheet_amount_pence = v_sheet WHERE id = v_batch.id;
  RETURN v_sheet;
END;
$function$;

-- What the app shows on the payment sheet before Pay: charged now vs held.
-- Reads the frozen plan once there is one, otherwise works it out the same
-- way plan_checkout_holds will.
CREATE FUNCTION public.get_checkout_hold_plan(p_checkout_batch_id uuid)
RETURNS TABLE(charge_now_pence integer, held_pence integer, request_count integer, booking_count integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_batch public.checkout_batches%ROWTYPE;
  v_due   integer;
BEGIN
  SELECT * INTO v_batch FROM public.checkout_batches
   WHERE id = p_checkout_batch_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checkout not found';
  END IF;
  v_due := ROUND(v_batch.amount_due * 100)::integer;

  IF v_batch.sheet_amount_pence IS NOT NULL THEN
    SELECT COALESCE(SUM(h.amount_pence), 0)::integer, count(*)::integer
      INTO held_pence, request_count
      FROM public.request_card_holds h WHERE h.checkout_batch_id = v_batch.id;
  ELSE
    SELECT COALESCE(SUM(r.amount_pence), 0)::integer, count(*)::integer
      INTO held_pence, request_count
      FROM public.checkout_request_bookings(v_batch.id) r;
  END IF;
  charge_now_pence := GREATEST(v_due - held_pence, 0);
  SELECT count(*)::integer INTO booking_count
    FROM public.checkout_batch_items i WHERE i.checkout_batch_id = v_batch.id;
  RETURN NEXT;
END;
$function$;

-- 6. Booking one checkout booking ───────────────────────────────────────────
-- finalize_checkout's per-booking step, unchanged, so a request whose hold is
-- approved after the checkout (request_hold_placed) is booked with the same
-- notices. p_request: it has a card hold, so it always waits for the
-- provider's answer, even if they switched auto-accept on since.
CREATE OR REPLACE FUNCTION public.book_checkout_booking(
  p_booking_id uuid, p_checkout_batch_id uuid, p_client_user_id uuid,
  p_payment_intent_id text, p_request boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_auto_accept boolean;
  v_provider_user_id uuid;
  v_add_on_id uuid;
BEGIN
  SELECT b.* INTO v_booking FROM public.bookings b WHERE b.id = p_booking_id AND b.status = 'on_hold' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation % is no longer held', p_booking_id;
  END IF;
  SELECT COALESCE(p.auto_accept_bookings, false), p.user_id INTO v_auto_accept, v_provider_user_id FROM public.providers p WHERE p.id = v_booking.provider_id;
  -- An emergency request is a deliberate ask for something the provider's
  -- own rules exclude, so it always waits for a real answer — auto-accept
  -- must never commit them to it silently.
  IF COALESCE(v_booking.is_emergency_request, false) OR p_request THEN v_auto_accept := false; END IF;
  UPDATE public.bookings SET status = CASE WHEN v_auto_accept THEN 'confirmed' ELSE 'pending' END,
    confirmed_at = CASE WHEN v_auto_accept THEN now() ELSE null END, hold_batch_id = null, hold_expires_at = null,
    payment_intent_id = p_payment_intent_id WHERE id = v_booking.id;
  FOR v_add_on_id IN SELECT e.value::uuid FROM jsonb_array_elements_text((SELECT i.add_on_ids FROM public.checkout_batch_items i WHERE i.checkout_batch_id = p_checkout_batch_id AND i.booking_id = v_booking.id)) AS e(value)
  LOOP
    INSERT INTO public.booking_add_ons (booking_id, add_on_id, name_snapshot, price_snapshot)
    SELECT v_booking.id, a.id, a.name, a.price FROM public.service_add_ons a WHERE a.id = v_add_on_id;
  END LOOP;
  INSERT INTO public.notifications (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
  VALUES (p_client_user_id, CASE WHEN v_auto_accept THEN 'booking_confirmed' ELSE 'booking_pending' END,
    CASE WHEN v_auto_accept THEN 'Booking Confirmed! 🎉' ELSE 'Booking Request Sent' END,
    CASE WHEN v_auto_accept
           THEN 'Your appointment with ' || v_booking.provider_name_snapshot || ' is confirmed for ' ||
                TO_CHAR(v_booking.booking_date, 'DD Mon YYYY') || ' at ' || public.format_notification_time(v_booking.booking_time) || '.'
         WHEN COALESCE(v_booking.is_emergency_request, false)
           THEN 'Your request with ' || v_booking.provider_name_snapshot || ' for ' ||
                TO_CHAR(v_booking.booking_date, 'DD Mon YYYY') || ' at ' || public.format_notification_time(v_booking.booking_time) ||
                ' is outside their usual availability and is awaiting their decision.'
         ELSE 'Your request with ' || v_booking.provider_name_snapshot || ' for ' ||
              TO_CHAR(v_booking.booking_date, 'DD Mon YYYY') || ' at ' || public.format_notification_time(v_booking.booking_time) ||
              ' is awaiting confirmation.' END,
    'high', true, v_booking.id, v_booking.provider_id, 'client');
  IF v_provider_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (v_provider_user_id, CASE WHEN v_auto_accept THEN 'booking_confirmed' ELSE 'booking_pending' END,
      CASE WHEN v_auto_accept THEN 'New Booking'
           WHEN COALESCE(v_booking.is_emergency_request, false) THEN public.booking_request_title(v_booking.id, 'Booking Request — Outside Your Hours')
           ELSE public.booking_request_title(v_booking.id, 'New Booking Request') END,
      COALESCE(v_booking.customer_name, 'A client') ||
      CASE WHEN v_auto_accept THEN ' booked ' ELSE ' requested ' END || v_booking.service_name_snapshot ||
      ' for ' || public.format_notification_date(v_booking.booking_date) ||
      ' at ' || public.format_notification_time(v_booking.booking_time) ||
      CASE WHEN COALESCE(v_booking.is_emergency_request, false)
           THEN ', outside your usual availability. Check their client profile, then confirm or decline.' || public.booking_request_answer_note(v_booking.id)
           WHEN v_auto_accept THEN '. Check their client profile for anything important.'
           ELSE '. Check their client profile, then confirm or decline.' || public.booking_request_answer_note(v_booking.id) END ||
      CASE WHEN p_request THEN ' Their payment is held on their card and only taken if you accept.' ELSE '' END,
      'high', NOT v_auto_accept, v_booking.id, v_booking.provider_id, 'provider');
  END IF;
END;
$function$;

-- "Card held, not charged" for one request.
CREATE FUNCTION public.notify_request_card_held(p_hold_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role, metadata)
  SELECT h.user_id, 'payment_success', 'Card held, not charged',
         'We''ve put a hold of £' || TO_CHAR(h.amount_pence / 100.0, 'FM999990.00') ||
         ' on your card for your ' || h.service_name || ' request' ||
         COALESCE(' with ' || h.provider_name, '') ||
         '. You''re only charged if it''s accepted.',
         'medium', FALSE, h.booking_id, b.provider_id, 'client',
         jsonb_build_object('checkout_batch_id', h.checkout_batch_id, 'amount_pence', h.amount_pence, 'held', true)
    FROM public.request_card_holds h
    JOIN public.bookings b ON b.id = h.booking_id
   WHERE h.id = p_hold_id;
$function$;

-- 7. Finalise a checkout ────────────────────────────────────────────────────
-- As before, except for requests with a card hold:
--   * the request on the sheet is booked with its payment 'authorised'
--     (held, not taken), so no provider payout is created for it yet;
--   * every other request stays reserved, not booked, until its own hold is
--     approved (request_hold_placed). 35 minutes: the 30 a client gets to
--     confirm a bank check, plus the placement itself. If that never
--     happens, expire_cart_holds frees the slot as for any lapsed reservation.
CREATE OR REPLACE FUNCTION public.finalize_checkout(p_checkout_batch_id uuid, p_payment_intent_id text)
 RETURNS TABLE(booking_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_batch public.checkout_batches%ROWTYPE;
  v_booking_id uuid;
  v_sheet_hold uuid;
BEGIN
  SELECT b.* INTO v_batch FROM public.checkout_batches b WHERE b.id = p_checkout_batch_id FOR UPDATE;
  -- This function is deliberately not executable by authenticated clients.
  -- The Edge Function validates the caller owns both this batch and the
  -- Stripe intent before invoking it with the service role.
  IF NOT FOUND OR v_batch.status <> 'prepared' OR v_batch.expires_at <= now() THEN
    RAISE EXCEPTION 'Checkout has expired or is unavailable';
  END IF;
  IF v_batch.payment_intent_id IS DISTINCT FROM p_payment_intent_id THEN RAISE EXCEPTION 'Payment does not match this checkout'; END IF;

  UPDATE public.bookings b
     SET hold_expires_at = now() + interval '35 minutes'
   WHERE b.hold_batch_id = v_batch.id AND b.status = 'on_hold'
     AND EXISTS (SELECT 1 FROM public.request_card_holds h
                  WHERE h.booking_id = b.id AND NOT h.on_sheet AND h.state = 'planned');

  -- Before it's booked, so the payout trigger sees nothing was taken.
  UPDATE public.request_card_holds h
     SET state = 'authorised', payment_intent_id = p_payment_intent_id, updated_at = now()
   WHERE h.checkout_batch_id = v_batch.id AND h.on_sheet AND h.state = 'planned'
  RETURNING h.id INTO v_sheet_hold;
  UPDATE public.bookings b
     SET payment_status = 'authorised'
    FROM public.request_card_holds h
   WHERE h.id = v_sheet_hold AND b.id = h.booking_id AND b.status = 'on_hold';

  FOR v_booking_id IN
    SELECT b.id FROM public.bookings b
     WHERE b.hold_batch_id = v_batch.id AND b.status = 'on_hold'
       AND NOT EXISTS (SELECT 1 FROM public.request_card_holds h
                        WHERE h.booking_id = b.id AND NOT h.on_sheet)
     ORDER BY b.id
     FOR UPDATE
  LOOP
    PERFORM public.book_checkout_booking(v_booking_id, v_batch.id, v_batch.user_id, p_payment_intent_id,
      COALESCE(v_booking_id = (SELECT h.booking_id FROM public.request_card_holds h WHERE h.id = v_sheet_hold), false));
    booking_id := v_booking_id; RETURN NEXT;
  END LOOP;

  IF v_sheet_hold IS NOT NULL THEN
    PERFORM public.notify_request_card_held(v_sheet_hold);
  END IF;
  UPDATE public.checkout_batches SET status = 'finalised', finalised_at = now() WHERE id = v_batch.id;
END;
$function$;

-- 8. A server-placed hold's result ──────────────────────────────────────────
-- p_outcome: 'authorised' (the bank approved it), 'needs_action' (the bank
-- wants a check in the app), 'refused' (declined outright), 'lapsed' (the
-- check wasn't confirmed in time) or 'failed' (it couldn't be placed at all,
-- e.g. no saved card to place it on). Returns what the caller must do next with
-- the payment: 'none', or 'release' when money was approved for a request
-- that can no longer be booked (the edge function then cancels it).
CREATE FUNCTION public.request_hold_placed(p_hold_id uuid, p_payment_intent_id text, p_outcome text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_hold    public.request_card_holds%ROWTYPE;
  v_booking public.bookings%ROWTYPE;
BEGIN
  IF p_outcome NOT IN ('authorised', 'needs_action', 'refused', 'lapsed', 'failed') THEN
    RAISE EXCEPTION 'Unknown hold outcome %', p_outcome;
  END IF;
  SELECT * INTO v_hold FROM public.request_card_holds WHERE id = p_hold_id FOR UPDATE;
  IF NOT FOUND OR v_hold.on_sheet THEN
    RAISE EXCEPTION 'Request hold % not found', p_hold_id;
  END IF;
  IF v_hold.state NOT IN ('planned', 'needs_action') THEN
    RETURN 'none';  -- already decided (a retry, or the webhook and the app together)
  END IF;
  IF v_hold.payment_intent_id IS NOT NULL AND v_hold.payment_intent_id IS DISTINCT FROM p_payment_intent_id THEN
    RAISE EXCEPTION 'Payment does not match this request hold';
  END IF;

  -- Still reserved: a reservation past its time is about to be freed by
  -- expire_cart_holds and must not be booked now.
  SELECT * INTO v_booking FROM public.bookings
   WHERE id = v_hold.booking_id AND status = 'on_hold' AND hold_expires_at > now() FOR UPDATE;

  IF p_outcome = 'authorised'
     AND (v_hold.state = 'planned' OR v_hold.action_deadline > now())
     AND v_booking.id IS NOT NULL THEN
    UPDATE public.bookings SET payment_status = 'authorised' WHERE id = v_booking.id;
    PERFORM public.book_checkout_booking(v_booking.id, v_hold.checkout_batch_id, v_hold.user_id, p_payment_intent_id, true);
    UPDATE public.request_card_holds
       SET state = 'authorised', payment_intent_id = p_payment_intent_id, updated_at = now()
     WHERE id = v_hold.id;
    PERFORM public.notify_request_card_held(v_hold.id);
    RETURN 'none';
  END IF;

  IF p_outcome = 'authorised' THEN
    -- Approved, but too late (the check lapsed, or the reservation is gone):
    -- the money must be released, never kept.
    UPDATE public.request_card_holds
       SET state = 'settling', settle_action = 'release', payment_intent_id = p_payment_intent_id, updated_at = now()
     WHERE id = v_hold.id;
    p_outcome := 'lapsed';
  ELSIF p_outcome = 'needs_action' THEN
    IF v_booking.id IS NULL THEN
      p_outcome := 'lapsed';
    ELSE
      UPDATE public.request_card_holds
         SET state = 'needs_action', payment_intent_id = p_payment_intent_id,
             action_deadline = COALESCE(action_deadline, now() + interval '30 minutes'), updated_at = now()
       WHERE id = v_hold.id
      RETURNING action_deadline INTO v_hold.action_deadline;
      -- Keep the slot reserved until the check's deadline has passed.
      UPDATE public.bookings SET hold_expires_at = v_hold.action_deadline + interval '5 minutes'
       WHERE id = v_booking.id;
      RETURN 'none';
    END IF;
  END IF;

  -- Refused or lapsed: the request is never sent, the slot is freed, nothing
  -- is held. The notice carries no booking id: the reservation it belongs to
  -- is deleted (expire_cart_holds deletes a lapsed reservation's notices).
  UPDATE public.request_card_holds
     SET state = CASE WHEN state = 'settling' THEN state ELSE 'dropped' END,
         payment_intent_id = COALESCE(payment_intent_id, p_payment_intent_id), updated_at = now()
   WHERE id = v_hold.id;
  IF v_booking.id IS NOT NULL THEN
    UPDATE public.bookings SET hold_expires_at = now() - interval '1 second' WHERE id = v_booking.id;
  END IF;
  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role, metadata)
  VALUES (v_hold.user_id, 'payment_not_completed', 'Request not sent',
    CASE WHEN p_outcome = 'refused'
      THEN 'Your bank didn''t approve the hold for your ' || v_hold.service_name || ' request' ||
           COALESCE(' with ' || v_hold.provider_name, '') ||
           ', so it wasn''t sent. Nothing is held on your card. You can book it again with another card.'
      WHEN p_outcome = 'failed'
      THEN 'We couldn''t put the hold on your card for your ' || v_hold.service_name || ' request' ||
           COALESCE(' with ' || v_hold.provider_name, '') ||
           ', so it wasn''t sent. Nothing is held on your card. Please try booking it again.'
      ELSE 'Your bank''s check for your ' || v_hold.service_name || ' request' ||
           COALESCE(' with ' || v_hold.provider_name, '') ||
           ' wasn''t confirmed in time, so it wasn''t sent. Nothing is held on your card.'
    END,
    'high', FALSE, NULL, v_booking.provider_id, 'client',
    jsonb_build_object('checkout_batch_id', v_hold.checkout_batch_id, 'request_card_hold_id', v_hold.id));
  RETURN CASE WHEN (SELECT state FROM public.request_card_holds WHERE id = v_hold.id) = 'settling'
              THEN 'release' ELSE 'none' END;
END;
$function$;

-- 9. Decide, then record, a hold's outcome once it's answered ───────────────
-- Returns 'capture' (with the amount), 'release', 'wait' or 'none'. Once
-- decided the hold is 'settling' and the same decision comes back on every
-- retry.
CREATE FUNCTION public.begin_request_hold_settlement(p_hold_id uuid)
RETURNS TABLE(action text, amount_pence integer, payment_intent_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_hold   public.request_card_holds%ROWTYPE;
  v_status text;
BEGIN
  SELECT * INTO v_hold FROM public.request_card_holds h WHERE h.id = p_hold_id FOR UPDATE;
  IF NOT FOUND OR v_hold.state NOT IN ('authorised', 'settling') THEN
    action := 'none'; RETURN NEXT; RETURN;
  END IF;
  payment_intent_id := v_hold.payment_intent_id;

  IF v_hold.state = 'settling' THEN
    action := v_hold.settle_action;
    amount_pence := CASE WHEN v_hold.settle_action = 'capture' THEN v_hold.amount_pence END;
    RETURN NEXT; RETURN;
  END IF;

  SELECT b.status INTO v_status FROM public.bookings b WHERE b.id = v_hold.booking_id FOR UPDATE;
  IF v_status = 'pending' THEN
    action := 'wait'; RETURN NEXT; RETURN;
  END IF;

  -- Accepted (confirmed, or already moved on from there) is charged; a
  -- request that was declined, expired or withdrawn — or whose booking is
  -- gone — never is.
  action := CASE WHEN v_status IS NULL OR v_status = 'cancelled' THEN 'release' ELSE 'capture' END;
  amount_pence := CASE WHEN action = 'capture' THEN v_hold.amount_pence END;
  UPDATE public.request_card_holds
     SET state = 'settling', settle_action = action, updated_at = now()
   WHERE id = v_hold.id;
  RETURN NEXT;
END;
$function$;

-- Called once Stripe has done it, with what Stripe actually captured
-- (NULL when nothing was). Moving the booking from 'authorised' to paid is
-- what creates its provider payout (step 10). A booking cancelled while
-- Stripe was being called is refunded through the normal path.
CREATE FUNCTION public.complete_request_hold_settlement(p_hold_id uuid, p_captured_pence integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_hold    public.request_card_holds%ROWTYPE;
  v_booking public.bookings%ROWTYPE;
BEGIN
  SELECT * INTO v_hold FROM public.request_card_holds WHERE id = p_hold_id AND state = 'settling' FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO v_booking FROM public.bookings WHERE id = v_hold.booking_id FOR UPDATE;

  IF COALESCE(p_captured_pence, 0) > 0 THEN
    IF v_booking.id IS NOT NULL THEN
      UPDATE public.bookings
         SET payment_status = CASE WHEN payment_type = 'deposit' THEN 'deposit_paid' ELSE 'fully_paid' END
       WHERE id = v_booking.id AND payment_status = 'authorised';

      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role, metadata)
      VALUES (v_hold.user_id, 'payment_success', 'Payment received',
        COALESCE(v_hold.provider_name, 'Your provider') || ' accepted your ' || v_hold.service_name ||
          ' request, so we took the £' || TO_CHAR(p_captured_pence / 100.0, 'FM999990.00') || ' held on your card.',
        'medium', FALSE, v_booking.id, v_booking.provider_id, 'client',
        jsonb_build_object('checkout_batch_id', v_hold.checkout_batch_id, 'amount_pence', p_captured_pence));

      IF v_booking.status = 'cancelled' THEN
        PERFORM public.refund_booking_async(v_booking.id, 'request_not_accepted');
      END IF;
    END IF;
    UPDATE public.request_card_holds
       SET state = 'captured', captured_pence = p_captured_pence, updated_at = now()
     WHERE id = v_hold.id;
  ELSE
    UPDATE public.bookings SET payment_status = 'not_charged'
     WHERE id = v_hold.booking_id AND payment_status = 'authorised';
    UPDATE public.request_card_holds
       SET state = CASE WHEN booking_id IS NULL OR v_booking.status = 'on_hold' THEN 'dropped' ELSE 'released' END,
           updated_at = now()
     WHERE id = v_hold.id;
  END IF;
END;
$function$;

-- 10. No payout for money that hasn't been taken ────────────────────────────
DO $$
BEGIN
  EXECUTE pg_temp.patch(
    pg_get_functiondef('public.create_held_payout_on_finalize'::regproc),
    $old$  IF NOT (OLD.status = 'on_hold'
          AND NEW.status IN ('pending', 'confirmed')
          AND NEW.payment_intent_id IS NOT NULL) THEN
    RETURN NEW;
  END IF;$old$,
    $new$  -- Two moments create a payout: a checkout's booking being booked
  -- with its money taken, and a request's held money being taken
  -- (authorised → paid). A request being booked with its card only held is
  -- neither: nothing has been taken yet.
  IF NOT (
       (OLD.status = 'on_hold'
        AND NEW.status IN ('pending', 'confirmed')
        AND NEW.payment_status IS DISTINCT FROM 'authorised')
    -- Only the server records a capture (complete_request_hold_settlement,
    -- run by the edge function as service role), never a signed-in user.
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

-- 10b. Only the server moves a booking into or out of a hold state ─────────
-- claim_cart_booking_slots (the non-Stripe cart path) writes payment_status
-- from what the app sends. Nothing a signed-in user calls may set 'authorised'
-- or 'not_charged', or move a booking out of 'authorised'.
CREATE FUNCTION public.guard_held_payment_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.payment_status IS DISTINCT FROM OLD.payment_status)
     AND (NEW.payment_status IN ('authorised', 'not_charged')
          OR (TG_OP = 'UPDATE' AND OLD.payment_status = 'authorised')) THEN
    RAISE EXCEPTION 'A held payment can only be settled by the server';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_held_payment_status() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS before_booking_guard_held_payment_status ON public.bookings;
CREATE TRIGGER before_booking_guard_held_payment_status
  BEFORE INSERT OR UPDATE OF payment_status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_held_payment_status();

-- 11a. The checkout's payment notice covers only what was charged ──────────
-- Requests are told about separately, one "Card held, not charged" each.
DO $$
DECLARE
  v_def text := pg_get_functiondef('public.notify_client_payment_received'::regproc);
BEGIN
  v_def := pg_temp.patch(v_def,
    $old$   WHERE i.checkout_batch_id = NEW.id;
  IF COALESCE(v_count, 0) = 0 THEN
    RETURN NEW;
  END IF;

  v_figure := '£' || TO_CHAR(COALESCE(NEW.amount_due, 0), 'FM999990.00');$old$,
    $new$   WHERE i.checkout_batch_id = NEW.id
     AND NOT EXISTS (SELECT 1 FROM public.request_card_holds h WHERE h.booking_id = b.id);
  IF COALESCE(v_count, 0) = 0 THEN
    RETURN NEW;
  END IF;

  v_figure := '£' || TO_CHAR(COALESCE(NEW.sheet_amount_pence / 100.0, NEW.amount_due, 0), 'FM999990.00');$new$,
    1);
  v_def := pg_temp.patch(v_def,
    $old$jsonb_build_object('checkout_batch_id', NEW.id, 'amount_pence', ROUND(COALESCE(NEW.amount_due, 0) * 100))$old$,
    $new$jsonb_build_object('checkout_batch_id', NEW.id, 'amount_pence', COALESCE(NEW.sheet_amount_pence, ROUND(COALESCE(NEW.amount_due, 0) * 100)))$new$,
    1);
  EXECUTE v_def;
END $$;

-- 11b. Tell the client a declined held request costs them nothing ──────────
DO $$
DECLARE
  v_def text := pg_get_functiondef('public.handle_booking_status_change'::regproc);
  v_line text := $l$ || CASE WHEN NEW.payment_status = 'authorised'
                 THEN ' You won''t be charged. We''ve asked your bank to release the hold on your card; some banks take a few days to stop showing it.' ELSE '' END,$l$;
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

-- 12. Settle when a held request is answered ────────────────────────────────
-- Posts to the edge function the same way refund_booking_async does.
CREATE FUNCTION public.settle_request_holds_async(p_hold_id uuid)
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
    RAISE WARNING 'settle_request_holds_async: service_role_key unavailable; the sweep will settle %', p_hold_id;
    RETURN;
  END IF;

  -- Never let a failed post undo the provider's answer that fired it: the
  -- sweep settles anything this misses.
  BEGIN
    PERFORM net.http_post(
      url     := 'https://ztrfpfvvejzaysrelmfm.supabase.co/functions/v1/settle-held-payment',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
      body    := CASE WHEN p_hold_id IS NULL THEN '{"sweep":true}'::jsonb
                      ELSE jsonb_build_object('holdId', p_hold_id) END,
      timeout_milliseconds := 30000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'settle_request_holds_async: post failed (%); the sweep will settle %', SQLERRM, p_hold_id;
  END;
END;
$function$;

CREATE FUNCTION public.on_held_request_answered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_hold_id uuid;
BEGIN
  SELECT h.id INTO v_hold_id FROM public.request_card_holds h
   WHERE h.booking_id = NEW.id AND h.state = 'authorised';
  IF v_hold_id IS NOT NULL THEN
    PERFORM public.settle_request_holds_async(v_hold_id);
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS on_held_request_answered ON public.bookings;
CREATE TRIGGER on_held_request_answered
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW
  WHEN (OLD.status = 'pending' AND NEW.status IS DISTINCT FROM 'pending'
        AND NEW.payment_status = 'authorised')
  EXECUTE FUNCTION public.on_held_request_answered();

-- The safety net: tidies what needs no Stripe call, and posts only when
-- there's something Stripe has to do.
CREATE FUNCTION public.process_request_card_holds()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  -- Planned for a checkout that never went through: never placed.
  UPDATE public.request_card_holds h
     SET state = 'dropped', updated_at = now()
    FROM public.checkout_batches cb
   WHERE cb.id = h.checkout_batch_id
     AND h.state = 'planned'
     AND cb.status NOT IN ('prepared', 'finalised');

  IF NOT EXISTS (
    SELECT 1
      FROM public.request_card_holds h
      JOIN public.checkout_batches cb ON cb.id = h.checkout_batch_id
     WHERE (h.state = 'planned' AND cb.status = 'finalised'
            AND cb.finalised_at <= now() - interval '2 minutes')
        OR (h.state = 'needs_action' AND h.action_deadline <= now())
        OR (h.state = 'settling' AND h.alerted_at IS NULL)
        OR (h.state = 'authorised'
            AND NOT EXISTS (SELECT 1 FROM public.bookings b
                             WHERE b.id = h.booking_id AND b.status = 'pending'))
  ) THEN
    RETURN false;
  END IF;
  PERFORM public.settle_request_holds_async(NULL);
  RETURN true;
END;
$function$;

SELECT cron.schedule('settle-request-card-holds', '*/5 * * * *', $$ SELECT public.process_request_card_holds(); $$);

-- 13. The client's own holds, for the checkout's success screen ─────────────
CREATE FUNCTION public.get_my_request_card_holds(p_checkout_batch_id uuid)
RETURNS TABLE(hold_id uuid, booking_id uuid, service_name text, provider_name text,
              amount_pence integer, state text, action_deadline timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT h.id, h.booking_id, h.service_name, h.provider_name, h.amount_pence,
         -- The app only needs to know held / waiting on the bank / not sent.
         CASE WHEN h.state IN ('settling', 'captured', 'released') THEN 'authorised' ELSE h.state END,
         h.action_deadline
    FROM public.request_card_holds h
   WHERE h.checkout_batch_id = p_checkout_batch_id
     AND h.user_id = auth.uid()
   ORDER BY h.created_at, h.id;
$function$;

-- 14. Server-only, except the two reads the app makes ──────────────────────
REVOKE ALL ON FUNCTION public.checkout_request_bookings(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.plan_checkout_holds(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.book_checkout_booking(uuid, uuid, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_request_card_held(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_hold_placed(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.begin_request_hold_settlement(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_request_hold_settlement(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_request_holds_async(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_held_request_answered() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_request_card_holds() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_checkout_hold_plan(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_request_card_holds(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_checkout_holds(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_hold_placed(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.begin_request_hold_settlement(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_request_hold_settlement(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_checkout_hold_plan(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_request_card_holds(uuid) TO authenticated, service_role;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261116100000', 'request_card_hold')
ON CONFLICT (version) DO NOTHING;

COMMIT;
