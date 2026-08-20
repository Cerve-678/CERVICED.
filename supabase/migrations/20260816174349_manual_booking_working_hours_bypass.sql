-- Squeeze-in fix: allow a provider's own manual booking to go outside their
-- configured working hours, and only that path.
--
-- BUG: enforce_booking_bookability() (originally availability_v2.sql, later
-- touched by waitlist_holds.sql to also treat 'on_hold' as an occupied
-- status for the same-day overlap check) unconditionally rejects any
-- booking_time that doesn't fit inside provider_availability_windows /
-- provider_availability_overrides / the legacy provider_availability table
-- for that day, with no bypass for anything. AddBookingScreen.tsx's
-- "Custom time" picker is explicitly meant to let a provider squeeze a
-- client in outside their normal hours (early morning, late evening, a day
-- they're normally closed) — its own code comment says "a squeeze-in on a
-- fully-booked day is always possible" — but the RPC it calls,
-- provider_create_manual_booking() (20260810171124_booking_authority_and_
-- provider_manual_bookings.sql), has always failed for exactly this case
-- with "This appointment is outside the provider's working hours", because
-- every insert — provider-manual or not — hits the same trigger with no
-- way to signal intent.
--
-- FIX: enforce_booking_bookability() now skips ONLY its working-hours fit
-- check when a transaction-local GUC, cerviced.bypass_working_hours, reads
-- 'on'. Every other check in the function keeps applying unconditionally,
-- bypass or not:
--   - past-date check
--   - booking-window-days check
--   - minimum-notice-hours check
--   - provider_blocked_dates check
--   - the trigger's own same-day overlap ("double-booking") check
-- provider_create_manual_booking() is the ONLY place in the codebase that
-- ever sets this GUC, via `PERFORM set_config('cerviced.bypass_working_
-- hours', 'on', true)` immediately before its INSERT. The third argument
-- (is_local = true) makes it transaction-local: Postgres resets it
-- automatically at COMMIT/ROLLBACK, so it cannot leak to any other
-- statement, connection, or pooled session. No other insert/update path —
-- client checkout (prepare_checkout / finalize_checkout), waitlist holds
-- (invite_next_waitlist_entry), reschedule RPCs, create_booking_atomic, or
-- any raw client write — ever sets it, so all of those remain fully
-- unaffected by construction, not by an added conditional.
--
-- OUT OF SCOPE, DELIBERATELY UNTOUCHED:
--   - bookings_no_overlap, the table-level EXCLUDE constraint (see
--     prevent_overlapping_bookings.sql) — a provider still cannot manually
--     book a slot that's genuinely taken (by another active booking or
--     another on_hold row); they can only go outside working hours into a
--     slot that is otherwise genuinely free. This migration does not
--     ALTER or DROP that constraint.
--   - every other insert/update path into public.bookings keeps enforcing
--     working hours exactly as before.
--
-- A CREATE OR REPLACE FUNCTION on enforce_booking_bookability() resets its
-- ACL to the Postgres default (PUBLIC gets EXECUTE), which would silently
-- undo 20260812114517_revoke_public_booking_bookability_trigger.sql's
-- deliberate lockdown (this function only ever needs to run as a trigger,
-- which Postgres invokes internally regardless of EXECUTE grants — the
-- Supabase security linter flags any SECURITY DEFINER function reachable
-- by anon/authenticated via PostgREST RPC). This migration reapplies that
-- REVOKE in the same file so it isn't a second unrelated deploy this time.
--
-- Verified live 2026-08-16 via Supabase MCP (execute_sql / apply_migration
-- against project ztrfpfvvejzaysrelmfm): pg_proc source for both functions
-- matched the live-then-drifted-checked availability_v2.sql / waitlist_
-- holds.sql definitions before this change (waitlist_holds.sql's 'on_hold'
-- addition to the overlap check IS what's live — availability_v2.sql alone
-- is stale on that point). After applying: insert-then-rollback tests
-- confirmed (1) bypass off still rejects an out-of-hours insert with the
-- original error, (2) bypass on allows an otherwise-identical out-of-hours
-- insert, (3) bypass on still rejects a genuinely overlapping insert with
-- "That time is no longer available", and (4) the REVOKE reapplication
-- doesn't break trigger firing (grants don't gate trigger execution).
--
-- Safe to re-run.

CREATE OR REPLACE FUNCTION public.enforce_booking_bookability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_window_days INTEGER;
  v_notice_hours INTEGER;
  v_has_override BOOLEAN;
  v_fits_window BOOLEAN;
  v_legacy_open TIME;
  v_legacy_close TIME;
  v_legacy_closed BOOLEAN;
  v_bypass_hours BOOLEAN;
