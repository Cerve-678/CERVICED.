-- ════════════════════════════════════════════════════════════════════════════
-- fix_client_reliability_tracking.sql
--
-- GAP (policy audit, 2026-08-17): nothing tracks how many times a specific
-- client has no-showed or cancelled late against a specific provider. A
-- repeat-offender client is invisible to the provider — no counter, no row,
-- no aggregation exists anywhere (confirmed via information_schema.tables,
-- no table matching '%reliab%' or 'client_provider%' exists live).
--
-- SCHEMA CHOICE: a dedicated small table, client_provider_reliability,
-- keyed on (provider_id, client_user_id) — not a column bolted onto an
-- existing aggregation. getProviderClientele() (databaseService.ts) computes
-- its clientele list by scanning bookings in-memory on every call; there is
-- no persistent per-provider-per-client row anywhere to attach counters to,
-- so a dedicated table is the only clean option (also verified live: no
-- existing table matches this shape).
--
-- LATE-CANCELLATION DEFINITION — READ BEFORE CHANGING THE THRESHOLD:
-- cancel_own_booking() (verified live via pg_get_functiondef immediately
-- before writing this file) already BLOCKS a cancellation that violates the
-- provider's own cancellation_notice_hours/cancelNotice policy — it raises
-- an exception rather than letting a within-window cancel through. That
-- means a cancellation actually succeeding through this RPC is, under a
-- provider who HAS a notice policy set, never "late" relative to that
-- policy — the whole point of the guard is to prevent it. So counting only
-- "cancelled within this provider's own configured notice window" would
-- almost never increment anything (except for providers with no notice
-- policy at all, i.e. cancellation_notice_hours = 0 / cancelNotice = 'none',
-- who are exactly the ones most exposed to genuine last-minute cancels and
-- most in need of this visibility).
-- THIS FIX'S DEFINITION: a client-initiated cancel of a CONFIRMED booking
-- (not 'pending' — declining/withdrawing a still-pending request is not
-- disruptive to the provider the way cancelling a confirmed appointment is)
-- where fewer than 24 hours remained until the appointment start at the
-- moment of cancellation. This is a fixed, provider-independent threshold —
-- deliberately NOT keyed to that specific provider's own notice-hours
-- setting, for the reason above. Documented here explicitly so a future
-- change to this definition is a conscious decision, not a rediscovery.
--
-- WHO/WHAT INCREMENTS:
--   - late_cancel_count: hooked into cancel_own_booking() (client-only —
--     NOT provider_cancel_own_booking(), which is a provider cancelling on
--     their own behalf and says nothing about the client's reliability).
--   - no_show_count: hooked into provider_update_booking_status()'s
--     existing 'no_show' transition branch (confirmed live via
--     pg_get_functiondef immediately before writing this file — re-affirms
--     the CONFIRMED-LIVE body verbatim, including the noShowGraceMinutes
--     grace-period logic from a concurrent same-day fix, not reverting it).
--
-- RLS: provider can read only their own rows for their own clients — same
-- shape as every other provider-scoped table in this app (providers.id IN
-- (SELECT id FROM providers WHERE user_id = auth.uid())). No client-facing
-- read policy — a client seeing their own reliability score isn't part of
-- this task and is a separate product decision.
--
-- Safe to re-run (CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE, idempotent
-- policy/grant statements).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Table ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_provider_reliability (
  provider_id      uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  client_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  no_show_count    integer NOT NULL DEFAULT 0,
  late_cancel_count integer NOT NULL DEFAULT 0,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_id, client_user_id)
);

COMMENT ON TABLE public.client_provider_reliability IS
  'Per-(provider, client) no-show / late-cancellation counters. Incremented '
  'by cancel_own_booking() (late_cancel_count) and '
  'provider_update_booking_status() (no_show_count) only — never written '
  'directly by app code. See fix_client_reliability_tracking.sql for the '
  'exact "late cancellation" definition used.';

ALTER TABLE public.client_provider_reliability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_provider_reliability_provider_read ON public.client_provider_reliability;
CREATE POLICY client_provider_reliability_provider_read
  ON public.client_provider_reliability
  FOR SELECT
  USING (
    provider_id IN (SELECT p.id FROM public.providers p WHERE p.user_id = auth.uid())
  );

-- No INSERT/UPDATE/DELETE policy for any role — every write goes through
-- the SECURITY DEFINER RPCs below (cancel_own_booking /
-- provider_update_booking_status), consistent with this app's bookings/
-- notifications RLS pattern (no direct client write path at all).

GRANT SELECT ON public.client_provider_reliability TO authenticated;
REVOKE ALL ON public.client_provider_reliability FROM anon;

-- Defensive hardening: CREATE TABLE grants INSERT/UPDATE/DELETE/TRUNCATE to
-- authenticated by default in this project's role setup, in addition to the
-- SELECT above. RLS (enabled, SELECT-only policy) already blocks those
-- since no policy authorizes them, but this repo's convention elsewhere is
-- to be explicit about grants rather than rely on RLS alone as the only
-- line of defense (matches the REVOKE/GRANT pattern on every RPC in this
-- file family). All writes go through the SECURITY DEFINER RPCs below,
-- which bypass RLS as the function owner, so this doesn't affect them.
-- Confirmed applied live via information_schema.role_table_grants
-- (authenticated left with SELECT/REFERENCES/TRIGGER only).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.client_provider_reliability FROM authenticated;

