-- A time you asked to move to is held while you wait for an answer.
--
-- Until now a reschedule reserved nothing at any stage. The request lived
-- entirely in booking_reschedule_requests (requested_dates / requested_times,
-- or provider_available_slots when the provider offered times back), and the
-- bookings row was untouched. Every availability read goes through
-- get_provider_busy_spans, which only ever looks at `bookings` -- so a slot a
-- client had asked for, or a slot a provider had explicitly offered, stayed
-- fully open to everyone else, including the public slot picker.
--
-- The race was only ever caught at the very last step, by bookings_no_overlap
-- rejecting confirm_reschedule_own_booking()'s UPDATE with a raw 23P01.
-- RescheduleScreen compensates with a live re-check before confirming and maps
-- 23P01 to "Time No Longer Available", so nobody saw a Postgres error -- but a
-- client could still lose a time a provider had personally offered them,
-- which is the part that reads as broken rather than unlucky.
--
-- HOLDS AT BOTH STAGES, as decided:
--
--   stage 1  client requests a specific time  -> hold that one slot
--   stage 2  provider offers alternatives     -> release stage 1, hold each
--                                                offered slot
--   confirm  client picks one                 -> release ALL holds, then move
--                                                the real booking onto it
--
-- A hold is an `on_hold` bookings row, the same mechanism waitlist_holds.sql
-- and hold_cart_booking_slots() already use. Reusing the table means the hold
-- is respected by bookings_no_overlap, enforce_booking_bookability() and
-- get_provider_busy_spans for free, with no new code teaching any of them
-- about reschedules. It also means these rows inherit the on_hold guards in
-- 20260827120122 and never generate intake forms or "To Do" notifications.
--
-- HOLDS EXPIRE WITH THE REQUEST, not on a clock of their own. The answer
-- deadline built in 20260826090555 / 094404 already decides how long either
-- side has; a second, independent timer could only ever disagree with it.
-- process_expire_stale_reschedule_requests() releases the holds as it expires
-- the request.
--
-- THE SAME-DAY NUDGE. bookings_no_overlap compares a provider's rows against
-- each other and cannot exempt a pair, so a hold placed at a time overlapping
-- the booking it belongs to would collide with that very booking -- turning an
-- ordinary 2:00pm -> 2:30pm nudge into "that time is taken", by its own
-- appointment. Such a slot needs no hold: it is already exclusively that
-- client's, held by the booking itself. place_reschedule_hold() skips it and
-- reports success.
--
-- Safe to re-run.