BEGIN
  SELECT booking_window_days, min_booking_notice_hrs
    INTO v_window_days, v_notice_hours
    FROM public.providers WHERE id = NEW.provider_id;

  IF NEW.booking_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Booking date cannot be in the past';
  END IF;
  IF COALESCE(v_window_days, 60) > 0
     AND NEW.booking_date > CURRENT_DATE + COALESCE(v_window_days, 60) THEN
    RAISE EXCEPTION 'Booking is outside this provider''s booking window';
  END IF;
  IF COALESCE(v_notice_hours, 0) > 0
     AND (NEW.booking_date + NEW.booking_time) < now() + make_interval(hours => v_notice_hours) THEN
    RAISE EXCEPTION 'This appointment does not meet the provider''s minimum notice';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.provider_blocked_dates
    WHERE provider_id = NEW.provider_id AND blocked_date = NEW.booking_date
  ) THEN RAISE EXCEPTION 'Provider is unavailable on this date'; END IF;

  -- Provider-initiated squeeze-in: skip ONLY the working-hours fit check
  -- below. Set exclusively by provider_create_manual_booking() via
  -- set_config('cerviced.bypass_working_hours', 'on', true) immediately
  -- before its INSERT; transaction-local, cannot leak to any other insert.
  v_bypass_hours := COALESCE(current_setting('cerviced.bypass_working_hours', true), 'off') = 'on';

  IF NOT v_bypass_hours THEN
    SELECT EXISTS (
      SELECT 1 FROM public.provider_availability_overrides
       WHERE provider_id = NEW.provider_id AND availability_date = NEW.booking_date
    ) INTO v_has_override;
    IF v_has_override AND EXISTS (
      SELECT 1 FROM public.provider_availability_overrides
       WHERE provider_id = NEW.provider_id AND availability_date = NEW.booking_date AND is_closed
    ) THEN RAISE EXCEPTION 'Provider is unavailable on this date'; END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.provider_availability_overrides
       WHERE provider_id = NEW.provider_id AND availability_date = NEW.booking_date
         AND is_closed = FALSE AND NEW.booking_time >= start_time AND NEW.end_time <= end_time
    ) INTO v_fits_window;

    IF NOT v_has_override THEN
      SELECT EXISTS (
        SELECT 1 FROM public.provider_availability_windows
         WHERE provider_id = NEW.provider_id
           AND day_of_week = EXTRACT(DOW FROM NEW.booking_date)
           AND NEW.booking_time >= start_time AND NEW.end_time <= end_time
      ) INTO v_fits_window;

      -- Providers not yet migrated retain their original single daily period.
      IF NOT v_fits_window AND NOT EXISTS (
        SELECT 1 FROM public.provider_availability_windows WHERE provider_id = NEW.provider_id
      ) THEN
        SELECT open_time, close_time, is_closed INTO v_legacy_open, v_legacy_close, v_legacy_closed
        FROM public.provider_availability
        WHERE provider_id = NEW.provider_id AND day_of_week = EXTRACT(DOW FROM NEW.booking_date);
        v_fits_window := FOUND AND NOT COALESCE(v_legacy_closed, TRUE)
          AND NEW.booking_time >= v_legacy_open AND NEW.end_time <= v_legacy_close;
      END IF;
    END IF;
    IF NOT COALESCE(v_fits_window, FALSE) THEN
      RAISE EXCEPTION 'This appointment is outside the provider''s working hours';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.bookings b
     WHERE b.provider_id = NEW.provider_id AND b.booking_date = NEW.booking_date
       AND b.status IN ('pending', 'confirmed', 'in_progress', 'on_hold')
       AND b.id IS DISTINCT FROM NEW.id
       AND NEW.booking_time < b.end_time AND NEW.end_time > b.booking_time
  ) THEN RAISE EXCEPTION 'That time is no longer available'; END IF;
  RETURN NEW;
END;
$function$;

-- CREATE OR REPLACE FUNCTION resets a function's ACL to the Postgres
-- default (PUBLIC gets EXECUTE) — reapply the lockdown from
-- 20260812114517_revoke_public_booking_bookability_trigger.sql in the same
-- migration so this fix doesn't silently regress it. Trigger firing is
-- unaffected: Postgres invokes trigger functions internally regardless of
-- EXECUTE grants — this REVOKE only blocks direct RPC-style calls
-- (e.g. via PostgREST), which is exactly what the security linter flags on
-- any anon/authenticated-reachable SECURITY DEFINER function.
REVOKE ALL ON FUNCTION public.enforce_booking_bookability() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS before_booking_enforce_bookability ON public.bookings;
CREATE TRIGGER before_booking_enforce_bookability
  BEFORE INSERT OR UPDATE OF booking_date, booking_time, end_time, provider_id ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_bookability();