CREATE INDEX IF NOT EXISTS idx_client_provider_reliability_provider
  ON public.client_provider_reliability (provider_id);

-- ── 2. cancel_own_booking(): increment late_cancel_count on a genuine
--    late cancel of a CONFIRMED booking (see definition above). Re-affirms
--    the rest of the confirmed-live body unchanged. ─────────────────────
CREATE OR REPLACE FUNCTION public.cancel_own_booking(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_booking   RECORD;
  v_notice_hrs INT;
  v_hours_until NUMERIC;
  v_cancel_notice TEXT;
BEGIN
  SELECT b.status, b.booking_date, b.booking_time, b.provider_id, b.user_id
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

  v_hours_until := EXTRACT(EPOCH FROM (
    (v_booking.booking_date + v_booking.booking_time)::timestamp - NOW()
  )) / 3600;

  IF COALESCE(v_notice_hrs, 0) > 0 THEN
    IF v_hours_until < v_notice_hrs THEN
      RAISE EXCEPTION 'This provider requires % hours notice to cancel', v_notice_hrs;
    END IF;
  END IF;

  -- Reliability tracking: a genuine late cancel of a CONFIRMED booking
  -- (fixed 24h threshold, independent of this provider's own notice-hours
  -- setting — see the header comment for why). 'pending' cancels (declining
  -- a request that was never accepted) don't count.
  IF v_booking.status = 'confirmed' AND v_hours_until >= 0 AND v_hours_until < 24 THEN
    INSERT INTO public.client_provider_reliability (provider_id, client_user_id, late_cancel_count, updated_at)
    VALUES (v_booking.provider_id, v_booking.user_id, 1, NOW())
    ON CONFLICT (provider_id, client_user_id)
    DO UPDATE SET late_cancel_count = client_provider_reliability.late_cancel_count + 1,
                  updated_at = NOW();
  END IF;

  UPDATE public.bookings SET status = 'cancelled' WHERE id = p_booking_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_own_booking(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_own_booking(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_own_booking(uuid) TO authenticated;

-- ── 3. provider_update_booking_status(): increment no_show_count on the
--    existing no_show transition. Re-affirms the confirmed-live body
--    (including the noShowGraceMinutes grace-period logic from a concurrent
--    same-day fix) unchanged other than adding the increment + selecting
--    b.user_id, which the prior body didn't need. ──────────────────────
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
  v_client_user_id  uuid;
  v_grace_minutes   integer;
BEGIN
  SELECT b.status, b.booking_date, b.booking_time, b.provider_id, b.user_id
    INTO v_current_status, v_booking_date, v_booking_time, v_provider_id, v_client_user_id
    FROM public.bookings b
   WHERE b.id = p_booking_id
     AND b.provider_id IN (SELECT p.id FROM public.providers p WHERE p.user_id = auth.uid())
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found or not owned by caller';
  END IF;

  IF v_current_status IN ('cancelled', 'completed', 'no_show') THEN
    RAISE EXCEPTION 'Booking is already %, no further status changes allowed', v_current_status;
  END IF;

  IF p_status = 'cancelled' THEN
    RAISE EXCEPTION 'Use provider_cancel_own_booking() to cancel a booking';
  END IF;

  v_appt_start := (v_booking_date + v_booking_time)::timestamp;

  SELECT COALESCE((booking_policies->>'noShowGraceMinutes')::integer, 0)
    INTO v_grace_minutes
    FROM public.providers
   WHERE id = v_provider_id;
  v_grace_minutes := GREATEST(COALESCE(v_grace_minutes, 0), 0);

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
      NULL;
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
      NULL;
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

  IF p_status = 'no_show' THEN
    INSERT INTO public.client_provider_reliability (provider_id, client_user_id, no_show_count, updated_at)
    VALUES (v_provider_id, v_client_user_id, 1, NOW())
    ON CONFLICT (provider_id, client_user_id)
    DO UPDATE SET no_show_count = client_provider_reliability.no_show_count + 1,
                  updated_at = NOW();
  END IF;

  UPDATE public.bookings SET status = p_status WHERE id = p_booking_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.provider_update_booking_status(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provider_update_booking_status(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.provider_update_booking_status(uuid, text) TO authenticated;

-- ───────────────────────────────────────────────────────────
-- VERIFY
--   SELECT * FROM information_schema.tables
--    WHERE table_name = 'client_provider_reliability';
--
--   SELECT policyname, cmd FROM pg_policies
--    WHERE tablename = 'client_provider_reliability';
--    → expect exactly one SELECT policy, provider-scoped
--
--   SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'cancel_own_booking';
--   SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'provider_update_booking_status';
--    → expect the reliability INSERT ... ON CONFLICT present in both
-- ───────────────────────────────────────────────────────────

-- ============================================================
-- DONE — client_provider_reliability tracks no_show_count/late_cancel_count
-- per (provider, client), incremented server-side only, provider-read-only
-- via RLS. See databaseService.ts's getClientReliabilityStats() for the
-- app-side read.
-- ============================================================
