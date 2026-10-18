-- A client's refund request becomes a tracked thing the provider is told
-- about, instead of a support ticket only Cerviced ever saw.
--
-- Before this, "Request a refund" (client BookingDetailScreen ⋯ sheet) filed
-- a send-support-request ticket and nothing else: the provider — the person
-- who actually issues refunds — was never told, and nothing on the booking
-- recorded that a request existed, so the client had nothing to track.
--
-- 1. refund_requests: one row per request. Its status IS the client's
--    timeline:
--      with_provider → the provider has been told and can refund it
--      under_review  → the provider passed it to Cerviced (with a note)
--      refunded      → money went back, by ANY path (see 4)
--      declined      → Cerviced reviewed it and isn't refunding
--    At most one open (with_provider / under_review) request per booking.
--    Readable by its client and by the booking's provider; written only by
--    the SECURITY DEFINER functions below and the service role. There is no
--    admin UI: support works the queue from the SQL editor —
--      select * from refund_requests where status = 'under_review' order by created_at;
--    and resolves a request in ONE statement, so the client's notice already
--    carries the reason (a decline without one is refused by a CHECK):
--      update refund_requests set status = 'declined', outcome_note = '…' where id = '…';
--    A refund support issues closes it as 'refunded' by itself (see 4).
--    provider_note is withheld from app users by column grants: the pass-on
--    sheet tells the provider their reason goes to Cerviced, not the client,
--    and RLS alone can't hide one column from one of the two roles.
--    support_request_id is linked by send-support-request when the ticket
--    files; NULL means the ticket didn't, not that the request failed.
--
-- 2. request_booking_refund(): the record. The client of a booking paid
--    through the app files it, and the provider is notified
--    ('refund_requested', pushed by the existing notifications trigger).
--
-- 3. pass_refund_request_to_cerviced(): the provider's "I'm not refunding
--    this" — never a final no. It moves the request to under_review for a
--    person at Cerviced to decide, with the provider's reason.
--
-- 4. A bookings trigger closes an open request as 'refunded' whenever
--    refunded_amount goes up — provider refund, cancellation settlement,
--    webhook-reconciled refund alike — so no refund path has to remember to.
--
-- 5. A refund_requests trigger tells the client every time the status moves
--    ('refund_request_updated'), and tells the provider how it ended once
--    Cerviced had it (the pass-on sheet promises "we'll let you both know").
--    A 'refunded' notice is skipped when a cancellation settlement already
--    told the client about the same money a moment ago.
--
-- notifications_type_check is rebuilt from the LIVE constraint (verified
-- 2026-10-11 via pg_get_constraintdef) plus the two new values. It also
-- keeps the three fee types from 20261018100000_late_and_no_show_fees, which
-- must be applied FIRST: renumbered from 20261011100000 (then 20261018120000, which saved-cards also uses) on 2026-10-18 because
-- that version had fallen below the applied frontier (20261011102423), and a
-- list without the fee types would have silently dropped them.
--
-- Contains function bodies: apply in the Supabase SQL editor (apply_migration
-- mis-parses bodies — see MIGRATION_OWNER.md).
--
-- Frontier at authoring: 20261003120000.

CREATE TABLE IF NOT EXISTS public.refund_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id            uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  client_id             uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider_id           uuid REFERENCES public.providers(id) ON DELETE SET NULL,
  support_request_id    uuid REFERENCES public.support_requests(id) ON DELETE SET NULL,
  reason                text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 120),
  -- The client's own words. The provider can read this (the sheet says so).
  message               text CHECK (message IS NULL OR char_length(message) <= 1000),
  status                text NOT NULL DEFAULT 'with_provider'
                        CHECK (status IN ('with_provider', 'under_review', 'refunded', 'declined')),
  -- Why the provider passed it to Cerviced instead of refunding.
  provider_note         text CHECK (provider_note IS NULL OR char_length(provider_note) <= 1000),
  -- Support's note when resolving. Shown to the client.
  outcome_note          text CHECK (outcome_note IS NULL OR char_length(outcome_note) <= 1000),
  -- £ that came back while this request was open (set by the bookings trigger).
  refunded_amount       numeric(10,2),
  created_at            timestamptz NOT NULL DEFAULT now(),
  passed_to_cerviced_at timestamptz,
  resolved_at           timestamptz,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT refund_requests_decline_has_reason
    CHECK (status <> 'declined' OR NULLIF(BTRIM(outcome_note), '') IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS refund_requests_one_open_per_booking
  ON public.refund_requests (booking_id)
  WHERE status IN ('with_provider', 'under_review');
CREATE INDEX IF NOT EXISTS refund_requests_booking_created_idx
  ON public.refund_requests (booking_id, created_at DESC);
CREATE INDEX IF NOT EXISTS refund_requests_status_created_idx
  ON public.refund_requests (status, created_at DESC);

ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS refund_requests_client_read ON public.refund_requests;
CREATE POLICY refund_requests_client_read ON public.refund_requests
  FOR SELECT TO authenticated
  USING (client_id = auth.uid());

DROP POLICY IF EXISTS refund_requests_provider_read ON public.refund_requests;
CREATE POLICY refund_requests_provider_read ON public.refund_requests
  FOR SELECT TO authenticated
  USING (provider_id IN (SELECT p.id FROM public.providers p WHERE p.user_id = auth.uid()));

REVOKE ALL ON public.refund_requests FROM anon, authenticated;
-- Every column except provider_note (see 1).
GRANT SELECT (id, booking_id, client_id, provider_id, support_request_id, reason, message, status,
              outcome_note, refunded_amount, created_at, passed_to_cerviced_at, resolved_at, updated_at)
  ON public.refund_requests TO authenticated;

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
    'cancellation_settled',
    'fee_charged', 'fee_disputed', 'fee_dispute_resolved',
    'refund_requested', 'refund_request_updated'
  ]::text[]));

