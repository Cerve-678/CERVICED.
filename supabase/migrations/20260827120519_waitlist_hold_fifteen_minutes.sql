-- A waitlist hold lasts 15 minutes, and an expired one stops blocking the slot.
--
-- The hold window was 3 hours (waitlist_holds.sql, 2026-08-02). Shortened to
-- 15 minutes so a freed slot moves through the queue in an evening rather than
-- most of a working day.
--
-- Three things have to change together or the number is fiction:
--
--   1. THE WINDOW itself, and the copy that quotes it. The notification says
--      "held for you for 3 hours" in words -- a number in prose that nothing
--      derives from hold_expires_at, so it silently becomes a lie the moment
--      the interval changes.
--
--   2. THE SWEEP. expire_waitlist_holds() runs every 15 minutes, which was
--      fine against a 3-hour hold (8% slack) and absurd against a 15-minute
--      one: a hold could live 30 minutes, double its stated life, and the
--      cascade to the next person would be late by as much as the offer
--      lasted. Every minute now.
--
--   3. THE READERS. get_provider_busy_spans() treats any on_hold row as busy
--      regardless of hold_expires_at, so between lapse and sweep the slot
--      stays invisible to everyone. At 3 hours plus a 15-minute sweep that
--      was a rounding error. At 15 minutes it is the difference between a
--      cascade that works and one that hands the next person a slot the
--      picker still shows as taken. Fixed at READ time rather than by leaning
--      harder on the cron: a sweep can always be late, and correctness should
--      not depend on how recently a job ran.
--
-- Deliberately NOT changed: a lapsed hold still sets provider_waitlist.status
-- = 'expired', which removes that client from the queue permanently, since the
-- candidate query matches status = 'waiting' only. That is the decided
-- behaviour. It is worth knowing it bites harder here than it did before --
-- at 15 minutes a client is removed for being asleep, at work, or driving,
-- and a single freed slot can clear several people out of the queue in about
-- an hour while still going unclaimed.
--
-- Safe to re-run.

-- ── 1. The window and the copy that quotes it ───────────────────────────────

CREATE OR REPLACE FUNCTION public.waitlist_hold_duration()
RETURNS INTERVAL
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$ SELECT INTERVAL '15 minutes' $$;

COMMENT ON FUNCTION public.waitlist_hold_duration() IS
  'Single source for how long a waitlist hold lasts. The notification copy '
  'derives its wording from this, so the stated window and the enforced one '
  'cannot drift apart.';

REVOKE ALL ON FUNCTION public.waitlist_hold_duration() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.waitlist_hold_duration() TO authenticated;

-- ── 2. invite_next_waitlist_entry(): 15-minute hold, wording derived ────────
--
-- Body is unchanged from 20260817103049 except the interval and the sentence
-- quoting it. The copy now builds its own number from waitlist_hold_duration()
-- so the two cannot disagree; the previous hard-coded "3 hours" is exactly the
-- kind of prose that silently outlives the value it describes.