-- provider_create_manual_booking(): set the transaction-local bypass
-- immediately before the INSERT that creates the 'on_hold' row. The
-- following UPDATE (which promotes it to 'confirmed') only touches status/
-- confirmed_at — neither is a watched column of the trigger
-- (booking_date, booking_time, end_time, provider_id) — so it does not
-- refire enforce_booking_bookability() and does not need the bypass itself.
CREATE OR REPLACE FUNCTION public.provider_create_manual_booking(
  p_client_user_id uuid,
  p_service_id uuid,
  p_booking_date date,
  p_booking_time time,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_provider public.providers%ROWTYPE;
  v_service public.services%ROWTYPE;
  v_client public.users%ROWTYPE;
  v_booking_id uuid;
  v_end_time time;
  v_daily_booking_cap integer;
  v_active_booking_count integer;
BEGIN
  SELECT p.* INTO v_provider
    FROM public.providers p
   WHERE p.user_id = auth.uid()
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only the owning provider can add a booking';
  END IF;

  SELECT s.* INTO v_service
    FROM public.services s
   WHERE s.id = p_service_id
     AND s.provider_id = v_provider.id
     AND s.is_active = TRUE
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service is not active for this provider';
  END IF;

  SELECT u.* INTO v_client
    FROM public.users u
   WHERE u.id = p_client_user_id
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client account was not found';
  END IF;

  IF p_booking_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Booking date cannot be in the past';
  END IF;
  IF p_booking_time IS NULL THEN
    RAISE EXCEPTION 'Booking time is required';
  END IF;

  v_end_time := p_booking_time + make_interval(mins => v_service.duration_minutes);

  -- A provider's capacity is an additional guard on top of time overlap.
  -- Count the same active states used by the booking availability trigger.
  v_daily_booking_cap := COALESCE(v_provider.max_bookings_per_day, 0);
  IF v_daily_booking_cap > 0 THEN
    SELECT count(*) INTO v_active_booking_count
      FROM public.bookings b
     WHERE b.provider_id = v_provider.id
       AND b.booking_date = p_booking_date
       AND b.status IN ('pending', 'confirmed', 'in_progress', 'on_hold');
    IF v_active_booking_count >= v_daily_booking_cap THEN
      RAISE EXCEPTION 'This provider has reached their booking limit for that date';
    END IF;
  END IF;

  -- Squeeze-in support: this provider is deliberately booking outside their
  -- own configured working hours (early/late/closed day). Every other
  -- bookability rule — past-date, booking-window-days, minimum-notice,
  -- blocked-dates, and same-day overlap — still applies unconditionally via
  -- enforce_booking_bookability() below; only its working-hours fit check is
  -- skipped, and only for this INSERT. Transaction-local (is_local = true),
  -- so it cannot affect any other statement or connection.
  PERFORM set_config('cerviced.bypass_working_hours', 'on', true);

  -- Insert as a hold first so the normal booking-created trigger stays quiet;
  -- the function then atomically promotes it and emits the correct pair of
  -- notifications below. Existing schedule and no-overlap triggers run on
  -- both statements and remain the final authority.
  INSERT INTO public.bookings (
    user_id, provider_id, service_id, status,
    booking_date, booking_time, end_time, notes,
    payment_type, base_price, add_ons_total, service_charge,
    deposit_amount, amount_paid, remaining_balance, payment_status,
    provider_name_snapshot, service_name_snapshot, service_category_snapshot,
    provider_logo_snapshot, customer_name, customer_email, customer_phone
  ) VALUES (
    v_client.id, v_provider.id, v_service.id, 'on_hold',
    p_booking_date, p_booking_time, v_end_time, NULLIF(btrim(p_notes), ''),
    'full', v_service.price, 0, 0,
    0, 0, v_service.price, 'pending',
    v_provider.display_name, v_service.name, v_service.category_name,
    v_provider.logo_url, v_client.name, v_client.email, v_client.phone
  ) RETURNING id INTO v_booking_id;

  UPDATE public.bookings
     SET status = 'confirmed', confirmed_at = now()
   WHERE id = v_booking_id;

  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
  VALUES (
    v_client.id, 'booking_confirmed', 'Booking Confirmed! 🎉',
    v_provider.display_name || ' booked your ' || v_service.name ||
      ' for ' || to_char(p_booking_date, 'DD Mon YYYY') ||
      ' at ' || to_char(p_booking_time, 'HH12:MI AM') || '.',
    'high', TRUE, v_booking_id, v_provider.id, 'client'
  );
  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
  VALUES (
    v_provider.user_id, 'booking_confirmed', 'Manual Booking Added',
    COALESCE(v_client.name, 'Client') || ' was added for ' || v_service.name ||
      ' on ' || to_char(p_booking_date, 'DD Mon YYYY') ||
      ' at ' || to_char(p_booking_time, 'HH12:MI AM') || '.',
    'medium', FALSE, v_booking_id, v_provider.id, 'provider'
  );

  RETURN v_booking_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.provider_create_manual_booking(uuid, uuid, date, time, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provider_create_manual_booking(uuid, uuid, date, time, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.provider_create_manual_booking(uuid, uuid, date, time, text) TO authenticated;

-- VERIFY
--   select proname, proacl from pg_proc where pronamespace = 'public'::regnamespace
--     and proname = 'enforce_booking_bookability';
--     -> expect {postgres=X/postgres,service_role=X/postgres} only, NO anon/authenticated
--   select proname, proacl from pg_proc where pronamespace = 'public'::regnamespace
--     and proname = 'provider_create_manual_booking';
--     -> expect authenticated=X present, no anon=X entry
--   select pg_get_functiondef(oid) from pg_proc where pronamespace = 'public'::regnamespace
--     and proname = 'enforce_booking_bookability';
--     -> expect v_bypass_hours check present, working-hours block wrapped in
--        IF NOT v_bypass_hours, overlap check unchanged and unconditional
