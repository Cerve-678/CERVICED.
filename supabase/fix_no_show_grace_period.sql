-- ════════════════════════════════════════════════════════════════════════════
-- fix_no_show_grace_period.sql
--
-- GAP: provider_update_booking_status()'s no_show guard currently allows
-- marking a booking no_show the instant appointment start time has passed
-- (same calendar day only, per fix_provider_status_transition_guard.sql /
-- the later same-day + active-reschedule hardening, both confirmed live via
-- pg_get_functiondef 2026-08-17). There's no grace period — a provider can
-- fire no_show one second after the booked start time, before a client who's
-- simply running a few minutes late has any real chance to show up.
--
-- FIX: add booking_policies.noShowGraceMinutes (JSONB key, no migration
-- needed — default/fallback 0 when absent, preserving today's exact
-- behavior for every provider who hasn't set one). The no_show guard now
-- checks `now() >= appointment_start + (grace_minutes * interval '1 minute')`
-- instead of `now() >= appointment_start`, reading grace_minutes from that
-- booking's own provider row.
--
-- Base this REPLACE on the CONFIRMED LIVE body (pg_get_functiondef, checked
-- immediately before writing this file) — not on any .sql file's contents,
-- since this repo has documented live/file drift before. The live body
-- already includes the same-day check and the active-reschedule-request
-- guard from the post-fix_provider_status_transition_guard.sql hardening;
-- both are preserved unchanged here. Only the no_show timing check +
-- confirmed/in_progress -> no_show timing checks change, to add the grace
-- window. The confirmed/in_progress -> completed timing check is left
-- exactly as-is (a grace period exists so a no-show isn't declared too
-- early — "completed" has no equivalent early-declaration risk).
--
-- Safe to re-run (CREATE OR REPLACE).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.provider_update_booking_status(p_booking_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_status  text;
  v_booking_date    date;
  v_booking_time    time;
  v_appt_start      timestamp;
  v_active_reschedule boolean;
  v_provider_id     uuid;
  v_grace_minutes   integer;
BEGIN
  SELECT b.status, b.booking_date, b.booking_time, b.provider_id
    INTO v_current_status, v_booking_date, v_booking_time, v_provider_id
    FROM public.bookings b
   WHERE b.id = p_booking_id
     AND b.provider_id IN (SELECT p.id FROM public.providers p WHERE p.user_id = auth.uid())
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found or not owned by caller';
  END IF;

  -- Terminal states never transition again through this RPC.
  IF v_current_status IN ('cancelled', 'completed', 'no_show') THEN
    RAISE EXCEPTION 'Booking is already %, no further status changes allowed', v_current_status;
  END IF;

  -- Cancellation is not this RPC's job — route through the dedicated RPCs
  -- that already enforce notice-hours / terminal-state rules.
  IF p_status = 'cancelled' THEN
    RAISE EXCEPTION 'Use provider_cancel_own_booking() to cancel a booking';
  END IF;

  v_appt_start := (v_booking_date + v_booking_time)::timestamp;

  -- no_show grace period: providers can configure how many minutes past the
  -- booked start time must elapse before "No Show" is available, so a client
  -- running slightly late isn't marked a no-show the instant the clock ticks
  -- over. Absent/invalid config = 0 minutes = exactly today's behavior.
  SELECT COALESCE((booking_policies->>'noShowGraceMinutes')::integer, 0)
    INTO v_grace_minutes
    FROM public.providers
   WHERE id = v_provider_id;
  v_grace_minutes := GREATEST(COALESCE(v_grace_minutes, 0), 0);

  -- no_show guardrails: must be the same calendar day as the appointment
  -- (not just "sometime after start" — a provider could otherwise mark a
  -- booking from weeks ago), never while a reschedule offer the client
  -- could still act on is outstanding — the provider must resolve that
  -- first (accept/decline/let it lapse) rather than short-circuit it with
  -- a no_show on the original slot — and now, not until the configured
  -- grace window past the booked start time has elapsed.
  IF p_status = 'no_show' THEN
    IF v_booking_date <> CURRENT_DATE THEN
      RAISE EXCEPTION 'no_show can only be marked on the day of the appointment';
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.booking_reschedule_requests r
       WHERE r.booking_id = p_booking_id
         AND r.status IN ('pending', 'provider_responded')
    ) INTO v_active_reschedule;
    IF v_active_reschedule THEN
      RAISE EXCEPTION 'Cannot mark no_show while a reschedule request is active for this booking';
    END IF;
  END IF;

  IF v_current_status = 'pending' THEN
    IF p_status <> 'confirmed' THEN
      RAISE EXCEPTION 'Invalid status transition: % -> %', v_current_status, p_status;
    END IF;

  ELSIF v_current_status = 'confirmed' THEN
    IF p_status = 'in_progress' THEN
      NULL; -- always allowed once confirmed
    ELSIF p_status = 'no_show' THEN
      IF NOW() < v_appt_start + (v_grace_minutes * INTERVAL '1 minute') THEN
        RAISE EXCEPTION 'Cannot mark no_show until % minute(s) after the appointment start time', v_grace_minutes;
      END IF;
    ELSIF p_status = 'completed' THEN
      IF v_appt_start >= NOW() THEN
        RAISE EXCEPTION 'Cannot mark % before the appointment start time', p_status;
      END IF;
    ELSE
      RAISE EXCEPTION 'Invalid status transition: % -> %', v_current_status, p_status;
    END IF;

  ELSIF v_current_status = 'in_progress' THEN
    IF p_status = 'completed' THEN
      NULL; -- always allowed once in progress
    ELSIF p_status = 'no_show' THEN
      IF NOW() < v_appt_start + (v_grace_minutes * INTERVAL '1 minute') THEN
        RAISE EXCEPTION 'Cannot mark no_show until % minute(s) after the appointment start time', v_grace_minutes;
      END IF;
    ELSE
      RAISE EXCEPTION 'Invalid status transition: % -> %', v_current_status, p_status;
    END IF;

  ELSE
    RAISE EXCEPTION 'Unrecognized current status: %', v_current_status;
  END IF;

  UPDATE public.bookings SET status = p_status WHERE id = p_booking_id;
END;
$function$;

-- Preserve existing lockdown (CREATE OR REPLACE keeps grants, but stay explicit).
REVOKE ALL ON FUNCTION public.provider_update_booking_status(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provider_update_booking_status(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.provider_update_booking_status(uuid, text) TO authenticated;

-- ───────────────────────────────────────────────────────────
-- VERIFY
--   -- confirm the new body is live and grace math is in it
--   SELECT pg_get_functiondef(oid) FROM pg_proc
--    WHERE proname = 'provider_update_booking_status';
--
--   -- confirm grants unchanged (authenticated only, no anon/public)
--   SELECT grantee, privilege_type FROM information_schema.routine_privileges
--    WHERE routine_name = 'provider_update_booking_status';
-- ───────────────────────────────────────────────────────────

-- ============================================================
-- DONE — no_show grace period enforced server-side via
-- booking_policies.noShowGraceMinutes (default 0 = unchanged behavior).
-- ============================================================
