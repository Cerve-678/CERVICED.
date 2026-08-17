-- ============================================================
-- CERVICED — Complete the reschedule request/respond/confirm/decline loop
-- DEPLOYED LIVE 2026-08-08 via Supabase MCP apply_migration. Confirmed via
-- pg_get_functiondef/pg_get_function_identity_arguments on all 6 functions
-- plus both triggers' tgenabled. Safe to re-run (CREATE OR REPLACE +
-- idempotent DROP/ADD CONSTRAINT).
--
-- Verified against live project ztrfpfvvejzaysrelmfm on 2026-08-08 via
-- pg_get_functiondef / pg_policies / pg_get_constraintdef / pg_trigger —
-- not against file contents alone, per this repo's migration-drift history.
--
-- ------------------------------------------------------------
-- WHAT THIS FILE DOES (three previously-separate gaps, closed together
-- because all three touch the same table/trigger)
-- ------------------------------------------------------------
-- 1. ORPHANED REQUESTS ON CANCELLATION (carried over from
--    fix_reschedule_requests_orphaned_on_cancellation.sql, folded in here
--    instead of applied standalone, since part 3 below rewrites the same
--    handle_booking_status_change() function this file's part 1 also
--    touches — two separate CREATE OR REPLACE of the same function in two
--    files would leave whichever ran second as the only one that matters,
--    silently dropping the other's addition. Re-verified line-for-line
--    against that file's already-reviewed body; nothing here changes its
--    reasoning, only merges it with part 3's changes to the same function.)
--
-- 2. NO DECLINE PATH (Gap 1 from the original "wire up reschedule
--    properly" ask). Two new RPCs:
--      - reject_reschedule_request(uuid, text): PROVIDER declines a
--        pending client request outright — no alternative slots required
--        (distinct from the existing "Apologise" flow in
--        respond_to_reschedule_request, which still requires >=1 proposed
--        slot). Booking is untouched; it stays on its original confirmed
--        date/time.
--      - decline_reschedule_offer(uuid): CLIENT declines a
--        provider_responded offer instead of silently abandoning the
--        screen. Booking is untouched.
--    Both set status='rejected' — the value already present in
--    booking_reschedule_requests_status_check and in RescheduleStatus
--    (src/types/database.ts) since the table was first designed, but never
--    written by any RPC until now (confirmed via pg_get_functiondef on all
--    5 live reschedule RPCs before writing this file).
--
-- 3. NOTIFICATIONS ARE APP-SIDE, NOT TRIGGER-OWNED (Gap 3). Today,
--    reschedule notifications are sent via ad-hoc
--    insertBookingUserNotification()/insertProviderNotification() calls
--    from ProviderBookingDetailScreen.tsx and BookingContext.tsx — the one
--    place in this app that breaks the documented convention that DB
--    triggers own status-change notifications (see auto-memory
--    booking-notifications-architecture.md). Two notifications were also
--    completely missing: the provider was never told a client requested a
--    reschedule (until a 4h-later cron nudge) or confirmed one at all.
--    This file adds a dedicated trigger on booking_reschedule_requests
--    (AFTER INSERT OR UPDATE OF status) that owns all six lifecycle
--    notifications: client requests, provider responds (with/without
--    apology), provider initiates directly, client confirms, provider
--    declines, client declines. The app-side insert calls for these events
--    are removed in the same pass (see the app-side changes note at the
--    bottom of this file) so there is exactly one writer, not two racing
--    or duplicating.
--
--    A dedicated trigger on booking_reschedule_requests (not folded into
--    handle_booking_status_change()) because the state that actually
--    changes here lives on THIS table, not bookings — same reasoning
--    fix_reschedule_requests_orphaned_on_cancellation.sql used for why the
--    cancellation-orphan fix belongs on the bookings trigger instead: each
--    side effect lives on the trigger that owns the table where the
--    triggering column actually changed.
--
-- ------------------------------------------------------------
-- NEW NOTIFICATION TYPE
-- ------------------------------------------------------------
-- 'reschedule_declined' added to notifications_type_check — none of the
-- three existing reschedule notification types ('reschedule_request',
-- 'reschedule_provider_response', 'reschedule_confirmed') fit a decline;
-- reusing 'reschedule_provider_response' for a provider's decline would
-- make the client's UI (which currently treats that type as "tap to view
-- offered times", see ProviderChatScreen/NotificationsScreen is_actionable
-- routing) show a "pick a time" affordance for a request that has no times
-- to pick. Also added to src/types/database.ts's NotificationType in the
-- same pass (see bottom-of-file app-side changes note).
--
-- ------------------------------------------------------------
-- WHY DECLINE DOESN'T TOUCH bookings AT ALL
-- ------------------------------------------------------------
-- Both new RPCs only ever write booking_reschedule_requests.status. The
-- booking itself was never modified by a request/response in the first
-- place (only confirm_reschedule_own_booking touches bookings.booking_date
-- /booking_time) — so "declining" a reschedule is really just closing the
-- conversation, not reverting anything. This matches how cancellation
-- already closes a request via close_orphaned_reschedule_request() (part 1
-- above): a status flip on this table, nothing else.
-- ============================================================

-- ── PART 1: widen the status CHECK constraint (adds 'cancelled'; 'rejected'
--    already existed in this constraint since phase1_schema.sql, but was
--    previously unreachable — no RPC ever wrote it until part 2 below) ──
ALTER TABLE public.booking_reschedule_requests
  DROP CONSTRAINT IF EXISTS booking_reschedule_requests_status_check;

ALTER TABLE public.booking_reschedule_requests
  ADD CONSTRAINT booking_reschedule_requests_status_check
  CHECK (status IN (
    'pending', 'provider_responded', 'confirmed', 'rejected', 'cancelled'
  ));

-- New notification type for decline events (see rationale above).
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'booking_pending','booking_confirmed','booking_declined','booking_cancelled',
    'booking_reminder','booking_in_progress','booking_not_started','no_show',
    'payment_success','new_provider',
    'reschedule_request','reschedule_provider_response','reschedule_confirmed',
    'reschedule_declined',
    'review_request','review_received','promotion',
    'intake_form_reminder','intake_form_received','intake_form_completed',
    'info_pack_received','provider_message','announcement','balance_reminder',
    'waitlist_slot_available','new_message','address_released','birthday_greeting',
    'post_appt_check_in','rebooking_nudge','daily_recap','schedule_fully_booked'
  ));

