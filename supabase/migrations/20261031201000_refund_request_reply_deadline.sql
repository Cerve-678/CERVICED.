-- A refund request the provider doesn't answer within 3 days goes to Cerviced.
--
-- Frontier at authoring: 20261031173214 (verified live 2026-10-31).
-- 20261031200000 (feat/late-reschedule-keeps-cancel-charge, same lock holder)
-- is numbered just below this and touches none of the same objects, so the
-- two can be applied in either order. Check the lock in MIGRATION_OWNER.md
-- and re-check max(version) before applying.
--
-- The gap (PAYMENTS_AND_LOGIC.md Part 6): a request sat with the provider
-- with no deadline, so the client could wait forever while the provider's
-- payout for that booking stayed on hold.
--
-- Decided with the user 2026-10-31: the provider has 3 days to refund it or
-- pass it to Cerviced; after that it goes to Cerviced to review, the same as
-- if they'd passed it.
--
-- What this adds:
--   - refund_requests.passed_automatically (readable by authenticated, so the
--     timeline can say the provider didn't reply rather than "passed it") and
--     refund_requests.provider_reminded_at (internal, not granted).
--   - process_refund_request_deadlines(), service role only, run hourly by
--     cron job refund-request-deadlines:
--       * 2 days in, one reminder to the provider (type refund_requested,
--         which always pushes) saying a day is left;
--       * 3 days in, status -> under_review with passed_automatically. The
--         existing status trigger tells the client; this file teaches it to
--         say why, and to tell the provider too.
--   Admins already see under_review requests on the Money screen and in the
--   08:00 summary email, so nothing new is needed on Cerviced's side.
--
-- Redefines, each from its live definition on 2026-10-31 (md5 guarded):
--   - request_booking_refund: the provider's notice says they have 3 days.
--     Nothing else changes.
--   - notify_refund_request_status: wording for an automatic pass, plus a
--     provider notice for it; every "with Cerviced" notice says Cerviced aims
--     to decide within 5 working days (user, 2026-10-31; Terms §15). Nothing
--     else changes.

BEGIN;

DO $guard$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(pg_get_functiondef('public.request_booking_refund(uuid,text,text)'::regprocedure)) INTO v_md5;
  IF v_md5 <> 'c0bfe47f56ea268518275f2f2d5a7921' THEN
    RAISE EXCEPTION 'request_booking_refund changed since this file was written (md5 %). Re-diff before applying.', v_md5;
  END IF;
  SELECT md5(pg_get_functiondef('public.notify_refund_request_status()'::regprocedure)) INTO v_md5;
  IF v_md5 <> 'afc6940fa515de198772767e4d18345e' THEN
    RAISE EXCEPTION 'notify_refund_request_status changed since this file was written (md5 %). Re-diff before applying.', v_md5;
  END IF;
END
$guard$;

ALTER TABLE public.refund_requests
  ADD COLUMN IF NOT EXISTS passed_automatically boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS provider_reminded_at timestamptz;

COMMENT ON COLUMN public.refund_requests.passed_automatically IS
  'True when the request went to Cerviced because the provider did not reply within 3 days (process_refund_request_deadlines).';
COMMENT ON COLUMN public.refund_requests.provider_reminded_at IS
  'When the provider was reminded that one day was left to reply. Internal.';

GRANT SELECT (passed_automatically) ON public.refund_requests TO authenticated;

CREATE OR REPLACE FUNCTION public.request_booking_refund(p_booking_id uuid, p_reason text, p_message text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reason         text;
  v_message        text;
  v_user_id        uuid;
  v_provider_id    uuid;
  v_provider_user  uuid;
  v_payment_status text;
  v_customer_name  text;
  v_service_name   text;
  v_booking_date   date;
  v_id             uuid;
  v_held_pence     integer;
BEGIN
  -- One of the sheet's preset reasons (SUPPORT_REASONS.refund in
  -- src/features/bookings/bookingSupportRequest.ts — change both together).
  -- It goes verbatim into the provider's push and email, so it is never
  -- free text; the client's own words go in p_message, which stays in-app.
  v_reason := BTRIM(COALESCE(p_reason, ''));
  IF v_reason NOT IN (
    'The provider cancelled', 'The provider didn''t turn up', 'The service wasn''t what I booked',
    'I was charged the wrong amount', 'I cancelled within their policy', 'Something else'
  ) THEN
    RAISE EXCEPTION 'Please pick what the refund is for.';
  END IF;
  v_message := LEFT(NULLIF(BTRIM(COALESCE(p_message, '')), ''), 1000);

  SELECT b.user_id, b.provider_id, b.payment_status, b.customer_name,
         b.service_name_snapshot, b.booking_date
    INTO v_user_id, v_provider_id, v_payment_status, v_customer_name,
         v_service_name, v_booking_date
    FROM public.bookings b
   WHERE b.id = p_booking_id
   FOR UPDATE;

  IF NOT FOUND OR v_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  -- Cerviced only gets involved with money paid through the app (mirrors
  -- getRefundRequestScope in src/features/bookings/bookingSupportRequest.ts).
  IF v_payment_status NOT IN ('deposit_paid', 'fully_paid', 'partially_refunded') THEN
    RAISE EXCEPTION 'Nothing for this booking is left to refund through Cerviced.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.refund_requests r
     WHERE r.booking_id = p_booking_id AND r.status IN ('with_provider', 'under_review')
  ) THEN
    RAISE EXCEPTION 'You already have a refund request open for this booking.';
  END IF;

  INSERT INTO public.refund_requests (booking_id, client_id, provider_id, reason, message)
  VALUES (p_booking_id, v_user_id, v_provider_id, v_reason, v_message)
  RETURNING id INTO v_id;

  SELECT p.user_id INTO v_provider_user FROM public.providers p WHERE p.id = v_provider_id;
  -- release-payouts skips a held payout while a request is open, so say so.
  SELECT pp.payout_amount INTO v_held_pence
    FROM public.provider_payouts pp
   WHERE pp.booking_id = p_booking_id AND pp.status = 'held';
  IF v_provider_user IS NOT NULL THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role, metadata)
    VALUES (
      v_provider_user, 'refund_requested', 'Refund Requested',
      COALESCE(NULLIF(BTRIM(v_customer_name), ''), 'A client') || ' has asked for a refund on ' ||
        COALESCE(v_service_name, 'their booking') || ' on ' ||
        TO_CHAR(v_booking_date, 'DD Mon YYYY') || ': ' || v_reason ||
        '. Refund it from the booking, or pass it to Cerviced to review.' ||
        ' If you don''t reply within 3 days, it goes to Cerviced to review.' ||
        CASE WHEN COALESCE(v_held_pence, 0) > 0
          THEN ' Your £' || TO_CHAR(v_held_pence / 100.0, 'FM999990.00') || ' for this booking is on hold until it''s settled.'
          ELSE '' END,
      'high', TRUE, p_booking_id, v_provider_id, 'provider',
      jsonb_build_object('refund_request_id', v_id)
    );
  END IF;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_refund_request_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_provider_name text;
  v_service_name  text;
  v_customer_name text;
  v_provider_user uuid;
  v_amount        text;
  v_title         text;
  v_message       text;
  v_held_pence    integer;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(BTRIM(b.provider_name_snapshot), ''), 'Your provider'),
         COALESCE(b.service_name_snapshot, 'your booking'),
         COALESCE(NULLIF(BTRIM(b.customer_name), ''), 'the client')
    INTO v_provider_name, v_service_name, v_customer_name
    FROM public.bookings b WHERE b.id = NEW.booking_id;
  v_amount := '£' || TO_CHAR(COALESCE(NEW.refunded_amount, 0), 'FM999990.00');

  -- ── The client ──
  IF NEW.status = 'under_review' AND NEW.passed_automatically THEN
    v_title := 'Refund Request With Cerviced';
    v_message := v_provider_name || ' didn''t reply to your refund request for ' || v_service_name ||
      ' within 3 days, so it''s now with Cerviced. We''ll review it against their policy and aim to decide within 5 working days.';
  ELSIF NEW.status = 'under_review' THEN
    v_title := 'Refund Request With Cerviced';
    v_message := v_provider_name || ' passed your refund request for ' || v_service_name ||
      ' to Cerviced. We''ll review it against their policy and aim to decide within 5 working days.';
  ELSIF NEW.status = 'refunded' THEN
    v_title := 'Refunded';
    v_message := v_amount || ' is on its way back to you for ' || v_service_name ||
      '. Your bank may take a few days to show it.';
  ELSIF NEW.status = 'declined' THEN
    v_title := 'Refund Request Reviewed';
    v_message := 'Cerviced reviewed your refund request for ' || v_service_name ||
      ' and isn''t refunding it. Open the booking to see why.';
  END IF;

  -- A cancellation settlement already told the client about this money.
  IF v_title IS NOT NULL AND NOT (
    NEW.status = 'refunded' AND EXISTS (
      SELECT 1 FROM public.notifications n
       WHERE n.booking_id = NEW.booking_id AND n.user_id = NEW.client_id
         AND n.type = 'cancellation_settled' AND n.created_at > now() - interval '10 minutes'
    )
  ) THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role, metadata)
    VALUES (
      NEW.client_id, 'refund_request_updated', v_title, v_message,
      'high', FALSE, NEW.booking_id, NEW.provider_id, 'client',
      jsonb_build_object('refund_request_id', NEW.id, 'status', NEW.status)
    );
  END IF;

  -- ── The provider, when it went to Cerviced without them ──
  IF NEW.status = 'under_review' AND NEW.passed_automatically THEN
    SELECT p.user_id INTO v_provider_user FROM public.providers p WHERE p.id = NEW.provider_id;
    -- Only say the payment is on hold when there is one still held.
    SELECT pp.payout_amount INTO v_held_pence
      FROM public.provider_payouts pp
     WHERE pp.booking_id = NEW.booking_id AND pp.status = 'held';
    IF v_provider_user IS NOT NULL THEN
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role, metadata)
      VALUES (
        v_provider_user, 'refund_request_updated', 'Refund Request With Cerviced',
        'You didn''t reply to ' || v_customer_name || '''s refund request for ' || v_service_name ||
          ' within 3 days, so Cerviced is now reviewing it against your policy and aims to decide within 5 working days.' ||
          CASE WHEN COALESCE(v_held_pence, 0) > 0
            THEN ' Your £' || TO_CHAR(v_held_pence / 100.0, 'FM999990.00') || ' for this booking stays on hold until it''s settled.'
            ELSE '' END,
        'high', FALSE, NEW.booking_id, NEW.provider_id, 'provider',
        jsonb_build_object('refund_request_id', NEW.id, 'status', NEW.status, 'passed_automatically', true)
      );
    END IF;
  END IF;

  -- ── The provider, once Cerviced had it ── (their own refund needs no notice)
  IF OLD.status = 'under_review' AND NEW.status IN ('refunded', 'declined') THEN
    SELECT p.user_id INTO v_provider_user FROM public.providers p WHERE p.id = NEW.provider_id;
    IF v_provider_user IS NOT NULL THEN
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role, metadata)
      VALUES (
        v_provider_user, 'refund_request_updated', 'Refund Request Reviewed',
        CASE WHEN NEW.status = 'refunded'
          THEN 'Cerviced reviewed ' || v_customer_name || '''s refund request for ' || v_service_name ||
               ' and ' || v_amount || ' was refunded.'
          ELSE 'Cerviced reviewed ' || v_customer_name || '''s refund request for ' || v_service_name ||
               ' and isn''t refunding it.'
        END,
        'medium', FALSE, NEW.booking_id, NEW.provider_id, 'provider',
        jsonb_build_object('refund_request_id', NEW.id, 'status', NEW.status)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Hourly. Measured from when the client asked (created_at); a request the
-- provider has already refunded or passed has left 'with_provider' and is
-- never touched.
CREATE OR REPLACE FUNCTION public.process_refund_request_deadlines()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r RECORD;
BEGIN
  -- 2 days in: one reminder, a day before it goes to Cerviced.
  FOR r IN
    SELECT rr.id, rr.booking_id, rr.provider_id, p.user_id AS provider_user,
           COALESCE(NULLIF(BTRIM(b.customer_name), ''), 'A client') AS customer_name,
           COALESCE(b.service_name_snapshot, 'their booking') AS service_name
      FROM public.refund_requests rr
      JOIN public.bookings b ON b.id = rr.booking_id
      LEFT JOIN public.providers p ON p.id = rr.provider_id
     WHERE rr.status = 'with_provider'
       AND rr.provider_reminded_at IS NULL
       AND rr.created_at <= now() - interval '2 days'
       AND rr.created_at > now() - interval '3 days'
     FOR UPDATE OF rr SKIP LOCKED
  LOOP
    IF r.provider_user IS NOT NULL THEN
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role, metadata)
      VALUES (
        r.provider_user, 'refund_requested', 'One Day Left to Reply',
        r.customer_name || '''s refund request for ' || r.service_name ||
          ' goes to Cerviced to review tomorrow unless you refund it or pass it on first.',
        'high', TRUE, r.booking_id, r.provider_id, 'provider',
        jsonb_build_object('refund_request_id', r.id, 'reminder', true)
      );
    END IF;
    UPDATE public.refund_requests SET provider_reminded_at = now() WHERE id = r.id;
  END LOOP;

  -- 3 days in: Cerviced takes it. notify_refund_request_status tells both sides.
  UPDATE public.refund_requests
     SET status = 'under_review',
         passed_to_cerviced_at = now(),
         passed_automatically = true
   WHERE status = 'with_provider'
     AND created_at <= now() - interval '3 days';
END;
$function$;

REVOKE ALL ON FUNCTION public.process_refund_request_deadlines() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_refund_request_deadlines() TO service_role;

SELECT cron.unschedule('refund-request-deadlines')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refund-request-deadlines');
SELECT cron.schedule('refund-request-deadlines', '25 * * * *', 'SELECT public.process_refund_request_deadlines();');

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261031201000', 'refund_request_reply_deadline')
ON CONFLICT (version) DO NOTHING;

COMMIT;
