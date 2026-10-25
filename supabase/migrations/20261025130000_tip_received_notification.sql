-- Tell the provider when a client tips them.
--
-- A tip (booking_tips) becomes 'succeeded' in recordTipPaid (stripe-webhook or
-- booking-tip 'confirm'). This trigger tells the provider at that moment,
-- whichever path recorded it, and only once (status can only move to
-- 'succeeded' once). The whole tip is theirs: CERVICED covers the card fee
-- (user, 2026-10-21), so the amount the client paid is the amount they get.
--
-- The push is gated by the provider's "Payment Updates" switch
-- (send-push-notification: tip_received → providerPayments); the in-app row is
-- always written, like every other type.
--
-- Renumbered 2026-10-25 above 20261025120000 (service_search), and before
-- that above 20261024100000 (listing_claims_checked_by_instagram); neither
-- touches notifications_type_check (50 types live, checked 2026-10-25).
-- First written as 20261021195500, then 20261024110000. Verify
-- max(version) and the live notifications_type_check before applying: this
-- restates the list from 20261020150000 plus 'tip_received'.

-- ── 1. allow the new type ──────────────────────────────────────────────────
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
    'provider_saved', 'tip_received'
  ]));

-- ── 2. the notification ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_provider_tip_received()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_provider_user uuid;
  v_first_name    text;
  v_service       text;
BEGIN
  SELECT user_id INTO v_provider_user FROM public.providers WHERE id = NEW.provider_id;
  IF v_provider_user IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT NULLIF(split_part(btrim(coalesce(name, '')), ' ', 1), '')
    INTO v_first_name FROM public.users WHERE id = NEW.client_user_id;
  SELECT service_name_snapshot INTO v_service FROM public.bookings WHERE id = NEW.booking_id;

  -- This runs inside the UPDATE that records the tip as paid. A failed
  -- notification must never roll that back (the money has moved), so it is
  -- caught and logged rather than raised.
  BEGIN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role, metadata)
    VALUES (
      v_provider_user,
      'tip_received',
      coalesce(v_first_name, 'A client') || ' tipped you £' || to_char(NEW.amount_pence / 100.0, 'FM999990.00'),
      'It''s all yours. '
        || CASE WHEN v_service IS NOT NULL THEN 'For their ' || v_service || ', paid' ELSE 'Paid' END
        || ' out to you in 24 hours.',
      'medium',
      true,
      NEW.booking_id,
      NEW.provider_id,
      'provider',
      jsonb_build_object('tip_id', NEW.id, 'amount_pence', NEW.amount_pence)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'tip_received notification failed for tip %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.notify_provider_tip_received() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_booking_tip_succeeded ON public.booking_tips;
CREATE TRIGGER on_booking_tip_succeeded
  AFTER UPDATE OF status ON public.booking_tips
  FOR EACH ROW
  WHEN (NEW.status = 'succeeded' AND OLD.status IS DISTINCT FROM 'succeeded')
  EXECUTE FUNCTION public.notify_provider_tip_received();

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261025130000', 'tip_received_notification')
ON CONFLICT (version) DO NOTHING;
