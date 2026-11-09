-- 20261109190000_follow_request_notification.sql
--
-- "Amy wants to follow you" (decided 2026-11-09): when someone asks to
-- follow a private account, the person they asked gets a notification (and
-- a push via send-push-notification, which has no switch for this type, so
-- it always sends). Tapping it opens Your circle, where Accept / Decline are.
--
-- Lifecycle, all from a trigger on client_follows so every path is covered
-- (request_follow, a re-request after an old decline, a cancel, a block):
-- - becomes 'pending'  -> one notification, unless an unread one for the
--   same person already exists from the last 7 days (no request/cancel spam);
-- - answered (accepted / declined) -> it's marked read and no longer actionable;
-- - cancelled or removed while pending (unfollow_person, block_person)
--   -> it's deleted, so "wants to follow you" never outlives the request.
-- A failed notification never blocks the follow itself.
--
-- The CHECK list is the live one (57 types, re-read 2026-11-09 just before
-- applying) plus 'follow_request'. First written as 20261109160000; renumbered
-- because 20261109170000 (post_appt_check_in_asks_for_feedback, #408) went
-- live first, and it sits above the peer's unapplied 20261109180000
-- (reminder_uses_provider_note_or_policies). Neither touches this CHECK or
-- client_follows.

BEGIN;

-- ── 1. allow the new type ──────────────────────────────────────────────────
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'address_released', 'aftercare_available', 'announcement', 'balance_reminder',
    'birthday_greeting', 'booking_cancelled', 'booking_confirmed', 'booking_declined',
    'booking_in_progress', 'booking_not_started', 'booking_pending', 'booking_reminder',
    'cancel_window_closing', 'cancellation_settled', 'daily_recap', 'fee_charged',
    'fee_dispute_resolved', 'fee_disputed', 'fee_paid_by_client', 'fee_payment_lapsed',
    'fee_payment_requested', 'info_pack_received', 'intake_form_completed', 'intake_form_received',
    'intake_form_reminder', 'maintenance_due', 'new_message', 'new_provider',
    'no_show', 'no_show_disputed', 'payment_not_completed', 'payment_refunded',
    'payment_success', 'payout_debt_recorded', 'payout_debt_recovered', 'payout_failed',
    'pending_booking_reminder', 'points_earned', 'post_appt_check_in', 'promotion',
    'provider_message', 'provider_no_show', 'provider_saved', 'rebooking_nudge',
    'refund_request_updated', 'refund_requested', 'reschedule_confirmed', 'reschedule_declined',
    'reschedule_expired', 'reschedule_provider_response', 'reschedule_request', 'review_received',
    'review_request', 'schedule_fully_booked', 'terms_updated', 'tip_received',
    'waitlist_slot_available', 'follow_request'
  ]));

-- ── 2. the notification ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_follow_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_first_name text;
BEGIN
  BEGIN
    IF TG_OP = 'DELETE' THEN
      IF OLD.status = 'pending' THEN
        DELETE FROM public.notifications
        WHERE user_id = OLD.followee_id AND type = 'follow_request'
          AND metadata->>'follower_id' = OLD.follower_id::text;
      END IF;
      RETURN OLD;
    END IF;

    IF NEW.status = 'pending' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'pending') THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = NEW.followee_id AND n.type = 'follow_request'
          AND n.metadata->>'follower_id' = NEW.follower_id::text
          AND n.is_read = false AND n.created_at > now() - interval '7 days'
      ) THEN
        SELECT NULLIF(split_part(btrim(coalesce(name, '')), ' ', 1), '')
          INTO v_first_name FROM public.users WHERE id = NEW.follower_id;
        INSERT INTO public.notifications
          (user_id, type, title, message, priority, is_actionable, recipient_role, metadata)
        VALUES (
          NEW.followee_id,
          'follow_request',
          'New follow request',
          coalesce(v_first_name, 'Someone') || ' wants to follow you.',
          'medium',
          true,
          'client',
          jsonb_build_object('follower_id', NEW.follower_id)
        );
      END IF;
    ELSIF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status IS DISTINCT FROM 'pending' THEN
      UPDATE public.notifications SET is_read = true, is_actionable = false
      WHERE user_id = NEW.followee_id AND type = 'follow_request'
        AND metadata->>'follower_id' = NEW.follower_id::text;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'follow_request notification failed for % -> %: %',
      coalesce(NEW.follower_id, OLD.follower_id), coalesce(NEW.followee_id, OLD.followee_id), SQLERRM;
  END;
  RETURN coalesce(NEW, OLD);
END
$function$;

REVOKE EXECUTE ON FUNCTION public.notify_follow_request() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_client_follow_request ON public.client_follows;
CREATE TRIGGER on_client_follow_request
  AFTER INSERT OR UPDATE OF status OR DELETE ON public.client_follows
  FOR EACH ROW EXECUTE FUNCTION public.notify_follow_request();

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261109190000', 'follow_request_notification')
ON CONFLICT (version) DO NOTHING;

COMMIT;
