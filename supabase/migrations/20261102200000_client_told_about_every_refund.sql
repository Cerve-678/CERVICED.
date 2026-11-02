-- 20261102200000_client_told_about_every_refund.sql
--
-- A client is told whenever money goes back to them from a booking.
--
-- Until now only three refunds said anything to the client: a late
-- cancellation that kept money (cancellation_settled), a refund that closed a
-- refund request (refund_request_updated) and a late/no-show fee refund
-- (fee_dispute_resolved). A provider's own full or partial refund, a full
-- refund on an early cancellation, and the automatic refund when a provider
-- declines or never accepts all moved money silently. On 2026-11-02 a £10
-- partial refund and a £126.26 cancellation refund both reached no one.
--
-- What this adds:
--   - notification type payment_refunded, added to notifications_type_check by
--     reading the live list (refuses to rebuild if it reads fewer than 50).
--     send-push-notification needs no change: a type in neither preference
--     map always pushes, which is right for money.
--   - notify_client_of_refund(), AFTER INSERT on booking_refunds. That ledger
--     gets exactly one row per succeeded Stripe refund, whoever made it
--     (reconcileRefund upserts with ignoreDuplicates), so this fires once per
--     refund and covers any refund route added later.
--
-- It stays quiet when another notice already gives the client the amount:
--   - a cancellation settlement where the provider kept money
--     (apply-cancellation-refund sends cancellation_settled with the figure);
--   - a refund on a booking with an open refund request. The ledger row is
--     written before bookings.refunded_amount, whose trigger closes the
--     request and sends "Refunded"; a request already closed in this same
--     transaction (resolved_at = now()) is treated the same way, so the
--     outcome doesn't depend on trigger order.
--
-- Amounts are what the client gets back (booking_refunds.amount_pence), fee
-- share included. The provider never sees this notice.

BEGIN;

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
  -- 55 types live at authoring. Far fewer means the definition wasn't read
  -- the way this expects; stop rather than shrink the list.
  IF COALESCE(array_length(v_types, 1), 0) < 50 THEN
    RAISE EXCEPTION 'read only % types from notifications_type_check; refusing to rebuild it',
      COALESCE(array_length(v_types, 1), 0);
  END IF;

  v_types := ARRAY(
    SELECT DISTINCT t FROM unnest(v_types || ARRAY['payment_refunded']) AS t ORDER BY t
  );
  ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
  EXECUTE format(
    'ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (%L::text[]))',
    v_types);
END $$;

CREATE OR REPLACE FUNCTION public.notify_client_of_refund()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_client_id     uuid;
  v_provider_id   uuid;
  v_status        text;
  v_paid_pence    bigint;
  v_provider_name text;
  v_service_name  text;
  v_total_pence   bigint;
  v_full          boolean;
  v_amount        text;
  v_title         text;
  v_message       text;
BEGIN
  -- The late-cancellation notice already states what came back.
  IF NEW.kind = 'cancellation_settlement' AND COALESCE(NEW.provider_kept_pence, 0) > 0 THEN
    RETURN NEW;
  END IF;

  -- The refund request this refund answers sends its own "Refunded".
  IF EXISTS (
    SELECT 1 FROM public.refund_requests r
     WHERE r.booking_id = NEW.booking_id
       AND (r.status IN ('with_provider', 'under_review')
            OR (r.status = 'refunded' AND r.resolved_at >= now()))
  ) THEN
    RETURN NEW;
  END IF;

  SELECT b.user_id, b.provider_id, b.status,
         ROUND(COALESCE(b.amount_paid, 0) * 100),
         COALESCE(NULLIF(BTRIM(b.provider_name_snapshot), ''), 'Your provider'),
         COALESCE(NULLIF(BTRIM(b.service_name_snapshot), ''), 'your booking')
    INTO v_client_id, v_provider_id, v_status, v_paid_pence, v_provider_name, v_service_name
    FROM public.bookings b
   WHERE b.id = NEW.booking_id;
  IF NOT FOUND OR v_client_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(r.amount_pence), 0) INTO v_total_pence
    FROM public.booking_refunds r WHERE r.booking_id = NEW.booking_id;
  v_full := v_paid_pence > 0 AND v_total_pence >= v_paid_pence;
  v_amount := '£' || TO_CHAR(NEW.amount_pence / 100.0, 'FM999990.00');

  IF v_status = 'cancelled' THEN
    -- Early cancellation, provider declined or cancelled, or never accepted.
    v_title := 'Refund on its way';
    v_message := v_amount || ' for ' || v_service_name || ' with ' || v_provider_name ||
      ' is on its way back to you. It can take 5–10 working days to show on your statement.';
  ELSIF v_full THEN
    v_title := 'Refunded in full';
    v_message := v_provider_name || ' refunded ' || v_amount || ' for ' || v_service_name ||
      ', so everything you paid is coming back. It can take 5–10 working days to show on your statement.';
  ELSE
    v_title := 'Partial refund';
    v_message := v_provider_name || ' refunded ' || v_amount || ' for ' || v_service_name ||
      '. It can take 5–10 working days to show on your statement.';
  END IF;

  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role, metadata)
  VALUES (
    v_client_id, 'payment_refunded', v_title, v_message,
    'high', FALSE, NEW.booking_id, v_provider_id, 'client',
    jsonb_build_object('stripe_refund_id', NEW.stripe_refund_id, 'amount_pence', NEW.amount_pence, 'full', v_full)
  );
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_client_of_refund() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS after_refund_notify_client ON public.booking_refunds;
CREATE TRIGGER after_refund_notify_client
  AFTER INSERT ON public.booking_refunds
  FOR EACH ROW EXECUTE FUNCTION public.notify_client_of_refund();

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261102200000', 'client_told_about_every_refund')
ON CONFLICT (version) DO NOTHING;

COMMIT;
