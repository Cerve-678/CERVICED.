-- ════════════════════════════════════════════════════════════════════════════
-- fix_provider_status_transition_guard.sql
--
-- Found by: live-DB security audit, 2026-08-07 (cross-referenced against
-- supabase/fix_bookings_provider_update_bypass.sql, which is confirmed
-- current — no other file since has touched provider_update_booking_status).
--
-- ── GAP 1 (High) — no state-machine/timing check on provider_update_booking_status ──
-- ────────────────────────────────────────────────────────────────────────────
-- provider_update_booking_status(), as deployed by
-- fix_bookings_provider_update_bypass.sql, only checks that the calling
-- provider owns the booking row, then writes ANY caller-supplied p_status
-- unconditionally. That means, via a direct API call (bypassing the app):
--   - pending -> completed in one hop, skipping confirmed/in_progress
--   - no_show set before the appointment's start time has even arrived
--   - completed set before the appointment has happened at all
--   - resurrecting a cancelled/completed/no_show booking back to any status
--
-- The app itself never does any of this — ProviderBookingDetailScreen.tsx
-- only offers "Start Appointment" (confirmed -> in_progress), "Mark
-- Complete" (in_progress -> completed), and "No Show" (gated client-side,
-- lines ~862-871, on apptStartPassed — booking_date+booking_time already
-- passed). "Confirm" (pending -> confirmed) is a separate handler
-- (handleConfirm). Cancellation is intentionally NOT handled by this RPC —
-- it already goes through cancel_own_booking()/provider_cancel_own_booking()
-- (booking_rules_server_enforcement.sql), so 'cancelled' is deliberately
-- excluded from this function's allowed target list below; a provider
-- cancelling still calls provider_cancel_own_booking() unchanged.
--
-- This is the same bug class as the already-fixed cancellation-window gap
-- (booking_rules_server_enforcement.sql's header) and the reschedule-
-- forgery gap (fix_reschedule_request_rls_forgery_gap.sql): a business rule
-- that only ever lived in React and had no server-side twin. Direct REST/
-- RPC calls with a stolen or replayed provider JWT bypass all client-side
-- checks entirely.
--
-- ── State graph enforced (derived from mapDbBookingStatus in
--    src/types/booking.ts, the ProviderBookingDetailScreen action buttons,
--    and this task's specified graph — no separate written spec exists) ──
--
--   pending     -> confirmed                         (handleConfirm)
--   confirmed   -> in_progress                        (Start Appointment)
--   confirmed   -> no_show      [only after appt start time has passed]
--   confirmed   -> completed    [only after appt start time has passed —
--                                 not in today's UI, reserved for a future
--                                 "mark complete without starting" path;
--                                 gated the same as no_show so it can't be
--                                 used to skip the timing check either]
--   in_progress -> completed                          (Mark Complete)
--   in_progress -> no_show      [only after appt start time has passed —
--                                 mirrors the confirmed->no_show gate;
--                                 not reachable in today's UI once already
--                                 in_progress, but closes the same hole if
--                                 it ever becomes reachable]
--
--   'cancelled' is never a valid target here — cancellation is owned by
--   cancel_own_booking() / provider_cancel_own_booking() instead, which
--   already enforce their own rules (notice-hours, terminal-state checks).
--   pending/confirmed/in_progress are also never valid *targets* from a
--   terminal state (cancelled/completed/no_show) — once terminal, always
--   terminal, for this RPC.
--
-- Timing check mirrors the app's own gate exactly (apptStartPassed in
-- ProviderBookingDetailScreen.tsx: createBookingDateTime(booking_date,
-- booking_time) < now) — i.e. appointment START time, not end_time. Kept
-- identical to the client so server enforcement never rejects something the
-- UI itself would allow, or vice versa.
--
-- Safe to re-run (CREATE OR REPLACE).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.provider_update_booking_status(p_booking_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status  text;
  v_booking_date    date;
  v_booking_time    time;
  v_appt_start      timestamp;
BEGIN
  SELECT b.status, b.booking_date, b.booking_time
    INTO v_current_status, v_booking_date, v_booking_time
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

  IF v_current_status = 'pending' THEN
    IF p_status <> 'confirmed' THEN
      RAISE EXCEPTION 'Invalid status transition: % -> %', v_current_status, p_status;
    END IF;

  ELSIF v_current_status = 'confirmed' THEN
    IF p_status = 'in_progress' THEN
      NULL; -- always allowed once confirmed
    ELSIF p_status IN ('no_show', 'completed') THEN
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
      IF v_appt_start >= NOW() THEN
        RAISE EXCEPTION 'Cannot mark no_show before the appointment start time';
      END IF;
    ELSE
      RAISE EXCEPTION 'Invalid status transition: % -> %', v_current_status, p_status;
    END IF;

  ELSE
    RAISE EXCEPTION 'Unrecognized current status: %', v_current_status;
  END IF;

  UPDATE public.bookings SET status = p_status WHERE id = p_booking_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.provider_update_booking_status(uuid, text) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- ── GAP 2 (Medium) — missing anon lockdown on 7 booking-mutation RPCs ──
-- ────────────────────────────────────────────────────────────────────────────
-- All 7 RPCs below already check auth.uid() internally, so this is not
-- exploitable today — an anonymous caller has no auth.uid() to match against
-- any booking/provider row, so every one of these already raises "not found"
-- for anon. But they lack the explicit REVOKE lockdown that
-- waitlist_holds.sql (claim_waitlist_hold/decline_waitlist_hold) and
-- provider_busy_spans_rpc.sql already apply, which is what Supabase's
-- advisor tool checks for structurally (PUBLIC/anon EXECUTE grants on
-- SECURITY DEFINER functions) rather than tracing the function body. This
-- brings all 7 in line with that pattern for defense-in-depth and to clear
-- the advisor WARN — same REVOKE/GRANT shape as
-- supabase/waitlist_holds.sql:518-521.
--
-- request_reschedule_own_booking(uuid, text[]) was originally flagged as a
-- follow-up (same RPC family, same gap, just not in the audit's initial
-- named list of 6) — folded in here instead so all 7 close in one pass.
--
-- Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.provider_update_booking_status(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provider_update_booking_status(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.provider_update_booking_status(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.cancel_own_booking(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_own_booking(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_own_booking(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.provider_cancel_own_booking(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provider_cancel_own_booking(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.provider_cancel_own_booking(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.confirm_reschedule_own_booking(uuid, date, time, time) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.confirm_reschedule_own_booking(uuid, date, time, time) FROM anon;
GRANT EXECUTE ON FUNCTION public.confirm_reschedule_own_booking(uuid, date, time, time) TO authenticated;

REVOKE ALL ON FUNCTION public.respond_to_reschedule_request(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.respond_to_reschedule_request(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.respond_to_reschedule_request(uuid, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.provider_initiate_reschedule(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provider_initiate_reschedule(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.provider_initiate_reschedule(uuid, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.request_reschedule_own_booking(uuid, text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.request_reschedule_own_booking(uuid, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.request_reschedule_own_booking(uuid, text[]) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- NOT COVERED HERE:
--   • This file does not touch RUN_ALL_MIGRATIONS.sql — wire it in manually
--     once reviewed and applied.
-- ════════════════════════════════════════════════════════════════════════════
