-- ════════════════════════════════════════════════════════════════════════
-- Client loyalty points — round 2: more earn ways, birthday tied to a
-- booking, and a real "you earned points" notification.
-- ════════════════════════════════════════════════════════════════════════
-- Owner: see supabase/MIGRATION_OWNER.md ("feat/loyalty-points session
-- (round 2)"). Recorded version 20260828192536.
--
-- This file reproduces exactly what was applied at this version — including
-- `v_lines || 'literal'`, which is BROKEN (raises "malformed array literal"
-- the first time award_points_on_booking_completed() actually runs; Postgres
-- tries to parse the bare string as an array literal rather than appending it
-- as an element). That means this function was live-but-broken from this
-- version until the very next one, 20260828192643_client_loyalty_points_fix_
-- array_append.sql, replaced it — caught by a functional test in a
-- rolled-back transaction before any real booking hit it, not by a user
-- report. A fresh replay of this migration alone reproduces the broken state;
-- 20260828192643 MUST run immediately after it, same as it did live.

-- ── Schema: provider_id column, widened reason CHECK, new unique guards ───

ALTER TABLE public.client_points_ledger
  ADD COLUMN provider_id UUID REFERENCES public.providers(id) ON DELETE SET NULL;

ALTER TABLE public.client_points_ledger DROP CONSTRAINT client_points_ledger_reason_check;
ALTER TABLE public.client_points_ledger ADD CONSTRAINT client_points_ledger_reason_check
  CHECK (reason IN (
    'booking_completed', 'review_left', 'first_booking', 'birthday_bonus',
    'profile_completed', 'returning_client'
  ));

CREATE UNIQUE INDEX client_points_ledger_one_profile_completed_per_client
  ON public.client_points_ledger (client_id) WHERE reason = 'profile_completed';
CREATE UNIQUE INDEX client_points_ledger_one_returning_client_per_provider
  ON public.client_points_ledger (client_id, provider_id) WHERE reason = 'returning_client';

-- ── notifications: widen the CHECK constraint for the new type ────────────
-- Reproduces every value pg_get_constraintdef showed live, plus points_earned.

ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'cancel_window_closing','booking_pending','booking_confirmed','booking_declined',
    'booking_cancelled','booking_reminder','booking_in_progress','booking_not_started',
    'no_show','payment_success','new_provider','reschedule_request',
    'reschedule_provider_response','reschedule_confirmed','reschedule_declined',
    'reschedule_expired','review_request','review_received','promotion',
    'intake_form_reminder','intake_form_received','intake_form_completed',
    'info_pack_received','provider_message','announcement','balance_reminder',
    'waitlist_slot_available','new_message','address_released','birthday_greeting',
    'post_appt_check_in','rebooking_nudge','daily_recap','schedule_fully_booked',
    'pending_booking_reminder','provider_no_show','no_show_disputed','points_earned'
  ]::text[]));

-- ── Birthday moves from a standalone daily "free gift" cron into the ──────
-- booking-completion trigger: it now requires actually completing a booking
-- dated on the client's birthday, not just having a birthday that day.

SELECT cron.unschedule('award-birthday-points');
DROP FUNCTION IF EXISTS public.award_birthday_points();

-- ── Booking-completion trigger: rebuilt to also award returning-client and
-- birthday-on-booking-date, and to insert one consolidated points_earned
-- notification covering whatever combination fired this time. IF FOUND after
-- each ON CONFLICT DO NOTHING insert is how plpgsql detects whether that
-- particular insert actually landed a row (Postgres sets FOUND on INSERT the
-- same way it does on UPDATE/DELETE). The `v_lines || 'literal'` calls below
-- are the BROKEN form — see the note at the top of this file.

