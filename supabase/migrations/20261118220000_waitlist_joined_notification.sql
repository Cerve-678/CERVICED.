-- Tell the provider when someone joins their waitlist.
--
-- Until now the only waitlist notification went to the CLIENT, when a space
-- opened. A provider learned about a new person in line only by opening the
-- To Do tab. Now each join sends the provider a 'waitlist_joined' notification
-- (in-app row + push, gated by the "Waitlist" switch, providerWaitlist).
--
-- Rejoining is delete + insert (joinWaitlist), so a client leaving and
-- rejoining the same waitlist is told about once a day, not every time.
--
-- The client's name is the same snapshot the provider already sees on their
-- waitlist (provider_waitlist.user_name_snapshot), so this shows nothing new.
--
-- Also puts 'provider_no_show' back in the CHECK. Live lost it at some point
-- with no migration recording why, while handle_booking_status_change still
-- inserts it unguarded: a client reporting that their provider didn't show
-- would have had the whole status change rolled back. No booking has ever
-- reached that status, so nobody has hit it yet.

BEGIN;

-- Guard: the CHECK below is rebuilt from the live list as of 2026-11-18.
DO $$
BEGIN
  IF md5(pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conname = 'notifications_type_check')))
     <> 'e917f4deed70991ded0c744cf1021d79' THEN
    RAISE EXCEPTION 'notifications_type_check changed since this migration was written; rebuild it from live';
  END IF;
END $$;

ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY['address_released', 'aftercare_available', 'announcement', 'balance_reminder', 'birthday_greeting', 'booking_cancelled', 'booking_confirmed', 'booking_declined', 'booking_in_progress', 'booking_not_started', 'booking_pending', 'booking_reminder', 'cancel_window_closing', 'cancellation_settled', 'daily_recap', 'fee_charged', 'fee_dispute_resolved', 'fee_disputed', 'fee_paid_by_client', 'fee_payment_lapsed', 'fee_payment_requested', 'info_pack_received', 'intake_form_completed', 'intake_form_received', 'intake_form_reminder', 'maintenance_due', 'new_message', 'new_provider', 'no_show', 'no_show_disputed', 'payment_not_completed', 'payment_refunded', 'payment_success', 'payout_debt_recorded', 'payout_debt_recovered', 'payout_failed', 'pending_booking_reminder', 'points_earned', 'post_appt_check_in', 'promotion', 'provider_message', 'provider_no_show', 'provider_saved', 'rebooking_nudge', 'refund_request_updated', 'refund_requested', 'reschedule_confirmed', 'reschedule_declined', 'reschedule_expired', 'reschedule_provider_response', 'reschedule_request', 'review_received', 'review_request', 'schedule_fully_booked', 'terms_updated', 'tip_received', 'waitlist_slot_available', 'follow_request', 'waitlist_joined']::text[]));

CREATE OR REPLACE FUNCTION public.notify_provider_waitlist_joined()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_provider_user uuid;
  v_who text;
  v_what text;
  v_title text;
  v_place int;
BEGIN
  IF NEW.status IS DISTINCT FROM 'waiting' THEN
    RETURN NEW;
  END IF;

  SELECT p.user_id INTO v_provider_user
    FROM public.providers p
   WHERE p.id = NEW.provider_id;
  IF v_provider_user IS NULL OR v_provider_user = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Leaving and rejoining the same waitlist: tell them once a day.
  IF EXISTS (
    SELECT 1 FROM public.notifications n
     WHERE n.user_id = v_provider_user
       AND n.type = 'waitlist_joined'
       AND n.provider_id = NEW.provider_id
       AND n.metadata->>'client_id' = NEW.user_id::text
       AND n.metadata->>'service_id' IS NOT DISTINCT FROM NEW.service_id::text
       AND n.created_at > now() - interval '24 hours'
  ) THEN
    RETURN NEW;
  END IF;

  -- Service first, then their place, the way the app says it ("2nd in line",
  -- placeInLineLabel): "Mini Manicure · 3rd in line" / "Faith joined your waitlist."
  SELECT count(*)::int INTO v_place
    FROM public.provider_waitlist w
   WHERE w.provider_id = NEW.provider_id
     AND w.service_id IS NOT DISTINCT FROM NEW.service_id
     AND w.status = 'waiting'
     AND w.position <= NEW.position;
  v_who := COALESCE(NULLIF(btrim(NEW.user_name_snapshot), ''), 'Someone');
  v_what := COALESCE(NULLIF(btrim(NEW.service_name_snapshot), ''), 'Your waitlist');
  v_title := v_what || CASE WHEN v_place >= 1 THEN ' · ' || v_place ||
    CASE WHEN v_place % 100 IN (11, 12, 13) THEN 'th'
         WHEN v_place % 10 = 1 THEN 'st'
         WHEN v_place % 10 = 2 THEN 'nd'
         WHEN v_place % 10 = 3 THEN 'rd'
         ELSE 'th' END || ' in line' ELSE '' END;

  BEGIN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, provider_id, recipient_role, metadata)
    VALUES
      (v_provider_user, 'waitlist_joined', v_title,
       v_who || ' joined your waitlist.',
       'low', true, NEW.provider_id, 'provider',
       jsonb_build_object('kind', 'waitlist_joined', 'waitlist_id', NEW.id,
                          'client_id', NEW.user_id, 'service_id', NEW.service_id));
  EXCEPTION WHEN OTHERS THEN
    -- A failed notification must never stop the client joining.
    RAISE WARNING 'waitlist_joined notification failed for waitlist %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_provider_waitlist_joined() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_waitlist_joined_notify ON public.provider_waitlist;
CREATE TRIGGER trg_waitlist_joined_notify
  AFTER INSERT ON public.provider_waitlist
  FOR EACH ROW EXECUTE FUNCTION public.notify_provider_waitlist_joined();

COMMIT;
