-- ════════════════════════════════════════════════════════════════════════
-- Loyalty points: revised booking/review values + first-review bonus
-- ════════════════════════════════════════════════════════════════════════
-- Rebalances two of the per-event awards and adds a first-review bonus,
-- mirroring the first-booking bonus already live on the same table.
--
-- IMPORTANT — migration drift this file had to work around: the tracked
-- 20260828185349_client_loyalty_points.sql is stale. Two migrations applied
-- minutes after it the same day — 20260828192536_client_loyalty_points_expansion
-- and 20260828192643_client_loyalty_points_fix_array_append — are recorded in
-- supabase_migrations.schema_migrations but have NO file anywhere in this
-- repo. They added: a `returning_client` (+30) bonus on a client's 2nd+
-- completed booking with the same provider, a `profile_completed` (+30)
-- bonus (award_points_on_profile_completed(), fires when avatar_url is first
-- set), an inline birthday-on-booking-day bonus alongside the standalone
-- award_birthday_points() cron, a `provider_id` column on
-- client_points_ledger, and `points_earned` push notifications on every
-- award. None of that is reflected anywhere in git. Per this repo's own
-- ledger-backfill precedent (see MIGRATION_OWNER.md), a lost migration body
-- is not reconstructed from guesswork — so this file is built directly on
-- top of the verified live pg_get_functiondef() output for both functions
-- below, preserving every existing branch, and changes only the specific
-- values this request asked for. The two missing versions are noted in
-- MIGRATION_OWNER.md for a proper reconciliation pass; not attempted here.
--
-- Owner: see supabase/MIGRATION_OWNER.md ("loyalty points value changes").

-- ────────────────────────────────────────────────────────────────────────
-- 1. Allow the new 'first_review' reason
-- ────────────────────────────────────────────────────────────────────────
-- The live CHECK constraint already carries 'profile_completed' and
-- 'returning_client' (from the untracked expansion above) — reproduced here
-- verbatim plus the new value, not the stale 4-value list from the tracked
-- original file.

ALTER TABLE public.client_points_ledger
  DROP CONSTRAINT client_points_ledger_reason_check;

ALTER TABLE public.client_points_ledger
  ADD CONSTRAINT client_points_ledger_reason_check CHECK (reason IN
    ('booking_completed', 'review_left', 'first_booking', 'birthday_bonus',
     'profile_completed', 'returning_client', 'first_review'));

-- The old per-review unique index only covered reason = 'review_left'; a
-- client's first review now lands under reason = 'first_review' instead, so
-- the "one ledger entry per review" guard has to cover both reasons or a
-- first review would have no idempotency backstop at all.
DROP INDEX IF EXISTS public.client_points_ledger_one_per_review;
CREATE UNIQUE INDEX client_points_ledger_one_per_review
  ON public.client_points_ledger (review_id) WHERE reason IN ('review_left', 'first_review');

-- ────────────────────────────────────────────────────────────────────────
-- 2. Booking completed: 50 -> 2 (every other branch unchanged)
-- ────────────────────────────────────────────────────────────────────────
-- Full body reproduced from the live pg_get_functiondef() (not the stale
-- tracked file) so the returning_client bonus, the inline birthday bonus,
-- and the points_earned notification all survive. Only the booking_completed
-- delta (in the INSERT and in the running v_total/v_lines summary) changes.

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
      VALUES (NEW.user_id, 200, 'first_booking', NEW.id)
      ON CONFLICT DO NOTHING;
      IF FOUND THEN
        v_total := v_total + 200;
        v_lines := array_append(v_lines, 'your first booking (+200)');
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
-- 3. Review left: 20 -> 4, first-ever review -> 10 instead
-- ────────────────────────────────────────────────────────────────────────
-- "First ever" is counted off public.reviews for this client — this fires
-- AFTER INSERT, so NEW's own row is already counted and a count of 1 means
-- this is it. The points_earned notification (from the untracked expansion)
-- is preserved and now varies its copy/amount by which branch fired.

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
    v_delta := 10;
    v_reason := 'first_review';
  ELSE
    v_delta := 4;
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