-- ── 1. Mark a hold as belonging to a reschedule ─────────────────────────────
--
-- ON DELETE CASCADE so a hold can never outlive the booking it is a
-- placeholder for. Nothing deletes bookings today (RLS has no DELETE policy
-- and the app uses status changes), but a hold row surviving its own booking
-- would silently block a provider's slot with nothing left to explain why.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS reschedule_hold_for UUID
    REFERENCES public.bookings(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS bookings_reschedule_hold_for_idx
  ON public.bookings (reschedule_hold_for)
  WHERE reschedule_hold_for IS NOT NULL;

COMMENT ON COLUMN public.bookings.reschedule_hold_for IS
  'Set only on on_hold rows that reserve a candidate slot for a pending '
  'reschedule of the referenced booking. Never set on a real appointment.';

-- ── 2. Release ──────────────────────────────────────────────────────────────
--
-- DELETE rather than status = 'cancelled', which is what the waitlist and cart
-- hold paths do. Those holds represent a real offer to a real person and are
-- worth keeping a trace of. A reschedule hold is pure scaffolding: it has no
-- price, no client agreement and no history worth reading later, and leaving
-- cancelled rows behind would put a phantom entry in the provider's own
-- cancelled list for every alternative time they ever offered.

CREATE OR REPLACE FUNCTION public.release_reschedule_holds(p_booking_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM public.bookings
   WHERE reschedule_hold_for = p_booking_id
     AND status = 'on_hold';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.release_reschedule_holds(UUID) FROM PUBLIC, anon, authenticated;

-- ── 3. Place one ────────────────────────────────────────────────────────────
--
-- Column values are copied from the booking being rescheduled rather than
-- rebuilt, so the hold satisfies every NOT NULL the table has without this
-- function needing to know what they are. Money columns are zeroed: a hold is
-- not a sale, and a stray non-zero price here would reach any future report
-- that sums the column.

CREATE OR REPLACE FUNCTION public.place_reschedule_hold(
  p_booking_id UUID,
  p_date       DATE,
  p_time       TIME,
  p_end_time   TIME
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_b       RECORD;
  v_new_id  UUID;
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  -- Already yours -- see THE SAME-DAY NUDGE above.
  IF tsrange(p_date + p_time, p_date + COALESCE(p_end_time, p_time + INTERVAL '1 hour'))
     && tsrange(
          COALESCE(v_b.effective_start, v_b.booking_date + v_b.booking_time),
          COALESCE(v_b.effective_end,
                   v_b.booking_date + COALESCE(v_b.end_time, v_b.booking_time + INTERVAL '1 hour'))
        )
  THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.bookings (
    user_id, provider_id, service_id, status,
    booking_date, booking_time, end_time,
    payment_type, base_price, add_ons_total, service_charge,
    deposit_amount, amount_paid, remaining_balance, payment_status,
    is_group_booking, group_booking_count,
    provider_name_snapshot, service_name_snapshot, service_category_snapshot,
    customer_name, reschedule_hold_for
  ) VALUES (
    v_b.user_id, v_b.provider_id, v_b.service_id, 'on_hold',
    p_date, p_time, p_end_time,
    'full', 0, 0, 0,
    0, 0, 0, 'pending',
    FALSE, 1,
    v_b.provider_name_snapshot, v_b.service_name_snapshot, v_b.service_category_snapshot,
    v_b.customer_name, p_booking_id
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.place_reschedule_hold(UUID, DATE, TIME, TIME) FROM PUBLIC, anon, authenticated;

-- ── 4. Stage 1: the client's requested time ─────────────────────────────────
--
-- Body is unchanged from 20260808181219 except for the hold at the end. A
-- preferred entry with no time component cannot be held -- there is no slot to
-- reserve, only a date -- so those are skipped and the request still stands.
--
-- A failure here is deliberately NOT swallowed. If the slot went while the
-- client was filling the form, the honest outcome is to say so now, while they
-- are still looking at a picker, rather than to file a request against a time
-- that is already gone and let them discover it after the provider has
-- accepted it.

CREATE OR REPLACE FUNCTION public.request_reschedule_own_booking(
  p_booking_id UUID,
  p_preferred_dates TEXT[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking RECORD;
  v_policies JSONB;
  v_max_raw TEXT;
  v_max INT;
  v_notice_raw TEXT;
  v_notice_hrs INT;
  v_hours_until NUMERIC;
  v_hours_since_last NUMERIC;
  v_active_request BOOLEAN;
  v_dates DATE[] := ARRAY[]::DATE[];
  v_times TEXT[] := ARRAY[]::TEXT[];
  v_raw TEXT;
  v_duration INTERVAL;
  v_i INT;
BEGIN
  SELECT b.status, b.booking_date, b.booking_time, b.end_time, b.provider_id,
         b.reschedule_count, b.last_rescheduled_at
    INTO v_booking
    FROM public.bookings b
   WHERE b.id = p_booking_id
     AND b.user_id = auth.uid()
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_booking.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Only confirmed bookings can be rescheduled';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.booking_reschedule_requests
     WHERE booking_id = p_booking_id AND status IN ('pending', 'provider_responded')
  ) INTO v_active_request;

  IF v_active_request THEN
    RAISE EXCEPTION 'A reschedule request is already in progress for this booking';
  END IF;

  IF v_booking.last_rescheduled_at IS NOT NULL THEN
    v_hours_since_last := EXTRACT(EPOCH FROM (NOW() - v_booking.last_rescheduled_at)) / 3600;
    IF v_hours_since_last < 24 THEN
      RAISE EXCEPTION 'You can reschedule again in % hours', CEIL(24 - v_hours_since_last);
    END IF;
  END IF;

  SELECT booking_policies INTO v_policies
    FROM public.providers WHERE id = v_booking.provider_id;

  v_max_raw := v_policies->>'maxReschedules';
  IF v_max_raw IS DISTINCT FROM 'unlimited' THEN
    v_max := COALESCE(NULLIF(v_max_raw, '')::INT, 1);
    IF v_booking.reschedule_count >= v_max THEN
      RAISE EXCEPTION 'This provider allows a maximum of % reschedule(s) per booking', v_max;
    END IF;
  END IF;

  v_notice_raw := v_policies->>'rescheduleNotice';
  v_notice_hrs := CASE v_notice_raw
    WHEN 'same_day' THEN 0
    WHEN '48h' THEN 48
    WHEN '72h' THEN 72
    ELSE 24
  END;

  IF v_notice_hrs > 0 THEN
    v_hours_until := EXTRACT(EPOCH FROM (
      (v_booking.booking_date + v_booking.booking_time)::timestamp - NOW()
    )) / 3600;
    IF v_hours_until < v_notice_hrs THEN
      RAISE EXCEPTION 'This provider requires % hours notice to reschedule', v_notice_hrs;
    END IF;
  END IF;

  FOREACH v_raw IN ARRAY p_preferred_dates LOOP
    v_dates := v_dates || (split_part(v_raw, ' ', 1))::DATE;
    v_times := v_times || NULLIF(split_part(v_raw, ' ', 2), '');
  END LOOP;

  INSERT INTO public.booking_reschedule_requests
    (booking_id, requested_by, original_date, original_time, requested_dates,
     requested_times, provider_available_slots, status, reschedule_count, updated_at)
  VALUES
    (p_booking_id, 'user', v_booking.booking_date, v_booking.booking_time,
     v_dates, v_times, NULL, 'pending', 0, NOW())
  ON CONFLICT (booking_id) DO UPDATE
    SET requested_by = 'user',
        requested_dates = v_dates,
        requested_times = v_times,
        provider_available_slots = NULL,
        status = 'pending',
        updated_at = NOW();

  -- Any hold left by a previous, already-closed request on this booking.
  PERFORM public.release_reschedule_holds(p_booking_id);

  v_duration := COALESCE(v_booking.end_time, v_booking.booking_time + INTERVAL '1 hour')
                - v_booking.booking_time;

  FOR v_i IN 1 .. COALESCE(array_length(v_dates, 1), 0) LOOP
    IF v_times[v_i] IS NOT NULL THEN
      BEGIN
        PERFORM public.place_reschedule_hold(
          p_booking_id,
          v_dates[v_i],
          v_times[v_i]::TIME,
          (v_times[v_i]::TIME + v_duration)::TIME
        );
      EXCEPTION WHEN exclusion_violation OR check_violation THEN
        -- Wording matched EXACTLY to the string RescheduleScreen already
        -- passes through to the client verbatim. Anything else lands in that
        -- screen's generic fallback ("please try again") -- advice that can
        -- never work for a slot somebody else now owns.
        RAISE EXCEPTION 'That time has just been taken. Please pick another slot.'
          USING ERRCODE = 'P0001';
      END;
    END IF;
  END LOOP;
END;
$$;

-- ── 5. Stage 2: the slots a provider offers ─────────────────────────────────
--
-- provider_available_slots is [{ "date": "YYYY-MM-DD", "times": ["HH:MM", …] }],
-- the shape ProviderBookingDetailScreen builds. Every time in it becomes a
-- hold, because the client can pick any of them and each must still be there
-- when they do -- an offer the provider cannot honour is worse than no offer.
--
-- The list is uncapped by the UI, so a provider offering four times across
-- three dates freezes twelve of their own slots until the client answers or
-- the request expires. That is their own diary and their own choice, so it is
-- not capped here either; the respond screen states it plainly instead.
--
-- A slot that cannot be held names itself in the error. The provider is
-- looking at their own calendar and can drop that one time and re-send, which
-- they cannot do if all they are told is that something failed.

CREATE OR REPLACE FUNCTION public.place_reschedule_holds_from_slots(
  p_booking_id UUID,
  p_slots      JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_b        RECORD;
  v_duration INTERVAL;
  v_slot     JSONB;
  v_time     TEXT;
  v_date     DATE;
  v_count    INTEGER := 0;
BEGIN
  SELECT booking_time, end_time INTO v_b
    FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  v_duration := COALESCE(v_b.end_time, v_b.booking_time + INTERVAL '1 hour') - v_b.booking_time;

  IF p_slots IS NULL OR jsonb_typeof(p_slots) <> 'array' THEN
    RETURN 0;
  END IF;

  FOR v_slot IN SELECT * FROM jsonb_array_elements(p_slots) LOOP
    BEGIN
      v_date := (v_slot->>'date')::DATE;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;

    FOR v_time IN SELECT jsonb_array_elements_text(COALESCE(v_slot->'times', '[]'::jsonb)) LOOP
      BEGIN
        IF public.place_reschedule_hold(
             p_booking_id, v_date, v_time::TIME, (v_time::TIME + v_duration)::TIME
           ) IS NOT NULL
        THEN
          v_count := v_count + 1;
        END IF;
      EXCEPTION WHEN exclusion_violation OR check_violation THEN
        RAISE EXCEPTION '% at % is no longer free. Remove it and send the rest.',
          to_char(v_date, 'DD Mon'), to_char(v_time::TIME, 'HH12:MI AM')
          USING ERRCODE = 'P0001';
      END;
    END LOOP;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.place_reschedule_holds_from_slots(UUID, JSONB) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.respond_to_reschedule_request(
  p_booking_id UUID,
  p_available_slots JSONB,
  p_response_note TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_found BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.booking_reschedule_requests r
    JOIN public.bookings b ON b.id = r.booking_id
    JOIN public.providers p ON p.id = b.provider_id
    WHERE r.booking_id = p_booking_id
      AND p.user_id = auth.uid()
      AND r.status = 'pending'
    FOR UPDATE OF r
  ) INTO v_found;

  IF NOT v_found THEN
    RAISE EXCEPTION 'No pending reschedule request found for this booking';
  END IF;

  UPDATE public.booking_reschedule_requests
     SET provider_available_slots = p_available_slots,
         status = 'provider_responded',
         response_note = p_response_note,
         updated_at = NOW()
   WHERE booking_id = p_booking_id;

  -- The client's own requested time is no longer a candidate: the provider has
  -- just answered with alternatives instead. Released BEFORE the new holds go
  -- down, so a provider re-offering the very time the client asked for is not
  -- blocked by that client's own stage 1 hold.
  PERFORM public.release_reschedule_holds(p_booking_id);
  PERFORM public.place_reschedule_holds_from_slots(p_booking_id, p_available_slots);
END;
$$;

CREATE OR REPLACE FUNCTION public.provider_initiate_reschedule(
  p_booking_id UUID,
  p_proposed_slots JSONB
) RETURNS VOID AS $$
DECLARE
  v_booking RECORD;
BEGIN
  SELECT b.booking_date, b.booking_time, b.status
    INTO v_booking
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
   WHERE b.id = p_booking_id
     AND p.user_id = auth.uid()
   FOR UPDATE OF b;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_booking.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Only confirmed bookings can be rescheduled';
  END IF;

  INSERT INTO public.booking_reschedule_requests
    (booking_id, requested_by, original_date, original_time, requested_dates,
     provider_available_slots, status, reschedule_count, updated_at)
  VALUES
    (p_booking_id, 'provider', v_booking.booking_date, v_booking.booking_time,
     ARRAY[]::DATE[], p_proposed_slots, 'provider_responded', 0, NOW())
  ON CONFLICT (booking_id) DO UPDATE
    SET requested_by = 'provider',
        original_date = v_booking.booking_date,
        original_time = v_booking.booking_time,
        requested_dates = ARRAY[]::DATE[],
        provider_available_slots = p_proposed_slots,
        status = 'provider_responded',
        updated_at = NOW();

  PERFORM public.release_reschedule_holds(p_booking_id);
  PERFORM public.place_reschedule_holds_from_slots(p_booking_id, p_proposed_slots);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── 6. Releasing, everywhere a request stops being open ─────────────────────
--
-- A trigger rather than an edit to each of reject_reschedule_request(),
-- decline_reschedule_offer(), process_expire_stale_reschedule_requests() and
-- close_reschedule_requests_on_terminal_booking(). Those four are the paths
-- that exist today; the point of putting it here is the fifth nobody has
-- written yet. A hold that outlives its request silently blocks a provider's
-- slot forever, with nothing in the UI to explain it and no way for either
-- party to clear it -- the single worst failure this feature can have, and
-- exactly the one a future path would reintroduce by forgetting a line.

CREATE OR REPLACE FUNCTION public.release_reschedule_holds_on_close()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('rejected', 'expired', 'cancelled', 'confirmed')
  THEN
    PERFORM public.release_reschedule_holds(NEW.booking_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_reschedule_request_closed_release_holds
  ON public.booking_reschedule_requests;
CREATE TRIGGER on_reschedule_request_closed_release_holds
  AFTER UPDATE OF status ON public.booking_reschedule_requests
  FOR EACH ROW EXECUTE FUNCTION public.release_reschedule_holds_on_close();

REVOKE ALL ON FUNCTION public.release_reschedule_holds_on_close()
  FROM PUBLIC, anon, authenticated;

-- ── 7. Confirming: release first, then move ─────────────────────────────────
--
-- The trigger above cannot serve this path. confirm_reschedule_own_booking()
-- updates `bookings` BEFORE it updates the request row, so by the time the
-- trigger fired the UPDATE would already have been rejected -- the booking
-- would be moving onto a slot occupied by its own hold, and
-- bookings_no_overlap does not know the two rows are related. It reads as the
-- cruellest possible bug: confirming the time you were offered fails because
-- that time is taken, by you.

CREATE OR REPLACE FUNCTION public.confirm_reschedule_own_booking(
  p_booking_id UUID,
  p_new_date DATE,
  p_new_time TIME,
  p_new_end_time TIME
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_has_active_request BOOLEAN;
BEGIN
  SELECT b.status INTO v_status
    FROM public.bookings b
   WHERE b.id = p_booking_id
     AND b.user_id = auth.uid()
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_status <> 'confirmed' THEN
    RAISE EXCEPTION 'This booking can no longer be rescheduled';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.booking_reschedule_requests
     WHERE booking_id = p_booking_id AND status = 'provider_responded'
  ) INTO v_has_active_request;

  IF NOT v_has_active_request THEN
    RAISE EXCEPTION 'No provider-approved reschedule request found for this booking';
  END IF;

  -- Before the UPDATE, never after. See above.
  PERFORM public.release_reschedule_holds(p_booking_id);

  UPDATE public.bookings
     SET booking_date = p_new_date,
         booking_time = p_new_time,
         end_time = p_new_end_time,
         reschedule_count = reschedule_count + 1,
         last_rescheduled_at = NOW()
   WHERE id = p_booking_id;

  UPDATE public.booking_reschedule_requests
     SET status = 'confirmed', updated_at = NOW()
   WHERE booking_id = p_booking_id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_reschedule_own_booking(uuid, date, time, time) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.confirm_reschedule_own_booking(uuid, date, time, time) FROM anon;
GRANT EXECUTE ON FUNCTION public.confirm_reschedule_own_booking(uuid, date, time, time) TO authenticated;

-- ── 8. A hold is not the client's booking ───────────────────────────────────
--
-- client_bookings already excludes on_hold, so these never reach the client's
-- list. The provider's own screens read the base table with .neq('status',
-- 'on_hold') in databaseService.ts. Both were written for the waitlist and
-- cart holds and cover these unchanged -- recorded here because it is the
-- assumption that makes reusing `bookings` safe, and the one a future reader
-- would otherwise have to rediscover.
