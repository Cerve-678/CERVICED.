-- ════════════════════════════════════════════════════════════════════════════
-- fix_group_booking_per_service_actions.sql
--
-- GAP (policy audit, 2026-08-17): a group booking (multiple `bookings` rows
-- sharing one group_booking_id) could only be status-updated or cancelled
-- ALL-OR-NOTHING by a provider. If a client booked 3 services and showed up
-- for 2 but skipped 1, the provider had no way to mark just that one
-- no_show — provider_update_group_booking_status() / provider_cancel_group_
-- booking() (fix_group_booking_atomic_actions.sql) apply their target status
-- to every one of the provider's own sibling rows in the group at once, by
-- design (see that file's header — the atomicity is deliberate for
-- pending->confirmed and pending->cancelled/declined specifically, so a
-- client never sees a group half-confirmed).
--
-- WHAT WAS ACTUALLY BLOCKING PER-SERVICE ACTION
-- ──────────────────────────────────────────────
-- Verified live against pg_get_functiondef for both single-row RPCs before
-- writing this file (this repo has documented drift between supabase/*.sql
-- and what's actually deployed — see supabase-migration-tracking-gap in
-- memory): provider_update_booking_status(uuid, text) and cancel_own_
-- booking(uuid) / provider_cancel_own_booking(uuid) have NO group_booking_id
-- guard at all, live or in any tracked file. They already validate and write
-- exactly one row, scoped only by row ownership (provider_id / user_id via
-- auth.uid()) — nothing here ever blocked per-service action.
--
-- The gap was entirely APP-SIDE: ProviderBookingDetailScreen.tsx's
-- updateBookingStatus()/cancelBooking() wrapper functions routed EVERY
-- status change through the atomic group RPC whenever the viewed booking
-- had more than one sibling (groupSiblings.length > 1) — including
-- in_progress, no_show, completed, and cancelling an already-confirmed
-- booking, none of which need to be atomic. Only pending->confirmed
-- (Confirm) and pending->cancelled-by-provider (Decline) actually need the
-- atomic group RPC; every other transition is now split into its own
-- per-service handler that always calls the single-row RPC, even when the
-- booking is part of a group. See the app-side comment block above
-- updateBookingStatus/cancelBookingSingle in that file for the full
-- reasoning. ProviderBookingHistoryScreen.tsx and ProviderInboxScreen.tsx
-- were checked too — both already only call the group RPCs for the
-- 'confirmed' transition (bulk confirm / bulk decline), so neither needed
-- an app-side change.
--
-- Client-side (cancel_own_booking, called from BookingContext.tsx's
-- cancelBooking / BookingDetailScreen.tsx's handleCancelBooking) was
-- already single-row-only with zero group awareness — a client could
-- already cancel just one of N group services. No app-side change needed
-- on the client hat.
--
-- WHY THIS FILE STILL EXISTS THOUGH NO RPC LOGIC CHANGES
-- ──────────────────────────────────────────────────────
-- Nothing here alters behaviour — it's a verification-and-hardening pass:
--   1. Re-affirms (CREATE OR REPLACE, byte-identical bodies) the three
--      single-row RPCs so this file is a complete, re-runnable record of
--      the confirmed-correct live state, not just a comment.
--   2. Adds COMMENT ON FUNCTION markers recording that the ABSENCE of a
--      group_booking_id guard on these three RPCs is intentional — so a
--      future edit doesn't "fix" what looks like a missing check and
--      reintroduce this exact bug.
--   3. Re-applies the REVOKE/GRANT lockdown defensively (idempotent, same
--      shape as fix_provider_status_transition_guard.sql).
--
-- The existing atomic group RPCs (provider_update_group_booking_status,
-- provider_cancel_group_booking) are UNCHANGED — they remain the correct
-- path for confirm/decline and for a future explicit "cancel whole group"
-- bulk action (not currently surfaced anywhere beyond ProviderInboxScreen's
-- decline-all, which is itself a pending-stage decline, not a post-confirm
-- bulk cancel).
--
-- Safe to re-run (CREATE OR REPLACE / idempotent REVOKE-GRANT throughout).
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
  v_active_reschedule boolean;
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

  -- no_show guardrails: must be the same calendar day as the appointment
  -- (not just "sometime after start" — a provider could otherwise mark a
  -- booking from weeks ago), and never while a reschedule offer the client
  -- could still act on is outstanding — the provider must resolve that
  -- first (accept/decline/let it lapse) rather than short-circuit it with
  -- a no_show on the original slot.
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

COMMENT ON FUNCTION public.provider_update_booking_status(uuid, text) IS
  'Single-row status transition (in_progress/no_show/completed), scoped only '
  'by provider ownership. Deliberately has NO group_booking_id guard — this '
  'is the RPC per-service group actions rely on (see '
  'fix_group_booking_per_service_actions.sql). Do not add a group_booking_id '
  'IS NULL check here; that would resurrect the all-or-nothing bug where a '
  'provider could not mark one service in a group no_show/complete without '
  'forcing the same status onto its siblings.';

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

COMMENT ON FUNCTION public.cancel_own_booking(uuid) IS
  'Single-row client cancel, scoped only by user_id = auth.uid(). '
  'Deliberately has NO group_booking_id guard — a client can and should be '
  'able to cancel just one of N services in a group booking without '
  'touching its siblings. See fix_group_booking_per_service_actions.sql.';

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

COMMENT ON FUNCTION public.provider_cancel_own_booking(uuid) IS
  'Single-row provider cancel, scoped only by provider ownership via '
  'auth.uid(). Deliberately has NO group_booking_id guard — a provider can '
  'and should be able to cancel just one already-confirmed service in a '
  'group without forcing cancellation onto its siblings. The atomic bulk '
  'equivalent for an intentional whole-group cancel is '
  'provider_cancel_group_booking(), which stays a separate, explicit '
  'action. See fix_group_booking_per_service_actions.sql.';

COMMENT ON FUNCTION public.provider_update_group_booking_status(uuid, text) IS
  'Atomic bulk action: moves ALL of the calling provider''s sibling rows in '
  'a group at once. Intentionally used ONLY for pending->confirmed today '
  '(see fix_group_booking_atomic_actions.sql) — a client should never see a '
  'group half-confirmed. Do NOT route in_progress/no_show/completed through '
  'this RPC; those are per-service and belong on '
  'provider_update_booking_status() instead.';

COMMENT ON FUNCTION public.provider_cancel_group_booking(uuid) IS
  'Atomic bulk action: cancels ALL of the calling provider''s sibling rows '
  'in a group at once. Intentionally used ONLY for the pending-stage '
  'provider decline today (see fix_group_booking_atomic_actions.sql and '
  'ProviderInboxScreen.tsx''s handleDeclineBooking) plus any future '
  'explicit "cancel whole group" bulk action. Do NOT route a single '
  'already-confirmed service''s cancel through this RPC; that belongs on '
  'provider_cancel_own_booking() instead.';

-- ── Defensive re-lock (idempotent, matches
--    fix_provider_status_transition_guard.sql's pattern) ────────────────────
REVOKE ALL ON FUNCTION public.provider_update_booking_status(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provider_update_booking_status(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.provider_update_booking_status(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.cancel_own_booking(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_own_booking(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_own_booking(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.provider_cancel_own_booking(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provider_cancel_own_booking(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.provider_cancel_own_booking(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.provider_update_group_booking_status(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provider_update_group_booking_status(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.provider_update_group_booking_status(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.provider_cancel_group_booking(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provider_cancel_group_booking(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.provider_cancel_group_booking(uuid) TO authenticated;

-- ── App-side companion change (not in this file, tracked here for the
--    record) ─────────────────────────────────────────────────────────────
-- src/screens/provider/ProviderBookingDetailScreen.tsx: updateBookingStatus/
-- cancelBooking (group-routed) were split from a new
-- updateBookingStatusSingle/cancelBookingSingle (always single-row). Only
-- handleConfirm and handleDecline still call the group-routed pair;
-- handleStatusChange (Start Appointment/Mark Complete/No Show) and
-- handleCancel (post-confirm cancel) now call the single-row pair
-- unconditionally, even when the booking is part of a group.
--
-- ProviderBookingHistoryScreen.tsx and ProviderInboxScreen.tsx were checked
-- and needed no change — both already only call the group RPCs for the
-- 'confirmed' transition.
--
-- src/contexts/BookingContext.tsx's cancelBooking (client hat) and
-- src/screens/client/BookingDetailScreen.tsx were checked and needed no
-- change — already single-row-only, zero group_booking_id awareness, a
-- client could already cancel one of N group services.
-- ════════════════════════════════════════════════════════════════════════════
