-- ════════════════════════════════════════════════════════════════════════
-- Client loyalty points — earning side only
-- ════════════════════════════════════════════════════════════════════════
-- Wires PointsScreen.tsx to a real, append-only ledger. Redemption and
-- referral attribution are deliberately NOT part of this migration — neither
-- subsystem exists yet (referral_source is a signup survey answer, not a
-- trackable relationship; the only discount mechanic live is provider-scoped
-- `promotions`, not client-scoped). This migration only ever adds points; it
-- introduces no way to spend them yet.
--
-- Owner: see supabase/MIGRATION_OWNER.md ("feat/loyalty-points session").
-- Authored as 20260828120000; apply_migration recorded 20260828185349, and
-- this file was renamed to match — the recorded version is the one that
-- runs, per this repo's "filename is the record's shadow" convention.

-- ────────────────────────────────────────────────────────────────────────
-- 1. Ledger table
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE public.client_points_ledger (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  delta       INT NOT NULL,
  reason      TEXT NOT NULL CHECK (reason IN
                ('booking_completed', 'review_left', 'first_booking', 'birthday_bonus')),
  booking_id  UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  review_id   UUID REFERENCES public.reviews(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.client_points_ledger IS
  'Append-only. Balance is derived by summing delta, never stored — see get_client_points_balance().';

CREATE INDEX client_points_ledger_client_id_idx ON public.client_points_ledger (client_id, created_at DESC);

-- Hard idempotency guards: a booking/review can award its bonus at most once,
-- and a client can receive the first-booking bonus at most once, enforced by
-- the database itself rather than only by the trigger's own logic.
CREATE UNIQUE INDEX client_points_ledger_one_per_completed_booking
  ON public.client_points_ledger (booking_id) WHERE reason = 'booking_completed';
CREATE UNIQUE INDEX client_points_ledger_one_per_review
  ON public.client_points_ledger (review_id) WHERE reason = 'review_left';
CREATE UNIQUE INDEX client_points_ledger_one_first_booking_per_client
  ON public.client_points_ledger (client_id) WHERE reason = 'first_booking';

ALTER TABLE public.client_points_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients read own points ledger"
  ON public.client_points_ledger
  FOR SELECT
  USING (client_id = auth.uid());

-- No INSERT/UPDATE/DELETE policy for `authenticated` on purpose — every write
-- happens through a SECURITY DEFINER trigger/function below, never directly
-- from the client. RLS has no DELETE policy anywhere in this app by
-- convention; this table adds nothing new there.

-- ────────────────────────────────────────────────────────────────────────
-- 2. Award: booking completed (+50), and first-ever completed booking (+200)
-- ────────────────────────────────────────────────────────────────────────
-- Fires once per booking: both routes that set status = 'completed'
-- (process_auto_complete_bookings()'s cron, and provider_update_booking_status())
-- only transition out of 'confirmed'/'in_progress', and the RPC explicitly
-- refuses any transition out of a terminal state — so OLD.status is never
-- 'completed' going in, and the unique index above is a second, harder
-- backstop against a double-award regardless.

CREATE OR REPLACE FUNCTION public.award_points_on_booking_completed()
RETURNS TRIGGER AS $$
DECLARE
  v_completed_count INT;
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    INSERT INTO public.client_points_ledger (client_id, delta, reason, booking_id)
    VALUES (NEW.user_id, 50, 'booking_completed', NEW.id)
    ON CONFLICT DO NOTHING;

    SELECT count(*) INTO v_completed_count
    FROM public.bookings
    WHERE user_id = NEW.user_id AND status = 'completed';

    IF v_completed_count = 1 THEN
      INSERT INTO public.client_points_ledger (client_id, delta, reason, booking_id)
      VALUES (NEW.user_id, 200, 'first_booking', NEW.id)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS on_booking_award_points ON public.bookings;
CREATE TRIGGER on_booking_award_points
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.award_points_on_booking_completed();

-- ────────────────────────────────────────────────────────────────────────
-- 3. Award: review left (+20)
-- ────────────────────────────────────────────────────────────────────────
-- reviews.booking_id carries a UNIQUE constraint (reviews_booking_id_key), so
-- a second review for the same booking is rejected at the DB level before
-- this trigger could ever fire twice for one booking. setBookingTip() only
-- UPDATEs an existing review row (never inserts), so tipping can't re-fire it.

CREATE OR REPLACE FUNCTION public.award_points_on_review_left()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.client_points_ledger (client_id, delta, reason, review_id, booking_id)
  VALUES (NEW.user_id, 20, 'review_left', NEW.id, NEW.booking_id)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS on_review_award_points ON public.reviews;
CREATE TRIGGER on_review_award_points
  AFTER INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.award_points_on_review_left();

-- ────────────────────────────────────────────────────────────────────────
-- 4. Award: birthday bonus (+50), standalone daily cron
-- ────────────────────────────────────────────────────────────────────────
-- Deliberately a NEW function, not an edit to the existing
-- process_birthday_greetings() — that one is scoped per-provider (only fires
-- for a provider with automation_settings->>'birthdayGreeting' = true AND an
-- existing completed booking with them); birthday points are an account-wide
-- perk with different eligibility, and editing a live function carries its
-- own risk (this repo's migration-ownership notes document a case where a
-- faithful reproduction silently dropped SET search_path from a live
-- function). Same date-match idiom and same dedup-window idiom as that
-- function, so behaviour reads the same way to anyone comparing the two.

CREATE OR REPLACE FUNCTION public.award_birthday_points()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.client_points_ledger (client_id, delta, reason)
  SELECT u.id, 50, 'birthday_bonus'
  FROM public.users u
  WHERE u.dob IS NOT NULL
    AND TO_CHAR(u.dob::DATE, 'MM-DD') = TO_CHAR(CURRENT_DATE, 'MM-DD')
    AND NOT EXISTS (
      SELECT 1 FROM public.client_points_ledger l
      WHERE l.client_id = u.id
        AND l.reason = 'birthday_bonus'
        AND l.created_at > NOW() - INTERVAL '300 days'
    );
END;
$$;

SELECT cron.schedule(
  'award-birthday-points',
  '0 6 * * *',
  $$SELECT public.award_birthday_points();$$
);

-- ────────────────────────────────────────────────────────────────────────
-- 5. Read RPCs — client derived from auth.uid(), never a trusted parameter
-- ────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_client_points_balance()
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(SUM(delta), 0)::INT
  FROM public.client_points_ledger
  WHERE client_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_client_points_balance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_points_balance() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_client_points_history(p_limit INT DEFAULT 50)
RETURNS TABLE (id UUID, delta INT, reason TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT l.id, l.delta, l.reason, l.created_at
  FROM public.client_points_ledger l
  WHERE l.client_id = auth.uid()
  ORDER BY l.created_at DESC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.get_client_points_history(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_points_history(INT) TO authenticated;