CREATE OR REPLACE FUNCTION public.invite_next_waitlist_entry(
  p_provider_id UUID,
  p_service_id  UUID,
  p_booking_date DATE DEFAULT NULL,
  p_booking_time TIME DEFAULT NULL,
  p_end_time TIME DEFAULT NULL,
  p_base_price NUMERIC DEFAULT NULL,
  p_add_ons_total NUMERIC DEFAULT NULL,
  p_service_charge NUMERIC DEFAULT NULL,
  p_service_category_snapshot TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  w                   RECORD;
  v_waitlist_enabled  BOOLEAN;
  v_auto_accept       BOOLEAN;
  v_new_booking_id    UUID;
  v_hold              INTERVAL := public.waitlist_hold_duration();
  v_hold_words        TEXT;
BEGIN
  v_hold_words := (EXTRACT(EPOCH FROM v_hold) / 60)::INT || ' minutes';

  SELECT COALESCE((automation_settings->>'waitlistEnabled')::boolean, TRUE),
         COALESCE((automation_settings->>'autoAcceptWaitlist')::boolean, FALSE)
    INTO v_waitlist_enabled, v_auto_accept
    FROM public.providers WHERE id = p_provider_id;

  IF NOT COALESCE(v_waitlist_enabled, TRUE) THEN
    RETURN FALSE;
  END IF;
  IF p_booking_date IS NULL OR p_booking_time IS NULL THEN
    RETURN FALSE;
  END IF;

  FOR w IN
    SELECT *
      FROM public.provider_waitlist
     WHERE provider_id = p_provider_id
       AND status = 'waiting'
       AND (service_id = p_service_id OR service_id IS NULL)
       AND (
         preferred_dates IS NULL
         OR (p_booking_date >= preferred_dates[1]
             AND p_booking_date <= COALESCE(preferred_dates[2], 'infinity'::date))
       )
     ORDER BY (service_id IS NOT NULL AND service_id = p_service_id) DESC,
              position ASC
  LOOP
    BEGIN
      IF v_auto_accept THEN
        INSERT INTO public.bookings (
          user_id, provider_id, service_id, status,
          booking_date, booking_time, end_time,
          payment_type, base_price, add_ons_total, service_charge,
          deposit_amount, amount_paid, remaining_balance, payment_status,
          is_group_booking, group_booking_count,
          provider_name_snapshot, service_name_snapshot, service_category_snapshot,
          customer_name, waitlist_entry_id
        ) VALUES (
          w.user_id, p_provider_id, p_service_id, 'pending',
          p_booking_date, p_booking_time, p_end_time,
          'full', COALESCE(p_base_price, 0), COALESCE(p_add_ons_total, 0), COALESCE(p_service_charge, 0),
          0, 0, COALESCE(p_base_price, 0) + COALESCE(p_add_ons_total, 0) + COALESCE(p_service_charge, 0), 'pending',
          FALSE, 1,
          w.provider_name_snapshot, w.service_name_snapshot, p_service_category_snapshot,
          w.user_name_snapshot, w.id
        )
        RETURNING id INTO v_new_booking_id;

        UPDATE public.provider_waitlist SET status = 'booked', notified_at = NOW() WHERE id = w.id;
        RETURN TRUE;
      ELSE
        INSERT INTO public.bookings (
          user_id, provider_id, service_id, status,
          booking_date, booking_time, end_time,
          payment_type, base_price, add_ons_total, service_charge,
          deposit_amount, amount_paid, remaining_balance, payment_status,
          is_group_booking, group_booking_count,
          provider_name_snapshot, service_name_snapshot, service_category_snapshot,
          customer_name, waitlist_entry_id, hold_expires_at
        ) VALUES (
          w.user_id, p_provider_id, p_service_id, 'on_hold',
          p_booking_date, p_booking_time, p_end_time,
          'full', COALESCE(p_base_price, 0), COALESCE(p_add_ons_total, 0), COALESCE(p_service_charge, 0),
          0, 0, COALESCE(p_base_price, 0) + COALESCE(p_add_ons_total, 0) + COALESCE(p_service_charge, 0), 'pending',
          FALSE, 1,
          w.provider_name_snapshot, w.service_name_snapshot, p_service_category_snapshot,
          w.user_name_snapshot, w.id, NOW() + v_hold
        )
        RETURNING id INTO v_new_booking_id;

        UPDATE public.provider_waitlist SET status = 'notified', notified_at = NOW() WHERE id = w.id;

        INSERT INTO public.notifications
          (user_id, type, title, message, priority, is_actionable, provider_id, recipient_role, booking_id)
        VALUES (
          w.user_id,
          'waitlist_slot_available',
          'A slot opened up!',
          w.service_name_snapshot || ' with ' || w.provider_name_snapshot ||
            ' — ' || TO_CHAR(p_booking_date, 'DD Mon') || ' at ' || TO_CHAR(p_booking_time, 'HH12:MI AM') ||
            ' is held for you for ' || v_hold_words ||
            '. Confirm now before it goes to the next person.',
          'high',
          TRUE,
          p_provider_id,
          'client',
          v_new_booking_id
        );
        RETURN TRUE;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
  END LOOP;
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.invite_next_waitlist_entry(UUID, UUID, DATE, TIME, TIME, NUMERIC, NUMERIC, NUMERIC, TEXT)
  FROM PUBLIC, anon, authenticated;

-- ── 3. Sweep every minute ───────────────────────────────────────────────────

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'expire-waitlist-holds';
SELECT cron.schedule('expire-waitlist-holds', '* * * * *', $cron$SELECT public.expire_waitlist_holds();$cron$);

-- ── 4. An expired hold stops blocking at READ time ──────────────────────────
--
-- Body unchanged from 20260806171711 except the added hold_expires_at test.
--
-- NULL hold_expires_at still blocks, deliberately. Reschedule holds
-- (20260827120337) carry no clock of their own -- they end when the reschedule
-- request they belong to ends -- so a NULL here means "no deadline", not
-- "expired". Reading it the other way would make every reschedule hold
-- invisible and undo that feature entirely.

CREATE OR REPLACE FUNCTION public.get_provider_busy_spans(
  p_provider_id UUID,
  p_from_date   DATE,
  p_to_date     DATE
)
RETURNS TABLE (
  booking_date DATE,
  busy_start   TIME,
  busy_end     TIME
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT
    b.booking_date,
    GREATEST(
      COALESCE(b.effective_start, b.booking_date + b.booking_time),
      b.booking_date::timestamp
    )::time AS busy_start,
    LEAST(
      COALESCE(
        b.effective_end,
        b.booking_date + COALESCE(b.end_time, b.booking_time + INTERVAL '1 hour')
      ),
      b.booking_date::timestamp + INTERVAL '1 day' - INTERVAL '1 second'
    )::time AS busy_end
  FROM public.bookings b
  WHERE b.provider_id = p_provider_id
    AND b.booking_date BETWEEN p_from_date AND p_to_date
    AND b.status IN ('pending', 'confirmed', 'in_progress', 'on_hold')
    -- A lapsed hold is not a busy slot. Between expiry and the next sweep the
    -- row still says on_hold, and without this the slot stays invisible to
    -- the very person the cascade just offered it to.
    AND (b.status <> 'on_hold' OR b.hold_expires_at IS NULL OR b.hold_expires_at > NOW())
    AND EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = b.provider_id
        AND (
          (p.has_gone_live = TRUE AND p.is_active = TRUE)
          OR p.user_id = auth.uid()
        )
    )
  ORDER BY b.booking_date, b.effective_start, b.booking_time;
$$;

REVOKE ALL ON FUNCTION public.get_provider_busy_spans(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_provider_busy_spans(UUID, DATE, DATE) TO authenticated, anon;
