-- ════════════════════════════════════════════════════════════════════════════
-- booking_rules_server_enforcement.sql
--
-- PROBLEM
-- ───────
-- bookings_user_update / bookings_provider_update (phase1_schema.sql:745,755)
-- and reschedule_user_all / reschedule_provider_all are unconditional
-- `FOR UPDATE USING (...)` / `FOR ALL USING (...)` policies with no
-- WITH CHECK. Cancellation notice (providers.cancellation_notice_hours) and
-- reschedule limits (providers.booking_policies: maxReschedules,
-- rescheduleNotice) are enforced only in React (BookingContext.tsx,
-- BookingDetailScreen.tsx, BookingsScreen.tsx) — anyone calling the Supabase
-- API directly with their own JWT bypasses all of it. Reschedule count/
-- cooldown also only ever lived in the client's AsyncStorage cache, so the
-- server had no memory of it at all.
--
-- APPROACH
-- ────────
-- Don't lock down the general UPDATE policies — bookings has other
-- legitimate direct-update paths (status cycling through in_progress/
-- completed/no_show, notes, address release, etc.) that aren't audited here
-- and shouldn't be risked breaking. Instead, give cancel and reschedule their
-- own SECURITY DEFINER RPCs that check the business rules server-side before
-- writing, same pattern as dev_reset_provider() / delete_own_notification().
-- The app is updated to call these instead of writing bookings directly for
-- these two operations.
--
-- Run on a branch first if you can. Safe to re-run (CREATE OR REPLACE /
-- IF NOT EXISTS throughout).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Track reschedule count/cooldown server-side ───────────────────────────
-- Previously only existed in the client's AsyncStorage cache.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS reschedule_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_rescheduled_at TIMESTAMPTZ;

-- ── 2. Client cancels their own booking ───────────────────────────────────────
-- Notice-hours precedence mirrors mapCancellationPolicyRow() app-side
-- (databaseService.ts): prefer providers.cancellation_notice_hours; if unset
-- (0), fall back to parsing booking_policies.cancelNotice ('none'|'24h'|
-- '48h'|'72h'). Without this fallback, a provider who only ever set their
-- policy via registration (never touched the Automations screen) would have
-- cancellation_notice_hours = 0 here, so this RPC let clients cancel with
-- zero notice even though the client-facing profile showed a real notice
-- window — client display and server enforcement must agree.
CREATE OR REPLACE FUNCTION public.cancel_own_booking(p_booking_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking   RECORD;
  v_notice_hrs INT;
  v_hours_until NUMERIC;
  v_cancel_notice TEXT;
BEGIN
  SELECT b.status, b.booking_date, b.booking_time, b.provider_id
    INTO v_booking
    FROM public.bookings b
   WHERE b.id = p_booking_id
     AND b.user_id = auth.uid()
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_booking.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'This booking can no longer be cancelled';
  END IF;

  SELECT cancellation_notice_hours, booking_policies ->> 'cancelNotice'
    INTO v_notice_hrs, v_cancel_notice
    FROM public.providers WHERE id = v_booking.provider_id;

  IF COALESCE(v_notice_hrs, 0) = 0 THEN
    v_notice_hrs := CASE v_cancel_notice
      WHEN '24h' THEN 24
      WHEN '48h' THEN 48
      WHEN '72h' THEN 72
      ELSE 0
    END;
  END IF;

  IF COALESCE(v_notice_hrs, 0) > 0 THEN
    v_hours_until := EXTRACT(EPOCH FROM (
      (v_booking.booking_date + v_booking.booking_time)::timestamp - NOW()
    )) / 3600;

    IF v_hours_until < v_notice_hrs THEN
      RAISE EXCEPTION 'This provider requires % hours notice to cancel', v_notice_hrs;
    END IF;
  END IF;

  UPDATE public.bookings SET status = 'cancelled' WHERE id = p_booking_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_own_booking(UUID) TO authenticated;

-- ── 3. Provider cancels a booking on their calendar ───────────────────────────
-- No notice-hours check — mirrors current app behaviour (providers can
-- cancel any time; the notice period only protects them from clients).
CREATE OR REPLACE FUNCTION public.provider_cancel_own_booking(p_booking_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT b.status INTO v_status
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
   WHERE b.id = p_booking_id
     AND p.user_id = auth.uid()
   FOR UPDATE OF b;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_status IN ('cancelled', 'completed', 'no_show') THEN
    RAISE EXCEPTION 'This booking can no longer be cancelled';
  END IF;

  UPDATE public.bookings SET status = 'cancelled' WHERE id = p_booking_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.provider_cancel_own_booking(UUID) TO authenticated;

-- ── 4. Client requests a reschedule (Step 1) ──────────────────────────────────
-- Enforces the 24h anti-spam cooldown since the last confirmed reschedule,
-- the provider's maxReschedules cap, and the provider's notice-before-
-- appointment window — all previously client-side only. Replaces the app's
-- direct upsertRescheduleRequest() call for this path.
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

  INSERT INTO public.booking_reschedule_requests
    (booking_id, requested_by, original_date, original_time, requested_dates,
     provider_available_slots, status, reschedule_count, updated_at)
  VALUES
    (p_booking_id, 'user', v_booking.booking_date, v_booking.booking_time,
     p_preferred_dates, NULL, 'pending', 0, NOW())
  ON CONFLICT (booking_id) DO UPDATE
    SET requested_by = 'user',
        requested_dates = p_preferred_dates,
        provider_available_slots = NULL,
        status = 'pending',
        updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_reschedule_own_booking(UUID, TEXT[]) TO authenticated;

-- ── 5. Client confirms a proposed reschedule slot (Step 3) ───────────────────
-- Replaces the app's direct updateBookingDateTime() call. Requires an
-- active, provider-responded request — a client can't invent a reschedule
-- out of nothing. Double-booking is still backstopped by the DB-level
-- unique index (prevent_double_booking.sql) regardless of this check.
CREATE OR REPLACE FUNCTION public.confirm_reschedule_own_booking(
  p_booking_id UUID,
  p_new_date DATE,
  p_new_time TIME,
  p_new_end_time TIME
)
RETURNS VOID
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

GRANT EXECUTE ON FUNCTION public.confirm_reschedule_own_booking(UUID, DATE, TIME, TIME) TO authenticated;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- STILL OPEN (not covered here)
--   • The general bookings_user_update / bookings_provider_update policies
--     remain broad — a client can still directly UPDATE other columns on
--     their own booking row (price, provider_id, etc). Not tightened because
--     other legitimate direct-update paths (provider status cycling, notes,
--     address release) weren't fully catalogued and risk breaking on a
--     narrower WITH CHECK. Worth a follow-up pass once those are mapped.
--   • Provider-initiated reschedule (upsertProviderRescheduleRequest /
--     providerRespondToReschedule) is untouched — providers proposing dates
--     isn't a client-abuse surface the way client-initiated actions are.
-- ════════════════════════════════════════════════════════════════════════════
