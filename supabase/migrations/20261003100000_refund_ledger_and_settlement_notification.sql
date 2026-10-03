-- Partial and repeat refunds, plus the "your policy kept the deposit" notice.
--
-- 1. bookings.payment_status gains 'partially_refunded'. A cancellation-policy
--    settlement (apply-cancellation-refund) or a provider's partial / goodwill
--    refund (refund-payment) returns only PART of what was paid. The payout
--    release job skips on payment_status = 'refunded' specifically, so a
--    partial refund must be a distinct status. Supersedes the never-applied
--    20261002130000_bookings_partially_refunded_status.sql (same constraint,
--    folded in here so it is above the applied frontier).
--
-- 2. booking_refunds: one row per Stripe refund. A booking can now be refunded
--    more than once (policy kept the deposit → provider gives it back), so a
--    single bookings.stripe_refund_id can no longer describe its refunds. The
--    row is also the idempotency claim for adjusting the provider's payout:
--    reconcileRefund runs from both the edge function and the Stripe webhook,
--    and only the caller that flips payout_applied false→true moves money.
--    Written only by the service role (edge functions); a provider may read
--    the rows for their own bookings so the Issue Refund sheet can show what
--    their policy already did.
--
-- 3. notifications type 'cancellation_settled', inserted by
--    apply-cancellation-refund for both the provider and the client when a
--    late cancellation leaves the provider keeping a deposit / their share.
--    Rebuilt from the live constraint (verified 2026-10-03) plus the new value.
--
-- 4. bookings.cancelled_at / cancelled_by, stamped by a trigger the moment a
--    booking becomes cancelled. apply-cancellation-refund is called by the
--    client, so it must judge "late" against WHEN they cancelled (not when the
--    call arrives — waiting until after the appointment would otherwise turn a
--    late cancel into a full refund) and must only settle CLIENT cancellations
--    (a provider cancel is refunded in full by refund_booking_async). Security
--    review 2026-10-03. auth.uid() is the caller's JWT even inside the
--    SECURITY DEFINER cancel RPCs; cron expiry has none, so it is 'system'.
--
-- Contains a function body: apply in the Supabase SQL editor (apply_migration
-- mis-parses bodies — see MIGRATION_OWNER.md).
--
-- Frontier at authoring: 20261002230000.

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_payment_status_check
  CHECK (payment_status IN (
    'pending', 'deposit_paid', 'fully_paid', 'refunded', 'partially_refunded', 'failed'
  ));

CREATE TABLE IF NOT EXISTS public.booking_refunds (
  stripe_refund_id   text PRIMARY KEY,
  booking_id         uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  amount_pence       integer NOT NULL CHECK (amount_pence > 0),
  -- How much of the provider's payout this refund takes back. 0 for a
  -- cancellation settlement, which settles the payout itself.
  payout_adjust_pence integer NOT NULL DEFAULT 0 CHECK (payout_adjust_pence >= 0),
  payout_applied     boolean NOT NULL DEFAULT false,
  -- 'cancellation_settlement' | 'provider' | 'admin' | 'external'
  kind               text NOT NULL,
  -- For a cancellation settlement: what the provider kept under their policy.
  provider_kept_pence integer,
  reason             text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS booking_refunds_booking_id_idx ON public.booking_refunds (booking_id);

ALTER TABLE public.booking_refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_refunds_provider_read ON public.booking_refunds;
CREATE POLICY booking_refunds_provider_read ON public.booking_refunds
  FOR SELECT TO authenticated
  USING (booking_id IN (
    SELECT b.id FROM public.bookings b
      JOIN public.providers p ON p.id = b.provider_id
     WHERE p.user_id = auth.uid()
  ));

REVOKE ALL ON public.booking_refunds FROM anon, authenticated;
GRANT SELECT ON public.booking_refunds TO authenticated;

-- Backfill the one refund issued before this table existed, so "already
-- refunded" sums stay right for it.
INSERT INTO public.booking_refunds (stripe_refund_id, booking_id, amount_pence, payout_adjust_pence, payout_applied, kind, reason)
SELECT b.stripe_refund_id, b.id, round(b.refunded_amount * 100)::int, 0, true, 'provider', 'backfilled 2026-10-03'
  FROM public.bookings b
 WHERE b.stripe_refund_id IS NOT NULL
   AND b.payment_status = 'refunded'
   AND coalesce(b.refunded_amount, 0) > 0
ON CONFLICT (stripe_refund_id) DO NOTHING;

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
    'cancellation_settled'
  ]::text[]));

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by text CHECK (cancelled_by IN ('client', 'provider', 'system'));

CREATE OR REPLACE FUNCTION public.stamp_booking_cancellation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    NEW.cancelled_at := now();
    NEW.cancelled_by := CASE
      WHEN auth.uid() IS NULL THEN 'system'
      WHEN auth.uid() = NEW.user_id THEN 'client'
      ELSE 'provider'
    END;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.stamp_booking_cancellation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_stamp_booking_cancellation ON public.bookings;
CREATE TRIGGER trg_stamp_booking_cancellation
  BEFORE UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.stamp_booking_cancellation();