CREATE OR REPLACE FUNCTION public.award_points_on_booking_completed()
RETURNS TRIGGER AS $$
DECLARE
  v_completed_count INT;
  v_provider_completed_count INT;
  v_dob DATE;
  v_total INT := 0;
  v_lines TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    INSERT INTO public.client_points_ledger (client_id, delta, reason, booking_id)
    VALUES (NEW.user_id, 50, 'booking_completed', NEW.id)
    ON CONFLICT DO NOTHING;
    IF FOUND THEN
      v_total := v_total + 50;
      v_lines := v_lines || 'completing your booking (+50)';
    END IF;

    SELECT count(*) INTO v_completed_count
    FROM public.bookings
    WHERE user_id = NEW.user_id AND status = 'completed';

    IF v_completed_count = 1 THEN
      INSERT INTO public.client_points_ledger (client_id, delta, reason, booking_id)
      VALUES (NEW.user_id, 200, 'first_booking', NEW.id)
      ON CONFLICT DO NOTHING;
      IF FOUND THEN
        v_total := v_total + 200;
        v_lines := v_lines || 'your first booking (+200)';
      END IF;
    END IF;

    SELECT count(*) INTO v_provider_completed_count
    FROM public.bookings
    WHERE user_id = NEW.user_id AND provider_id = NEW.provider_id AND status = 'completed';

    IF v_provider_completed_count >= 2 THEN
      INSERT INTO public.client_points_ledger (client_id, delta, reason, booking_id, provider_id)
      VALUES (NEW.user_id, 30, 'returning_client', NEW.id, NEW.provider_id)
      ON CONFLICT DO NOTHING;
      IF FOUND THEN
        v_total := v_total + 30;
        v_lines := v_lines || 'booking with them again (+30)';
      END IF;
    END IF;

    SELECT dob INTO v_dob FROM public.users WHERE id = NEW.user_id;
    IF v_dob IS NOT NULL
       AND TO_CHAR(v_dob, 'MM-DD') = TO_CHAR(NEW.booking_date, 'MM-DD')
       AND NOT EXISTS (
         SELECT 1 FROM public.client_points_ledger l
         WHERE l.client_id = NEW.user_id
           AND l.reason = 'birthday_bonus'
           AND l.created_at > NOW() - INTERVAL '300 days'
       )
    THEN
      INSERT INTO public.client_points_ledger (client_id, delta, reason, booking_id)
      VALUES (NEW.user_id, 50, 'birthday_bonus', NEW.id);
      v_total := v_total + 50;
      v_lines := v_lines || 'booking on your birthday (+50)';
    END IF;

    IF v_total > 0 THEN
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
      VALUES (
        NEW.user_id,
        'points_earned',
        'You earned ' || v_total || ' points! 🎉',
        'For ' || array_to_string(v_lines, ', ') || '.',
        'low',
        TRUE,
        NEW.id,
        NEW.provider_id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ── Review trigger: now also notifies ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.award_points_on_review_left()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.client_points_ledger (client_id, delta, reason, review_id, booking_id)
  VALUES (NEW.user_id, 20, 'review_left', NEW.id, NEW.booking_id)
  ON CONFLICT DO NOTHING;

  IF FOUND THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
    VALUES (
      NEW.user_id,
      'points_earned',
      'You earned 20 points! 🎉',
      'For leaving a review.',
      'low',
      TRUE,
      NEW.booking_id,
      NEW.provider_id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ── New: profile completed (first time a client adds a photo) ─────────────

CREATE OR REPLACE FUNCTION public.award_points_on_profile_completed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.avatar_url IS NOT NULL AND OLD.avatar_url IS NULL THEN
    INSERT INTO public.client_points_ledger (client_id, delta, reason)
    VALUES (NEW.id, 30, 'profile_completed')
    ON CONFLICT DO NOTHING;

    IF FOUND THEN
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable)
      VALUES (
        NEW.id,
        'points_earned',
        'You earned 30 points! 🎉',
        'For completing your profile.',
        'low',
        TRUE
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS on_user_award_profile_points ON public.users;
CREATE TRIGGER on_user_award_profile_points
  AFTER UPDATE OF avatar_url ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.award_points_on_profile_completed();