-- ── PART 2: close-on-cancellation helper (body unchanged from the original
--    proposal; REVOKE/GRANT block added below — flagged by security review
--    of this file: the original proposal's comment claimed "only ever
--    called from inside another SECURITY DEFINER trigger, never called
--    directly by a client" as its safety argument, but that's not how
--    Postgres/PostgREST privileges work — CREATE FUNCTION grants EXECUTE to
--    PUBLIC by default, and Supabase exposes every public-schema function
--    as an RPC endpoint unless explicitly revoked. This function has NO
--    auth.uid() ownership check to fall back on (unlike every other RPC in
--    this file), so without an explicit revoke it would let an anonymous
--    caller close any pending/provider_responded reschedule request on any
--    booking by guessing/enumerating booking ids. Same reasoning
--    waitlist_holds.sql:533 already documents for this exact pitfall.) ──
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

-- Only ever invoked via PERFORM from inside handle_booking_status_change()
-- (which itself runs as the trigger owner) — no caller, including
-- 'authenticated', should be able to reach this directly.
REVOKE ALL ON FUNCTION public.close_orphaned_reschedule_request(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.close_orphaned_reschedule_request(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.close_orphaned_reschedule_request(uuid) FROM authenticated;

-- ── PART 3: re-apply handle_booking_status_change() with the
--    close-orphaned-request addition, MERGED with the group_booking_id-aware
--    booking_confirmed branch from fix_group_booking_notification_dedup.sql
--    (deployed 2026-08-08, BEFORE this file). Live history: this file was
--    originally deployed with the old pre-group-fix baseline body, which
--    silently reverted that fix (the exact "two CREATE OR REPLACE of the
--    same function, second deploy wins" trap this file's own header warned
--    about in the abstract but didn't actually avoid). Caught and re-merged
--    live the same session (2026-08-08) — this file is now updated to match
--    what's actually live, so re-running it from scratch on a fresh
--    environment reproduces the CORRECT merged behavior, not the bug. ──
CREATE OR REPLACE FUNCTION public.handle_booking_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_actor              UUID := auth.uid();  -- NULL when cron / service role
  v_provider_user_id   UUID;
  v_representative_id  UUID;
BEGIN

  -- Close any open reschedule request the moment this booking is
  -- cancelled, from whichever prior state. No-op (0 rows) for any booking
  -- that never had one, or whose request was already confirmed/rejected/
  -- cancelled — see close_orphaned_reschedule_request()'s WHERE clause.
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    PERFORM public.close_orphaned_reschedule_request(NEW.id);
  END IF;

  -- Provider confirmed: pending → confirmed. Group-aware (see
  -- fix_group_booking_notification_dedup.sql): only the earliest-appointment
  -- sibling in a group_booking_id group sends, phrased for the whole group
  -- using group_booking_count. Ungrouped bookings unchanged.
  IF NEW.status = 'confirmed' AND OLD.status = 'pending' THEN
    IF NEW.group_booking_id IS NOT NULL THEN
      SELECT id INTO v_representative_id
        FROM public.bookings
       WHERE group_booking_id = NEW.group_booking_id
         AND user_id = NEW.user_id
       ORDER BY booking_date ASC, booking_time ASC, id ASC
       LIMIT 1;

      IF v_representative_id = NEW.id THEN
        INSERT INTO public.notifications
          (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
        VALUES (
          NEW.user_id,
          'booking_confirmed',
          'Booking Confirmed! 🎉',
          COALESCE(NEW.group_booking_count, 1)::TEXT || ' of your services have been confirmed, starting with ' ||
            NEW.service_name_snapshot || ' with ' || NEW.provider_name_snapshot ||
            ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') ||
            ' at ' || TO_CHAR(NEW.booking_time, 'HH12:MI AM') || '.',
          'high', TRUE, NEW.id, NEW.provider_id, 'client'
        );
      END IF;
      RETURN NEW;
    END IF;

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

DROP TRIGGER IF EXISTS on_booking_status_changed ON public.bookings;
CREATE TRIGGER on_booking_status_changed
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.handle_booking_status_change();

-- Defense in depth: trigger functions aren't invoked via PostgREST RPC in
-- normal use (nothing in the app calls them directly), but an explicit
-- revoke costs nothing and matches this file's stated discipline of never
-- relying on "nothing calls this directly" as the only safety argument.
REVOKE ALL ON FUNCTION public.handle_booking_status_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_booking_status_change() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_booking_status_change() FROM authenticated;

-- One-off backfill for any pre-existing orphans (idempotent, safe to re-run).
UPDATE public.booking_reschedule_requests r
   SET status = 'cancelled', updated_at = NOW()
  FROM public.bookings b
 WHERE b.id = r.booking_id
   AND b.status = 'cancelled'
   AND r.status IN ('pending', 'provider_responded');

-- ── PART 4: decline RPCs ────────────────────────────────────────────────

-- Provider declines a pending client request outright. Distinct from
-- respond_to_reschedule_request's "Apologise" path, which still requires
-- >=1 proposed slot — this requires none. Booking stays exactly where it
-- is; only the request row closes.
CREATE OR REPLACE FUNCTION public.reject_reschedule_request(
  p_booking_id UUID,
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
     SET status = 'rejected',
         response_note = p_response_note,
         updated_at = NOW()
   WHERE booking_id = p_booking_id;
END;
$$;

-- Client declines a provider_responded offer instead of silently
-- abandoning the screen. Symmetrical to reject_reschedule_request above.
-- Booking stays exactly where it is; only the request row closes.
CREATE OR REPLACE FUNCTION public.decline_reschedule_offer(
  p_booking_id UUID
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
    WHERE r.booking_id = p_booking_id
      AND b.user_id = auth.uid()
      AND r.status = 'provider_responded'
    FOR UPDATE OF r
  ) INTO v_found;

  IF NOT v_found THEN
    RAISE EXCEPTION 'No provider-responded reschedule request found for this booking';
  END IF;

  UPDATE public.booking_reschedule_requests
     SET status = 'rejected',
         updated_at = NOW()
   WHERE booking_id = p_booking_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_reschedule_request(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_reschedule_request(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.reject_reschedule_request(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.decline_reschedule_offer(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decline_reschedule_offer(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.decline_reschedule_offer(uuid) TO authenticated;

-- response_note column for a provider's optional decline/apology reason
-- (surfaced to the client via the trigger-owned notification in part 5
-- below). Used by both reject_reschedule_request above and the redefined
-- respond_to_reschedule_request below (the existing "Apologise" toggle in
-- ProviderBookingDetailScreen.tsx already collects this text — it was
-- being passed straight to an ad-hoc app-side notification insert before
-- this file; now it's persisted so the trigger can read it back).
ALTER TABLE public.booking_reschedule_requests
  ADD COLUMN IF NOT EXISTS response_note TEXT;

-- Redefine respond_to_reschedule_request to accept the optional apology
-- note (new 3rd param, defaulted so existing callers with the 2-arg form
-- keep working without a client-side signature change being mandatory —
-- though the app IS updated in this pass to pass it, see bottom-of-file
-- note). Ownership/status checks unchanged from
-- fix_reschedule_request_rls_forgery_gap.sql's original body.
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
END;
$$;

REVOKE ALL ON FUNCTION public.respond_to_reschedule_request(uuid, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.respond_to_reschedule_request(uuid, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.respond_to_reschedule_request(uuid, jsonb, text) TO authenticated;

-- The old 2-arg overload is superseded — drop it so the app can't
-- accidentally call a version that silently drops the apology text.
DROP FUNCTION IF EXISTS public.respond_to_reschedule_request(uuid, jsonb);

-- ── PART 5: trigger-owned reschedule notifications ─────────────────────
-- Fires on INSERT (client request, or provider-initiated upsert landing
-- directly as provider_responded) and on UPDATE OF status (provider
-- responds/declines, client confirms/declines). Mirrors
-- handle_booking_status_change()'s actor-aware style: v_actor identifies
-- who made the write so the notification goes to the OTHER party.
CREATE OR REPLACE FUNCTION public.handle_reschedule_request_change()
RETURNS TRIGGER AS $$
DECLARE
  v_actor            UUID := auth.uid();
  v_booking          RECORD;
  v_provider_user_id UUID;
BEGIN
  SELECT b.user_id, b.provider_id, b.customer_name,
         b.provider_name_snapshot, b.service_name_snapshot
    INTO v_booking
    FROM public.bookings b
   WHERE b.id = NEW.booking_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT p.user_id INTO v_provider_user_id
    FROM public.providers p WHERE p.id = v_booking.provider_id;

  -- INSERT: either a fresh client request (status='pending'), or a
  -- provider-initiated reschedule landing directly as 'provider_responded'
  -- (provider_initiate_reschedule's ON CONFLICT DO UPDATE path re-fires
  -- this trigger as an UPDATE on a second call, handled below instead).
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'pending' THEN
      -- Client requested → notify provider (was previously silent app-side
      -- until a 4h cron nudge; now immediate and trigger-owned).
      IF v_provider_user_id IS NOT NULL THEN
        INSERT INTO public.notifications
          (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
        VALUES (
          v_provider_user_id, 'reschedule_request', 'Reschedule Request',
          COALESCE(v_booking.customer_name, 'A client') || ' wants to reschedule their ' ||
            v_booking.service_name_snapshot || ' appointment.',
          'high', TRUE, NEW.id, v_booking.provider_id, 'provider'
        );
      END IF;
    ELSIF NEW.status = 'provider_responded' THEN
      -- Provider-initiated reschedule (first call, INSERT path) → notify client.
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
      VALUES (
        v_booking.user_id, 'reschedule_request', v_booking.provider_name_snapshot || ' needs to reschedule',
        v_booking.provider_name_snapshot || ' has proposed new times for your ' ||
          v_booking.service_name_snapshot || ' appointment.',
        'high', TRUE, NEW.id, v_booking.provider_id, 'client'
      );
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE OF status: respond / initiate-again / confirm / decline / re-request.
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN

    IF NEW.status = 'pending' THEN
      -- Client re-requested after a prior request on this booking was
      -- already closed (rejected/cancelled/confirmed) — request_reschedule_
      -- own_booking() upserts onto the same row (UNIQUE(booking_id)), so
      -- this is an UPDATE, not the INSERT branch above, even though from
      -- the client's perspective it's a brand new request. Same notification
      -- as the INSERT/'pending' case.
      IF v_provider_user_id IS NOT NULL THEN
        INSERT INTO public.notifications
          (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
        VALUES (
          v_provider_user_id, 'reschedule_request', 'Reschedule Request',
          COALESCE(v_booking.customer_name, 'A client') || ' wants to reschedule their ' ||
            v_booking.service_name_snapshot || ' appointment.',
          'high', TRUE, NEW.id, v_booking.provider_id, 'provider'
        );
      END IF;

    ELSIF NEW.status = 'provider_responded' THEN
      -- Provider responded to a pending client request, OR re-proposed
      -- slots via provider_initiate_reschedule's UPDATE path → notify client.
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
      VALUES (
        v_booking.user_id, 'reschedule_provider_response',
        CASE WHEN NEW.response_note IS NOT NULL
          THEN v_booking.provider_name_snapshot || ' can''t make those dates'
          ELSE 'Provider Responded' END,
        COALESCE(NEW.response_note,
          v_booking.provider_name_snapshot || ' has shared available dates for your reschedule request.'),
        'high', TRUE, NEW.id, v_booking.provider_id, 'client'
      );

    ELSIF NEW.status = 'confirmed' THEN
      -- Client confirmed a provider-offered slot → notify provider (this
      -- direction had NO notification at all before this file).
      IF v_provider_user_id IS NOT NULL THEN
        INSERT INTO public.notifications
          (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
        VALUES (
          v_provider_user_id, 'reschedule_confirmed', 'Reschedule Confirmed',
          COALESCE(v_booking.customer_name, 'A client') || ' confirmed the new time for their ' ||
            v_booking.service_name_snapshot || ' appointment.',
          'medium', FALSE, NEW.id, v_booking.provider_id, 'provider'
        );
      END IF;

    ELSIF NEW.status = 'rejected' THEN
      -- Either party declined — tell the other one. v_actor distinguishes
      -- which side just wrote this row (RPC-enforced: only the owning
      -- party's RPC can reach this transition, see reject_reschedule_request
      -- / decline_reschedule_offer's ownership checks — both are
      -- 'authenticated'-only, user-invoked, so v_actor is never NULL on any
      -- reachable path today. If a future service-role/cron caller ever
      -- writes 'rejected' directly, this falls into the ELSE branch and
      -- would misroute as a client decline — not reachable now, flagged so
      -- nobody adds such a caller without also fixing this branch).
      IF v_actor IS NOT NULL AND v_actor = v_provider_user_id THEN
        -- Provider declined → notify client.
        INSERT INTO public.notifications
          (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
        VALUES (
          v_booking.user_id, 'reschedule_declined', 'Reschedule Declined',
          COALESCE(NEW.response_note,
            v_booking.provider_name_snapshot || ' was unable to accommodate your reschedule request. Your original appointment time stands.'),
          'high', FALSE, NEW.id, v_booking.provider_id, 'client'
        );
      ELSE
        -- Client declined the offered times → notify provider.
        IF v_provider_user_id IS NOT NULL THEN
          INSERT INTO public.notifications
            (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
          VALUES (
            v_provider_user_id, 'reschedule_declined', 'Reschedule Times Declined',
            COALESCE(v_booking.customer_name, 'A client') || ' declined the offered times for their ' ||
              v_booking.service_name_snapshot || ' appointment. Their original appointment time stands.',
            'medium', FALSE, NEW.id, v_booking.provider_id, 'provider'
          );
        END IF;
      END IF;
    END IF;
    -- 'cancelled' transitions (via close_orphaned_reschedule_request, run
    -- by the system/service-role trigger context, not a user action) are
    -- deliberately silent — the booking's own cancellation notification
    -- (handle_booking_status_change()) already tells both parties the
    -- appointment is off; a second "your reschedule was cancelled" would
    -- be redundant noise about the same event.

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS on_reschedule_request_changed ON public.booking_reschedule_requests;
CREATE TRIGGER on_reschedule_request_changed
  AFTER INSERT OR UPDATE OF status ON public.booking_reschedule_requests
  FOR EACH ROW EXECUTE FUNCTION public.handle_reschedule_request_change();

REVOKE ALL ON FUNCTION public.handle_reschedule_request_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_reschedule_request_change() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_reschedule_request_change() FROM authenticated;

-- ── PART 6: requested_dates TEXT[]/DATE[] type mismatch (folded in from
--    fix_reschedule_requested_dates_type_mismatch.sql, which was written
--    2026-08-01 but never actually applied live — confirmed via
--    pg_get_functiondef this session: the live request_reschedule_own_booking()
--    still inserts p_preferred_dates directly with no split/cast, which
--    fails at statement-analysis time with 42804 "column requested_dates is
--    of type date[] but expression is of type text[]" on EVERY call. This
--    is what a client actually hit live today (2026-08-08) requesting a
--    reschedule — the INSERT this file's Part 5 trigger depends on never
--    even reaches the trigger, since Postgres rejects the whole statement
--    before it executes. Folded in here rather than applied as its own
--    separate file since it's the same function this task's flow depends
--    on end-to-end, and leaving it as a second pending file risks the same
--    "written but never run" fate its own history already shows once.
--    Body identical to that file's fix — see its comments for the full
--    bug analysis; not repeated here. ──
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
  -- (cast to DATE) and time (preserved, not dropped, in requested_times).
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

REVOKE ALL ON FUNCTION public.request_reschedule_own_booking(uuid, text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.request_reschedule_own_booking(uuid, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.request_reschedule_own_booking(uuid, text[]) TO authenticated;

-- requested_times (TEXT[]) column — needed by the function above.
-- Idempotent; already present if fix_reschedule_requested_dates_type_mismatch.sql
-- was in fact run on this environment despite the live function body
-- showing otherwise (belt-and-braces, matches that file's own ADD COLUMN
-- IF NOT EXISTS).
ALTER TABLE public.booking_reschedule_requests
  ADD COLUMN IF NOT EXISTS requested_times TEXT[];

-- ============================================================
-- DONE (once reviewed and deployed):
--   - Orphaned reschedule requests close automatically on cancellation.
--   - Both parties can decline a reschedule outright (no forced
--     counter-proposal), via reject_reschedule_request /
--     decline_reschedule_offer.
--   - All 6 reschedule lifecycle notifications (request, respond,
--     provider-initiate, confirm, provider-decline, client-decline) are
--     trigger-owned, matching handle_booking_status_change()'s convention
--     — no more ad-hoc app-side insertBookingUserNotification/
--     insertProviderNotification calls for these events.
--   - request_reschedule_own_booking()'s TEXT[]/DATE[] type mismatch is
--     fixed (Part 6) — this was blocking every reschedule request live,
--     confirmed by a client hitting it directly (42804) on 2026-08-08
--     while this file was still in review, before Part 6 existed.
--
-- APP-SIDE CHANGES ALREADY LANDED (same pass, not by this file itself):
--   RescheduleStatus gained 'cancelled' (it already had 'rejected');
--   NotificationType gained 'reschedule_declined'; databaseService.ts has
--   rejectRescheduleRequest/declineRescheduleOffer wrapping the two new
--   RPCs, and respondToRescheduleRequest takes a 3rd optional responseNote
--   arg; the app-side insertBookingUserNotification/insertProviderNotification
--   calls in ProviderBookingDetailScreen.tsx (handleRespondSubmit,
--   handleInitRescheduleSubmit) and BookingContext.tsx (requestReschedule,
--   confirmReschedule) are removed (now redundant — the trigger sends
--   these); ProviderBookingDetailScreen.tsx has a real Decline button in
--   the respond modal; RescheduleScreen.tsx has a decline action for the
--   hasProviderResponse case; BookingContext.tsx's realtime subscription
--   and catch-up sweep both handle a live 'rejected' status (new
--   applyRejection helper) by clearing local pending state, not just
--   reacting to provider_available_slots appearing.
--
-- DONE, POST-DEPLOY:
--   (a) Registered in supabase/RUN_ALL_MIGRATIONS.sql's required-follow-up
--       list (11th entry).
--   (b) Deployed live 2026-08-08 via apply_migration — this also supersedes
--       fix_reschedule_requests_orphaned_on_cancellation.sql and
--       fix_reschedule_requested_dates_type_mismatch.sql as standalone
--       files; their content is folded in here and they should not be run
--       separately.
--   (c) CAUGHT AND FIXED LIVE 2026-08-08, same session: the initial deploy
--       of Part 3's handle_booking_status_change() used the body written
--       above BEFORE this fix was merged with
--       fix_group_booking_notification_dedup.sql's group-aware
--       booking_confirmed branch (deployed earlier the same day) — so the
--       first deploy of this file silently reverted that fix. Caught via a
--       follow-up pg_get_functiondef check, fixed with a second
--       apply_migration merging both changes into one body (now reflected
--       in Part 3 above), re-verified live. Lesson: when two fix files
--       CREATE OR REPLACE the same function, the one applied LAST wins
--       regardless of file header claims — always re-verify group_aware /
--       whatever the other fix's marker was via pg_get_functiondef
--       immediately after deploying a second file that touches the same
--       function.
--
-- STILL PENDING, NOT DONE:
--   (a) Follow-up, out of scope here: 6 pre-existing reschedule/cancellation
--       RPCs (provider_initiate_reschedule, request_reschedule_own_booking
--       itself, confirm_reschedule_own_booking, cancel_own_booking,
--       provider_cancel_own_booking) were found live-anon-executable during
--       security review of this file, despite fix_reschedule_request_rls_
--       forgery_gap.sql apparently intending to revoke that — its REVOKE
--       statements never took effect live. Each RPC's internal auth.uid()
--       check still blocks anon callers today, so this isn't exploitable
--       right now, but it's a standing drift worth a dedicated
--       cerviced-migration-drift pass, not silently fixed here.
-- ============================================================
