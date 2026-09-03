-- ════════════════════════════════════════════════════════════════════════
-- Client loyalty points — rebalance
-- ════════════════════════════════════════════════════════════════════════
-- Earn table after this migration:
--
--   REPEATABLE   complete a booking   +2   (every completion after the first)
--                leave a review       +4   (once per review)
--                birthday bonus      +50   (booking dated on your birthday)
--   ONE-OFF      first booking      +100   (replaces the +2, doesn't stack)
--                complete profile    +30   (avatar set)
--
-- `returning_client` (+30 once per provider) is removed outright — reason,
-- index, trigger branch and its existing rows.
--
-- Owner: see supabase/MIGRATION_OWNER.md.

-- ────────────────────────────────────────────────────────────────────────
-- 1. Retire `returning_client`
-- ────────────────────────────────────────────────────────────────────────
-- Rows go before the CHECK narrows, or the new constraint can't validate.
-- The 4 live rows are test data; deleting them reduces three clients'
-- balances by 30 each.

DELETE FROM public.client_points_ledger WHERE reason = 'returning_client';

DROP INDEX IF EXISTS public.client_points_ledger_one_returning_client_per_provider;

ALTER TABLE public.client_points_ledger
  DROP CONSTRAINT client_points_ledger_reason_check;

ALTER TABLE public.client_points_ledger
  ADD CONSTRAINT client_points_ledger_reason_check CHECK (reason IN
    ('booking_completed', 'review_left', 'first_booking',
     'birthday_bonus', 'profile_completed'));

-- `provider_id` was added solely for returning_client and now has no writer
-- and no reader. Left in place rather than dropped — that call is the
-- product owner's, and DROP COLUMN is not reversible.

-- ────────────────────────────────────────────────────────────────────────
-- 2. Booking completion: +2, or +100 for the first
-- ────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.award_points_on_booking_completed()
RETURNS TRIGGER AS $$
DECLARE
  v_dob   DATE;
  v_total INT := 0;
  v_lines TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    -- The welcome bonus REPLACES the ordinary completion award rather than
    -- stacking on top of it, so a first booking pays 100, not 102.
    --
    -- Eligibility is now the ledger's own partial unique index
    -- (client_points_ledger_one_first_booking_per_client), not a count of
    -- completed bookings. The old `count(*) = 1` test never paid out once in
    -- production: a first visit booked as a multi-service cart completes
    -- every row in a SINGLE statement, and an AFTER ROW trigger sees that
    -- whole statement's effect, so the count was already >1 for every row
    -- including the first. Asking "has this client ever been paid the bonus?"
    -- is both the question that was meant and the one that survives a
    -- multi-row completion.
    INSERT INTO public.client_points_ledger (client_id, delta, reason, booking_id)
    VALUES (NEW.user_id, 100, 'first_booking', NEW.id)
    ON CONFLICT DO NOTHING;

    IF FOUND THEN
      v_total := v_total + 100;
      v_lines := array_append(v_lines, 'your first booking (+100)');
    ELSE
      INSERT INTO public.client_points_ledger (client_id, delta, reason, booking_id)
      VALUES (NEW.user_id, 2, 'booking_completed', NEW.id)
      ON CONFLICT DO NOTHING;

      IF FOUND THEN
        v_total := v_total + 2;
        v_lines := array_append(v_lines, 'completing your booking (+2)');
      END IF;
    END IF;

    -- Birthday bonus: unchanged. Still the only award without a hard unique
    -- index behind it — the 300-day NOT EXISTS window is its whole guard.
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
-- 3. Review: +20 → +4
-- ────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.award_points_on_review_left()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.client_points_ledger (client_id, delta, reason, review_id, booking_id)
  VALUES (NEW.user_id, 4, 'review_left', NEW.id, NEW.booking_id)
  ON CONFLICT DO NOTHING;

  IF FOUND THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
    VALUES (
      NEW.user_id,
      'points_earned',
      'You earned 4 points! 🎉',
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
