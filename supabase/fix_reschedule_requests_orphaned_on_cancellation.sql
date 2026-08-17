-- ============================================================
-- CERVICED — Fix: orphaned reschedule requests survive booking cancellation
--
-- SUPERSEDED — folded into supabase/fix_reschedule_flow_completion.sql
-- (Part 1) on 2026-08-08, which re-applies handle_booking_status_change()
-- with this fix's addition PLUS unrelated later changes to the same
-- function. Running this file after that one would silently drop the
-- later changes; running this file alone no longer covers the full
-- reschedule flow. Do not run this file — deploy
-- fix_reschedule_flow_completion.sql instead. Left here only for the
-- reasoning/history below.
--
-- PROPOSAL ONLY — NOT YET DEPLOYED, NOT WIRED INTO RUN_ALL_MIGRATIONS.sql.
-- Do not run via apply_migration/execute_sql without human review first.
-- Safe to re-run once approved (CREATE OR REPLACE + idempotent UPDATE).
--
-- ------------------------------------------------------------
-- ROOT CAUSE
-- ------------------------------------------------------------
-- Nothing closes a 'pending' or 'provider_responded' row in
-- booking_reschedule_requests when its underlying booking is cancelled.
-- getActiveRescheduleRequest / getActiveRescheduleRequestsForBookings
-- (src/services/databaseService.ts) both filter
-- `status IN ('pending', 'provider_responded')` with no join back to the
-- booking's own status — so a request left active on a since-cancelled
-- booking would still surface as "waiting on the provider" / "provider
-- sent times" in RescheduleScreen.tsx and BookingDetailScreen.tsx, and a
-- client could still attempt confirm_reschedule_own_booking() against it
-- (that RPC would itself reject it — it independently re-checks
-- `b.status = 'confirmed'` — but the stale UI state getting that far at
-- all is the actual bug: a dead end, not a crash).
--
-- No orphans exist today (tiny dataset, confirmed by direct inspection at
-- proposal time) — this closes a structural gap, not an active incident.
--
-- ------------------------------------------------------------
-- WHY THIS SHAPE: addition to the existing status-change trigger, not a
-- new dedicated trigger
-- ------------------------------------------------------------
-- handle_booking_status_change() already fires
-- `AFTER UPDATE OF status ON public.bookings FOR EACH ROW`, and already
-- special-cases every transition INTO 'cancelled' (both the
-- pending→cancelled branch and the confirmed/in_progress→cancelled
-- branch) to send notifications and invite the next waitlist entry via
-- PERFORM. Closing a booking's open reschedule request on the exact same
-- transition is the same "cancellation side-effects" concern this
-- function already owns — a second trigger on the same table watching for
-- the same column would just be two triggers doing overlapping cancellation
-- bookkeeping with no ordering guarantee between them, for no benefit.
-- A trigger on booking_reschedule_requests itself doesn't fit either: the
-- state that changes (bookings.status) lives on the OTHER table, so it
-- would need to be a trigger on `bookings` regardless — which is exactly
-- what already exists.
--
-- This patch is written as a full CREATE OR REPLACE of
-- handle_booking_status_change() with ONE addition (a call to the new
-- close_orphaned_reschedule_request() at the top of the function, before
-- any of the existing branches — see note below on why it must run
-- unconditionally rather than being folded into just one branch).
--
-- IMPORTANT — LIVE-VERSION CAVEAT (do not skip before applying):
-- This file's body was written against the version confirmed live via
-- memory as of 2026-08-01 (see supabase/waitlist_automation_settings.sql
-- and auto-memory booking-notifications-architecture.md's "Update
-- 2026-08-01" entry — booking_cancellation_actor_aware_fix.sql's
-- actor-aware/waitlist-invite body, with invite_next_waitlist_entry()
-- called with the 9-arg freed-slot signature). Supabase MCP was not
-- connected when this file was written, so that has NOT been re-confirmed
-- against pg_get_functiondef on the live DB. This repo has a documented,
-- repeated history of exactly this function drifting between what a file
-- claims and what's live (see waitlist-holds-stale-baseline-patch.md and
-- the "regressed once already" note in booking-notifications-architecture.md)
-- — a second regression of the actor-aware wording or the waitlist invite
-- is the single most likely way applying this file could go wrong.
-- BEFORE RUNNING THIS FILE: run
--   SELECT pg_get_functiondef('public.handle_booking_status_change'::regproc);
-- and diff it against the body below. If it differs, port this file's one
-- addition (the close_orphaned_reschedule_request() call) onto the ACTUAL
-- live body instead of running this file's copy verbatim — same remedy
-- waitlist_holds.sql needed for handle_new_booking().
--
-- ------------------------------------------------------------
-- WHY A SEPARATE HELPER FUNCTION (close_orphaned_reschedule_request)
-- RATHER THAN INLINING THE UPDATE DIRECTLY
-- ------------------------------------------------------------
-- Keeps the diff against the live handle_booking_status_change() to a
-- single PERFORM line (easier to port onto whatever the live body turns
-- out to be, per the caveat above) and makes the close logic independently
-- testable/callable (e.g. from a future backfill for any historical
-- orphans, or from cron.process_expire_stale_pending_bookings() below,
-- which also transitions bookings to 'cancelled' outside of a plain
-- client/provider UPDATE and goes through the SAME trigger either way —
-- called out explicitly so a future reader doesn't wonder whether the
-- 48h auto-expire path needs its own separate handling: it doesn't, the
-- trigger fires for it exactly like any other UPDATE OF status).
--
-- ------------------------------------------------------------
-- TERMINAL STATUS CHOSEN: 'cancelled' (NEW value — requires widening the
-- CHECK constraint), not 'rejected'
-- ------------------------------------------------------------
-- booking_reschedule_requests_status_check (phase1_schema.sql) currently
-- allows only 'pending','provider_responded','confirmed','rejected'.
-- 'rejected' is semantically wrong here — that value means "the client
-- declined a provider's proposed times" (see the separate, currently-
-- unimplemented Gap 1 in this same task), a different real-world event
-- from "this reschedule conversation is moot because the booking itself
-- no longer exists as an appointment to reschedule." Reusing it would
-- make a future NotificationsScreen/analytics/support query for "did the
-- client decline this?" silently include cancelled-booking noise. Adding
-- a distinct 'cancelled' value keeps the two events distinguishable and
-- matches bookings.status's own vocabulary for the same real-world event.
--
-- Checked every app-code consumer of booking_reschedule_requests.status
-- (src/screens/provider/ProviderBookingDetailScreen.tsx:815-817,1440,1451;
-- src/services/databaseService.ts's getActiveRescheduleRequest /
-- getActiveRescheduleRequestsForBookings) — every comparison is a
-- targeted `=== 'pending'` / `=== 'provider_responded'` check, none is an
-- exhaustive switch or an "else assume active" fallthrough, so a new
-- terminal value cannot silently misroute any existing screen. It also
-- will not appear in either getActiveRescheduleRequest query's result set
-- (both filter `status IN ('pending','provider_responded')`), which is
-- the actual goal — closed requests disappear from "active" reads.
--
-- src/types/database.ts's RescheduleStatus union ('pending' |
-- 'provider_responded' | 'confirmed' | 'rejected') will need 'cancelled'
-- added alongside deploying this — flagged here, NOT changed by this file
-- (out of scope: SQL proposal only, per instructions for this task).
-- ============================================================

