-- When a late/no-show fee can't be charged to the saved card (the bank
-- declines it or wants the client to approve it), ask the client to pay it.
--
-- User decisions 2026-10-19:
--   • the client is asked both in the app (notification + "Pay fee" on the
--     booking) and by email (a link to Stripe's own payment page)
--   • the request lapses after 7 days, and the provider is told
--   • while it's open the provider sees "Waiting for the client to pay" and
--     can cancel the request
--
-- How it works: booking-fee raises a Stripe invoice for the fee on the
-- client's Stripe Customer. The invoice's one PaymentIntent is what both the
-- in-app payment sheet and the emailed Stripe page pay, so the fee can't be
-- paid twice. The fee row waits in status 'awaiting_client' until that
-- payment succeeds (booking-fee 'paid', or the webhook), is cancelled by the
-- provider, or lapses (release-payouts, woken by process_due_payouts).
--
-- 1. booking_fee_charges: status 'awaiting_client'; stripe_invoice_id; pay_by.
--    'awaiting_client' counts as live for booking_fee_charges_one_per_booking,
--    so a provider can't start a second charge while a request is open.
-- 2. notifications_type_check gains fee_payment_requested (client),
--    fee_paid_by_client and fee_payment_lapsed (provider). Rebuilt from the
--    live constraint (verified 2026-10-19) plus the new values.
-- 3. process_due_payouts() also wakes release-payouts when a request is past
--    its pay_by. Reproduced from the live definition (verified 2026-10-19);
--    only the "anything due?" check changes.
--
-- Frontier at authoring: 20261019140000. Paste into the SQL editor, then
-- record the version.

BEGIN;

-- 1. Waiting for the client --------------------------------------------------
ALTER TABLE public.booking_fee_charges DROP CONSTRAINT IF EXISTS booking_fee_charges_status_check;
ALTER TABLE public.booking_fee_charges ADD CONSTRAINT booking_fee_charges_status_check
  CHECK (status = ANY (ARRAY['processing', 'awaiting_client', 'succeeded', 'failed', 'refunded']));

ALTER TABLE public.booking_fee_charges
  ADD COLUMN IF NOT EXISTS stripe_invoice_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS pay_by timestamptz;

COMMENT ON COLUMN public.booking_fee_charges.pay_by IS
  'While status = awaiting_client: when the client''s request to pay lapses (7 days after it was sent).';

CREATE INDEX IF NOT EXISTS booking_fee_charges_awaiting_client_idx
  ON public.booking_fee_charges (pay_by) WHERE status = 'awaiting_client';

-- 2. Notification types --------------------------------------------------------
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
    'fee_payment_requested', 'fee_paid_by_client', 'fee_payment_lapsed'
  ]));

-- 3. Wake the payout job for lapsed requests too ---------------------------------
CREATE OR REPLACE FUNCTION public.process_due_payouts()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.provider_payouts
     WHERE status = 'held' AND release_after <= now()
  ) AND NOT EXISTS (
    SELECT 1 FROM public.booking_fee_charges
     WHERE payout_status = 'held' AND release_after <= now()
  ) AND NOT EXISTS (
    SELECT 1 FROM public.booking_fee_charges
     WHERE status = 'awaiting_client' AND pay_by <= now()
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
    url     := 'https://ztrfpfvvejzaysrelmfm.supabase.co/functions/v1/release-payouts',
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

COMMIT;
