-- ════════════════════════════════════════════════════════════════════════════
-- fix_reschedule_requested_dates_type_mismatch.sql
--
-- BUG (reproduced by a client, 2026-08-01)
-- ─────────────────────────────────────────
-- request_reschedule_own_booking(p_booking_id UUID, p_preferred_dates TEXT[])
-- (supabase/booking_rules_server_enforcement.sql) writes p_preferred_dates
-- straight into booking_reschedule_requests.requested_dates, which is
-- DATE[] (phase1_schema.sql:291). Postgres has no implicit/assignment cast
-- from TEXT[] to DATE[], so every call failed with:
--
--   42804: column "requested_dates" is of type date[] but expression is of
--   type text[]. You will need to rewrite or cast the expression.
--
-- Postgres type-checks an INSERT ... VALUES / ON CONFLICT DO UPDATE SET
-- target list against the destination column types during statement
-- analysis, BEFORE the plan executes — so this failed atomically. No row was
-- ever written to booking_reschedule_requests by this bug, for any booking,
-- on either the INSERT or the ON CONFLICT UPDATE branch. There is nothing to
-- clean up in the table for this part of the bug (see the client-side note
-- below for what the user actually saw instead).
--
-- There's a second wrinkle a bare ::date[] cast would not fix: RescheduleScreen
-- .tsx sends one "YYYY-MM-DD HH:MM" string per selection
-- (`[`${selectedDate} ${selectedTime}`]` in handleSubmit) — casting that whole
-- string straight to DATE would silently truncate the time-of-day the client
-- picked. This fix splits each element into its date part (cast to DATE,
-- matching the column) and time part, and keeps the time in a new
-- requested_times column instead of discarding it — needed so the app can
-- show the client what date *and time* they actually requested (previously
-- shown nowhere after submission).
--
-- CLIENT-SIDE BUG (fixed separately, not by this file)
-- ─────────────────────────────────────────────────────
-- The user's second symptom — submitting again immediately got "Waiting for
-- provider to respond with available dates", and a reschedule request
-- appeared to already be filed despite both attempts reporting failure —
-- was NOT this function leaving a partial row (it can't; see above). It was
-- BookingContext.tsx's requestReschedule() writing its optimistic
-- "isPendingReschedule: true" state to AsyncStorage/React state BEFORE
-- calling this RPC, with no rollback when the RPC threw. The local cache
-- said "pending" while the DB had nothing, and the very next attempt hit
-- requestReschedule()'s own local guard (`booking.isPendingReschedule &&
-- !providerAvailableDates` -> throw) before ever reaching Supabase again.
-- Fixed in BookingContext.tsx by calling the RPC first and only persisting
-- the optimistic state on success — the same order confirmReschedule()
-- (Step 3) already uses, per its own comment: "Persist to Supabase BEFORE
-- committing locally". No DB-side cleanup is needed for this either: once
-- the app update ships, the next loadBookings() on an affected device
-- reconciles isPendingReschedule from booking_reschedule_requests via
-- applyRescheduleRequestRow() (src/services/bookingService.ts) and clears
-- the stale local flag automatically (row is absent server-side -> pending
-- flag is reset to false).
--
-- Run on a branch first if you can. Safe to re-run (CREATE OR REPLACE /
-- ADD COLUMN IF NOT EXISTS).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- requested_dates (DATE[]) structurally cannot hold a time-of-day. This new
-- column is index-aligned with it: requested_times[i] is the time requested
-- alongside requested_dates[i] (NULL where no time was supplied).
ALTER TABLE public.booking_reschedule_requests
  ADD COLUMN IF NOT EXISTS requested_times TEXT[];

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
BEGIN
  SELECT b.status, b.booking_date, b.booking_time, b.provider_id,
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
    ELSE 24 -- '24h' or unset — matches the app's historical default
  END;

  IF v_notice_hrs > 0 THEN
    v_hours_until := EXTRACT(EPOCH FROM (
      (v_booking.booking_date + v_booking.booking_time)::timestamp - NOW()
    )) / 3600;
    IF v_hours_until < v_notice_hrs THEN
      RAISE EXCEPTION 'This provider requires % hours notice to reschedule', v_notice_hrs;
    END IF;
  END IF;

  -- p_preferred_dates elements are "YYYY-MM-DD" or "YYYY-MM-DD HH:MM"
  -- (RescheduleScreen.tsx sends the latter). Split each into its date
  -- (cast to DATE — the ::date[] cast the original version of this
  -- function was missing) and time (preserved, not dropped, in
  -- requested_times).
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
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_reschedule_own_booking(UUID, TEXT[]) TO authenticated;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- NOTE ON EXISTING DATA
-- ──────────────────────────────────────────────────────────────────────────
-- No cleanup query is included here because none is needed: the bug analysis
-- above establishes that request_reschedule_own_booking() could not have
-- written a partial/malformed row (Postgres rejects the whole statement at
-- analysis time), so there are no bad requested_dates rows in
-- booking_reschedule_requests to fix up. If you want to double-check your
-- live DB before/after applying this, this is a read-only sanity query:
--
--   SELECT id, booking_id, requested_dates, requested_times, status, created_at
--     FROM public.booking_reschedule_requests
--    ORDER BY created_at DESC
--    LIMIT 20;
-- ════════════════════════════════════════════════════════════════════════════