-- ── 1. Widen the status CHECK constraint ───────────────────────────────
ALTER TABLE public.booking_reschedule_requests
  DROP CONSTRAINT IF EXISTS booking_reschedule_requests_status_check;

ALTER TABLE public.booking_reschedule_requests
  ADD CONSTRAINT booking_reschedule_requests_status_check
  CHECK (status IN (
    'pending', 'provider_responded', 'confirmed', 'rejected', 'cancelled'
  ));

-- ── 2. Helper: close any open reschedule request for a booking ────────
--    SECURITY DEFINER + explicit search_path, same convention as every
--    other function in this file's family (respond_to_reschedule_request,
--    provider_initiate_reschedule, etc.) — this only ever runs from inside
--    another SECURITY DEFINER trigger, never called directly by a client.
CREATE OR REPLACE FUNCTION public.close_orphaned_reschedule_request(
  p_booking_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.booking_reschedule_requests
     SET status = 'cancelled',
         updated_at = NOW()
   WHERE booking_id = p_booking_id
     AND status IN ('pending', 'provider_responded');
END;
$$;

-- ── 3. Re-apply handle_booking_status_change() with the one addition ──
--    Body otherwise identical to the version confirmed live 2026-08-01
--    (see waitlist_automation_settings.sql / booking_cancellation_
--    actor_aware_fix.sql) — READ THE CAVEAT ABOVE BEFORE RUNNING THIS
--    VERBATIM. The only change from that body is the single
--    `PERFORM public.close_orphaned_reschedule_request(NEW.id);` line
--    added once, unconditionally, at the top — before the branches — so
--    it fires on every transition INTO 'cancelled' regardless of which
--    branch below (pending→cancelled vs confirmed/in_progress→cancelled)
--    matches, without duplicating the call in both places.
CREATE OR REPLACE FUNCTION public.handle_booking_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_actor            UUID := auth.uid();  -- NULL when cron / service role
  v_provider_user_id UUID;
BEGIN

  -- NEW: close any open reschedule request the moment this booking is
  -- cancelled, from whichever prior state. No-op (0 rows) for any booking
  -- that never had one, or whose request was already confirmed/rejected/
  -- cancelled — see close_orphaned_reschedule_request()'s WHERE clause.
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    PERFORM public.close_orphaned_reschedule_request(NEW.id);
  END IF;

  IF NEW.status = 'confirmed' AND OLD.status = 'pending' THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      NEW.user_id, 'booking_confirmed', 'Booking Confirmed! 🎉',
      NEW.provider_name_snapshot || ' confirmed your booking for ' ||
        NEW.service_name_snapshot ||
        ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') ||
        ' at ' || TO_CHAR(NEW.booking_time, 'HH12:MI AM') || '.',
      'high', TRUE, NEW.id, NEW.provider_id, 'client'
    );
    RETURN NEW;
  END IF;

  -- Pending booking cancelled: provider declined OR client withdrew.
  IF NEW.status = 'cancelled' AND OLD.status = 'pending' THEN
    IF v_actor IS NOT NULL AND v_actor = NEW.user_id THEN
      -- Client withdrew their own request → tell the provider, not the client.
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
      SELECT
        p.user_id, 'booking_cancelled', 'Booking Request Withdrawn',
        COALESCE(NEW.customer_name, 'A client') || ' withdrew their request for ' ||
          NEW.service_name_snapshot ||
          ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || '.',
        'medium', FALSE, NEW.id, NEW.provider_id, 'provider'
      FROM public.providers p WHERE p.id = NEW.provider_id;
    ELSE
      -- Provider (or system/cron auto-expire) declined → tell the client.
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
      VALUES (
        NEW.user_id, 'booking_declined', 'Booking Declined',
        'Unfortunately, ' || NEW.provider_name_snapshot ||
          ' is unable to accept your booking for ' ||
          NEW.service_name_snapshot ||
          ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || '.',
        'high', FALSE, NEW.id, NEW.provider_id, 'client'
      );
    END IF;

    -- The slot is free again — invite (or auto-book) the next waitlist entry.
    PERFORM public.invite_next_waitlist_entry(
      NEW.provider_id, NEW.service_id,
      NEW.booking_date, NEW.booking_time, NEW.end_time,
      NEW.base_price, NEW.add_ons_total, NEW.service_charge,
      NEW.service_category_snapshot
    );
    RETURN NEW;
  END IF;

  IF NEW.status = 'in_progress' AND OLD.status != 'in_progress' THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      NEW.user_id, 'booking_in_progress', 'Your Appointment Has Started',
      NEW.provider_name_snapshot || ' has started your ' ||
        NEW.service_name_snapshot || ' appointment.',
      'high', FALSE, NEW.id, NEW.provider_id, 'client'
    );
    RETURN NEW;
  END IF;

  IF NEW.status = 'no_show' AND OLD.status != 'no_show' THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      NEW.user_id, 'no_show', 'Missed Appointment',
      'Your appointment with ' || NEW.provider_name_snapshot ||
        ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') ||
        ' was marked as a no-show.',
      'high', FALSE, NEW.id, NEW.provider_id, 'client'
    );
    RETURN NEW;
  END IF;

  -- Cancelled after confirmation. Notify both sides EXCEPT whoever performed
  -- the cancellation (they already know).
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' AND OLD.status != 'pending' THEN
    SELECT p.user_id INTO v_provider_user_id
      FROM public.providers p WHERE p.id = NEW.provider_id;

    IF v_actor IS NULL OR v_actor != NEW.user_id THEN
      -- Client copy
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, recipient_role)
      VALUES (
        NEW.user_id, 'booking_cancelled', 'Booking Cancelled',
        'Your booking with ' || NEW.provider_name_snapshot ||
          ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || ' has been cancelled.',
        'high', FALSE, NEW.id, 'client'
      );
    END IF;

    IF v_provider_user_id IS NOT NULL
       AND (v_actor IS NULL OR v_actor != v_provider_user_id) THEN
      -- Provider copy
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
      SELECT
        -- Title deliberately differs from the client copy's "Booking Cancelled":
        -- a user who is BOTH a client and a provider receives both rows, and the
        -- push layer sends the title verbatim (send-push-notification/index.ts
        -- does not prefix the business name — it clipped long titles). Identical
        -- titles left such a user unable to tell which hat the alert was for.
        p.user_id, 'booking_cancelled', 'Client Cancelled',
        COALESCE(NEW.customer_name, 'A client') || ' cancelled their ' ||
          NEW.service_name_snapshot ||
          ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || '.',
        'medium', FALSE, NEW.id, NEW.provider_id, 'provider'
      FROM public.providers p WHERE p.id = NEW.provider_id;
    END IF;

    -- The slot is free again — invite (or auto-book) the next waitlist entry.
    PERFORM public.invite_next_waitlist_entry(
      NEW.provider_id, NEW.service_id,
      NEW.booking_date, NEW.booking_time, NEW.end_time,
      NEW.base_price, NEW.add_ons_total, NEW.service_charge,
      NEW.service_category_snapshot
    );
    RETURN NEW;
  END IF;

  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    IF COALESCE((
      SELECT (p.automation_settings->>'autoReviewRequest')::BOOLEAN
        FROM public.providers p WHERE p.id = NEW.provider_id
    ), TRUE) THEN
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
      VALUES (
        NEW.user_id, 'review_request', 'How was your appointment?',
        'Leave a review for ' || NEW.provider_name_snapshot ||
          '. Your feedback helps others find great providers.',
        'medium', TRUE, NEW.id, NEW.provider_id, 'client'
      );
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Trigger itself is unchanged (same name/timing/table as every prior
-- redefinition of this function) — DROP+CREATE only to stay idempotent if
-- this is ever the first file run against a fresh DB.
DROP TRIGGER IF EXISTS on_booking_status_changed ON public.bookings;
CREATE TRIGGER on_booking_status_changed
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.handle_booking_status_change();