-- ── 2. The client files a request ─────────────────────────────────────────
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
  IF v_provider_user IS NOT NULL THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role, metadata)
    VALUES (
      v_provider_user, 'refund_requested', 'Refund Requested',
      COALESCE(NULLIF(BTRIM(v_customer_name), ''), 'A client') || ' has asked for a refund on ' ||
        COALESCE(v_service_name, 'their booking') || ' on ' ||
        TO_CHAR(v_booking_date, 'DD Mon YYYY') || ': ' || v_reason ||
        '. Refund it from the booking, or pass it to Cerviced to review.',
      'high', TRUE, p_booking_id, v_provider_id, 'provider',
      jsonb_build_object('refund_request_id', v_id)
    );
  END IF;

  RETURN v_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.request_booking_refund(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_booking_refund(uuid, text, text) TO authenticated;

-- ── 3. The provider passes it to Cerviced ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.pass_refund_request_to_cerviced(p_request_id uuid, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_note          text;
  v_status        text;
  v_provider_user uuid;
BEGIN
  v_note := LEFT(NULLIF(BTRIM(COALESCE(p_note, '')), ''), 1000);
  IF v_note IS NULL THEN
    RAISE EXCEPTION 'Please say why you are not refunding this.';
  END IF;

  SELECT r.status, p.user_id
    INTO v_status, v_provider_user
    FROM public.refund_requests r
    LEFT JOIN public.providers p ON p.id = r.provider_id
   WHERE r.id = p_request_id
   FOR UPDATE OF r;

  IF NOT FOUND OR v_provider_user IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Refund request not found';
  END IF;
  IF v_status <> 'with_provider' THEN
    RAISE EXCEPTION 'This refund request has already moved on.';
  END IF;

  UPDATE public.refund_requests
     SET status = 'under_review', provider_note = v_note, passed_to_cerviced_at = now()
   WHERE id = p_request_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.pass_refund_request_to_cerviced(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pass_refund_request_to_cerviced(uuid, text) TO authenticated;

-- ── 4. Any refund closes the open request ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.close_refund_request_on_refund()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(NEW.refunded_amount, 0) > COALESCE(OLD.refunded_amount, 0) THEN
    UPDATE public.refund_requests
       SET status = 'refunded',
           refunded_amount = COALESCE(NEW.refunded_amount, 0) - COALESCE(OLD.refunded_amount, 0)
     WHERE booking_id = NEW.id
       AND status IN ('with_provider', 'under_review');
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.close_refund_request_on_refund() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_close_refund_request_on_refund ON public.bookings;
CREATE TRIGGER trg_close_refund_request_on_refund
  AFTER UPDATE OF refunded_amount ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.close_refund_request_on_refund();

-- ── 5. Timestamps, and telling the client when the status moves ───────────
CREATE OR REPLACE FUNCTION public.stamp_refund_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  IF NEW.status IN ('refunded', 'declined') AND OLD.status NOT IN ('refunded', 'declined') THEN
    NEW.resolved_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.stamp_refund_request() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_stamp_refund_request ON public.refund_requests;
CREATE TRIGGER trg_stamp_refund_request
  BEFORE UPDATE ON public.refund_requests
  FOR EACH ROW EXECUTE FUNCTION public.stamp_refund_request();

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
  IF NEW.status = 'under_review' THEN
    v_title := 'Refund Request With Cerviced';
    v_message := v_provider_name || ' passed your refund request for ' || v_service_name ||
      ' to Cerviced. We''ll review it against their policy.';
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

REVOKE EXECUTE ON FUNCTION public.notify_refund_request_status() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_refund_request_status ON public.refund_requests;
CREATE TRIGGER trg_notify_refund_request_status
  AFTER UPDATE OF status ON public.refund_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_refund_request_status();
