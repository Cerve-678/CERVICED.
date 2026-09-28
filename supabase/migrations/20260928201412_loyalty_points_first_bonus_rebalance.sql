-- ════════════════════════════════════════════════════════════════════════
-- Loyalty points: rebalance the one-time bonuses (and each-review value)
-- ════════════════════════════════════════════════════════════════════════
-- User-directed value change (2026-09-28). Only three deltas move; every
-- other branch of both functions is preserved byte-for-byte:
--
--   first_booking   (one-time)  200 -> 100
--   first_review    (one-time)   10 ->  50
--   review_left     (each after)  4 ->   2
--
-- Unchanged by request: booking_completed (+2), birthday_bonus (+50),
-- returning_client (+30), profile_completed (+30). The last two are the
-- untracked-expansion bonuses (see MIGRATION_OWNER.md "KNOWN GAP") and are
-- NOT surfaced on PointsScreen; this change does not touch them.
--
-- Both bodies below are reproduced from the verified-live pg_get_functiondef()
-- output (confirmed identical to 20260906174647_loyalty_points_value_changes.sql,
-- no live drift), per this repo's rule that a function you did not create is
-- rebuilt on top of what is actually deployed, not on the tracked file. The
-- review notification prints v_delta directly, so its copy follows the new
-- values automatically; the booking notification's inline "(+200)" literal is
-- updated to "(+100)" to match.
--
-- Owner: see supabase/MIGRATION_OWNER.md ("loyalty points first-bonus rebalance").

-- ────────────────────────────────────────────────────────────────────────
-- 1. Booking completed: first_booking 200 -> 100 (all other branches unchanged)
-- ────────────────────────────────────────────────────────────────────────

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
    VALUES (NEW.user_id, 2, 'booking_completed', NEW.id)
    ON CONFLICT DO NOTHING;
    IF FOUND THEN
      v_total := v_total + 2;
      v_lines := array_append(v_lines, 'completing your booking (+2)');
    END IF;

    SELECT count(*) INTO v_completed_count
    FROM public.bookings
    WHERE user_id = NEW.user_id AND status = 'completed';

    IF v_completed_count = 1 THEN
      INSERT INTO public.client_points_ledger (client_id, delta, reason, booking_id)
      VALUES (NEW.user_id, 100, 'first_booking', NEW.id)
      ON CONFLICT DO NOTHING;
      IF FOUND THEN
        v_total := v_total + 100;
        v_lines := array_append(v_lines, 'your first booking (+100)');
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
        v_lines := array_append(v_lines, 'booking with them again (+30)');
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
      v_lines := array_append(v_lines, 'booking on your birthday (+50)');
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

-- ────────────────────────────────────────────────────────────────────────
-- 2. Review left: first_review 10 -> 50, every later review 4 -> 2
-- ────────────────────────────────────────────────────────────────────────
-- The points_earned notification prints v_delta, so its amount tracks these
-- values with no further edit.

CREATE OR REPLACE FUNCTION public.award_points_on_review_left()
RETURNS TRIGGER AS $$
DECLARE
  v_review_count INT;
  v_delta INT;
  v_reason TEXT;
BEGIN
  SELECT count(*) INTO v_review_count
  FROM public.reviews
  WHERE user_id = NEW.user_id;

  IF v_review_count = 1 THEN
    v_delta := 50;
    v_reason := 'first_review';
  ELSE
    v_delta := 2;
    v_reason := 'review_left';
  END IF;

  INSERT INTO public.client_points_ledger (client_id, delta, reason, review_id, booking_id)
  VALUES (NEW.user_id, v_delta, v_reason, NEW.id, NEW.booking_id)
  ON CONFLICT DO NOTHING;

  IF FOUND THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
    VALUES (
      NEW.user_id,
      'points_earned',
      'You earned ' || v_delta || ' points! 🎉',
      CASE WHEN v_reason = 'first_review' THEN 'For leaving your first review.' ELSE 'For leaving a review.' END,
      'low',
      TRUE,
      NEW.booking_id,
      NEW.provider_id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