-- ── 4. One-off backfill for any pre-existing orphans ───────────────────
--    Confirmed zero rows match this at proposal time (tiny dataset) — kept
--    as a real statement rather than commented-out prose so it's still
--    correct and runnable if that changes before this gets deployed.
UPDATE public.booking_reschedule_requests r
   SET status = 'cancelled', updated_at = NOW()
  FROM public.bookings b
 WHERE b.id = r.booking_id
   AND b.status = 'cancelled'
   AND r.status IN ('pending', 'provider_responded');

-- ============================================================
-- DONE (once reviewed and deployed) — a cancelled booking now closes its
-- own open reschedule request in the same transaction, via the same
-- trigger that already owns cancellation side-effects.
--
-- STILL PENDING, NOT DONE BY THIS FILE:
--   (a) Diff this file's handle_booking_status_change() body against
--       pg_get_functiondef on the live DB (Supabase MCP was unavailable
--       when this file was written) and reconcile before running, per the
--       caveat above.
--   (b) Add 'cancelled' to RescheduleStatus in src/types/database.ts.
--   (c) Add this file to supabase/RUN_ALL_MIGRATIONS.sql.
--   (d) Actually deploy it (SQL editor or apply_migration once approved).
-- None of (a)-(d) have been done as part of writing this file.
-- ============================================================
