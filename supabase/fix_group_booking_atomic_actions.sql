-- ============================================================
-- CERVICED — Atomic group-booking actions: confirm/decline/cancel apply to
-- ALL of a provider's own sibling rows in a group_booking_id group at once,
-- not just the one row being viewed. Run this in the Supabase SQL editor,
-- whole file, top to bottom. Safe to re-run.
--
-- CONTEXT: a "group booking" is multiple `bookings` rows sharing one
-- group_booking_id (stamped by BookingContext.tsx post-checkout via
-- updateBookingGroupInfo, keyed on the client's cart bookingBatchId). A
-- single provider can own MULTIPLE rows in one group (e.g. cut+color+
-- treatment booked together with the same provider in one sitting) — a
-- group can ALSO span other providers, who must never be touched by this
-- provider's actions. Every RPC below scopes its WHERE clause to
-- `group_booking_id = X AND provider_id = <caller's own provider id>` —
-- the same two-column filter getGroupBookingSiblings() already uses
-- client-side to read the list. RLS has zero UPDATE policies on `bookings`
-- (confirmed live 2026-08-08) — this WHERE clause is the ONLY enforcement,
-- same as every other bookings-mutating RPC in this codebase.
--
-- WHY ATOMIC, NOT PARTIAL: the ask (see auto-memory) is "no mixed status" —
-- a client's group of 3 services from one provider should never show 2
-- confirmed + 1 still pending. Each RPC below does a two-phase
-- lock-then-validate-then-write: SELECT ... FOR UPDATE locks every sibling
-- row first, validates EVERY row can legally make the transition using the
-- exact same rules as the singular RPC, and only if ALL pass does it write
-- ALL of them in one UPDATE statement. If even one sibling can't legally
-- transition, the whole call raises and NOTHING changes — no torn state,
-- no partial group confirm. This mirrors BookingContext.tsx's own
-- reasoning for per-batch (not per-checkout) reconciliation: a failure in
-- one provider's slice of a group must never silently touch or half-apply
-- to that same provider's other rows either.
--
-- Both RPCs fall back to raising if the booking isn't part of a group at
-- all (group_booking_id IS NULL) — callers should use the existing
-- singular RPCs (provider_update_booking_status / provider_cancel_own_
-- booking) for non-grouped bookings; these two are additive, not a
-- replacement.
-- ============================================================

-- ── 1. provider_update_group_booking_status ─────────────────────────────
-- Same state graph as provider_update_booking_status
-- (fix_provider_status_transition_guard.sql): pending->confirmed,
-- confirmed->in_progress, confirmed/in_progress->no_show|completed (only
-- after appointment start time), terminal states never transition again.
-- 'cancelled' is never a valid target here either — use
-- provider_cancel_group_booking below.
CREATE OR REPLACE FUNCTION public.provider_update_group_booking_status(
  p_group_booking_id UUID,
  p_status TEXT
) RETURNS TABLE(booking_id UUID, new_status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider_id UUID;
  r RECORD;
  v_appt_start TIMESTAMP;
BEGIN
  IF p_status = 'cancelled' THEN
    RAISE EXCEPTION 'Use provider_cancel_group_booking() to cancel a group booking';
  END IF;

  SELECT p.id INTO v_provider_id
    FROM public.providers p WHERE p.user_id = auth.uid();

  IF v_provider_id IS NULL THEN
    RAISE EXCEPTION 'No provider profile for caller';
  END IF;

  -- Phase 1: lock and validate every sibling this provider owns in the
  -- group. Raise (aborting the whole transaction, writing nothing) on the
  -- first row that can't legally make this transition.
  FOR r IN
    SELECT b.id, b.status, b.booking_date, b.booking_time
      FROM public.bookings b
     WHERE b.group_booking_id = p_group_booking_id
       AND b.provider_id = v_provider_id
     FOR UPDATE OF b
  LOOP
    IF r.status IN ('cancelled', 'completed', 'no_show') THEN
      RAISE EXCEPTION 'Booking % is already %, no further status changes allowed', r.id, r.status;
    END IF;

    v_appt_start := (r.booking_date + r.booking_time)::timestamp;

    IF r.status = 'pending' THEN
      IF p_status <> 'confirmed' THEN
        RAISE EXCEPTION 'Invalid status transition for booking %: % -> %', r.id, r.status, p_status;
      END IF;

    ELSIF r.status = 'confirmed' THEN
      IF p_status = 'in_progress' THEN
        NULL;
      ELSIF p_status IN ('no_show', 'completed') THEN
        IF v_appt_start >= NOW() THEN
          RAISE EXCEPTION 'Cannot mark % before the appointment start time (booking %)', p_status, r.id;
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition for booking %: % -> %', r.id, r.status, p_status;
      END IF;

    ELSIF r.status = 'in_progress' THEN
      IF p_status = 'completed' THEN
        NULL;
      ELSIF p_status = 'no_show' THEN
        IF v_appt_start >= NOW() THEN
          RAISE EXCEPTION 'Cannot mark no_show before the appointment start time (booking %)', r.id;
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition for booking %: % -> %', r.id, r.status, p_status;
      END IF;

    ELSE
      RAISE EXCEPTION 'Unrecognized current status for booking %: %', r.id, r.status;
    END IF;
  END LOOP;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No bookings found in this group for the calling provider';
  END IF;

  -- Phase 2: every row validated — write them all in one statement.
  RETURN QUERY
    UPDATE public.bookings b
       SET status = p_status
     WHERE b.group_booking_id = p_group_booking_id
       AND b.provider_id = v_provider_id
    RETURNING b.id, b.status;
END;
$$;

REVOKE ALL ON FUNCTION public.provider_update_group_booking_status(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provider_update_group_booking_status(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.provider_update_group_booking_status(uuid, text) TO authenticated;

-- ── 2. provider_cancel_group_booking ─────────────────────────────────────
-- Same terminal-state check as provider_cancel_own_booking
-- (booking_rules_server_enforcement.sql). No notice-window check on the
-- provider side — matches the singular RPC (only the client-side
-- cancel_own_booking has a notice-hours gate).
CREATE OR REPLACE FUNCTION public.provider_cancel_group_booking(
  p_group_booking_id UUID
) RETURNS TABLE(booking_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider_id UUID;
  r RECORD;
BEGIN
  SELECT p.id INTO v_provider_id
    FROM public.providers p WHERE p.user_id = auth.uid();

  IF v_provider_id IS NULL THEN
    RAISE EXCEPTION 'No provider profile for caller';
  END IF;

  FOR r IN
    SELECT b.id, b.status
      FROM public.bookings b
     WHERE b.group_booking_id = p_group_booking_id
       AND b.provider_id = v_provider_id
     FOR UPDATE OF b
  LOOP
    IF r.status IN ('cancelled', 'completed', 'no_show') THEN
      RAISE EXCEPTION 'Booking % can no longer be cancelled (already %)', r.id, r.status;
    END IF;
  END LOOP;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No bookings found in this group for the calling provider';
  END IF;

  RETURN QUERY
    UPDATE public.bookings b
       SET status = 'cancelled'
     WHERE b.group_booking_id = p_group_booking_id
       AND b.provider_id = v_provider_id
    RETURNING b.id;
END;
$$;

REVOKE ALL ON FUNCTION public.provider_cancel_group_booking(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provider_cancel_group_booking(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.provider_cancel_group_booking(uuid) TO authenticated;

-- ── 3. handle_booking_status_change() — cancellation branches made
--    group-aware, same representative-row pattern as the booking_confirmed
--    branch. Every other branch (declined-while-pending's non-withdrawal
--    path, in_progress, no_show, completed/review_request) is copied over
--    UNCHANGED from the live body confirmed via pg_get_functiondef
--    immediately before writing this file — see the note atop Part 3 of
--    fix_reschedule_flow_completion.sql about why re-verifying the FULL
--    live body (not just this file's own diff target) before every
--    redeploy of this function is now a standing discipline here. ────────
--
-- invite_next_waitlist_entry() deliberately still fires ONCE PER ROW (not
-- gated by the representative check) — each sibling is a DIFFERENT
-- provider slot (different service/time), so each one freeing up is its
-- own independent waitlist-invite opportunity; collapsing that to "invite
-- for just the representative's slot" would silently stop re-offering the
-- other N-1 freed slots.
CREATE OR REPLACE FUNCTION public.handle_booking_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_actor              UUID := auth.uid();
  v_provider_user_id   UUID;
  v_representative_id  UUID;
BEGIN

  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    PERFORM public.close_orphaned_reschedule_request(NEW.id);
  END IF;

  -- Provider confirmed: pending → confirmed. Group-aware: only the
  -- earliest-appointment sibling in a group_booking_id group sends, phrased
  -- for the whole group. Ungrouped bookings unchanged.
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
  -- Group-aware for the provider-decline path (client sees ONE "declined"
  -- notice for the whole group, phrased with the count) — the withdrawal
  -- path (client cancelling their own pending request) is NOT grouped: the
  -- client is the one acting, so they already know what they did; this
  -- notifies the PROVIDER, and a provider only ever owns a subset of a
  -- cross-provider group anyway, so "the client withdrew" is inherently a
  -- per-provider fact, not a per-group one — no dedup needed on that side.
  IF NEW.status = 'cancelled' AND OLD.status = 'pending' THEN
    IF v_actor IS NOT NULL AND v_actor = NEW.user_id THEN
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
      IF NEW.group_booking_id IS NOT NULL THEN
        SELECT id INTO v_representative_id
          FROM public.bookings
         WHERE group_booking_id = NEW.group_booking_id
           AND user_id = NEW.user_id
           AND provider_id = NEW.provider_id
         ORDER BY booking_date ASC, booking_time ASC, id ASC
         LIMIT 1;

        IF v_representative_id = NEW.id THEN
          INSERT INTO public.notifications
            (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
          VALUES (
            NEW.user_id, 'booking_declined', 'Booking Declined',
            'Unfortunately, ' || NEW.provider_name_snapshot ||
              ' is unable to accept your ' || COALESCE(NEW.group_booking_count, 1)::TEXT ||
              ' requested service(s), starting with ' || NEW.service_name_snapshot ||
              ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || '.',
            'high', FALSE, NEW.id, NEW.provider_id, 'client'
          );
        END IF;
      ELSE
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
    END IF;

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

  -- Cancelled after confirmation (user or provider cancels a confirmed
  -- booking). Group-aware on BOTH the client copy and the provider copy —
  -- each scoped to (group_booking_id, user_id, provider_id) so a
  -- cross-provider group's OTHER provider's siblings never gate or get
  -- counted into this provider's representative check.
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' AND OLD.status != 'pending' THEN
    SELECT p.user_id INTO v_provider_user_id
      FROM public.providers p WHERE p.id = NEW.provider_id;

    IF NEW.group_booking_id IS NOT NULL THEN
      SELECT id INTO v_representative_id
        FROM public.bookings
       WHERE group_booking_id = NEW.group_booking_id
         AND user_id = NEW.user_id
         AND provider_id = NEW.provider_id
       ORDER BY booking_date ASC, booking_time ASC, id ASC
       LIMIT 1;

      IF v_representative_id = NEW.id THEN
        IF v_actor IS NULL OR v_actor != NEW.user_id THEN
          INSERT INTO public.notifications
            (user_id, type, title, message, priority, is_actionable, booking_id, recipient_role)
          VALUES (
            NEW.user_id, 'booking_cancelled', 'Booking Cancelled',
            'Your ' || COALESCE(NEW.group_booking_count, 1)::TEXT || ' service(s) with ' ||
              NEW.provider_name_snapshot || ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') ||
              ' have been cancelled.',
            'high', FALSE, NEW.id, 'client'
          );
        END IF;

        IF v_provider_user_id IS NOT NULL
           AND (v_actor IS NULL OR v_actor != v_provider_user_id) THEN
          INSERT INTO public.notifications
            (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
          SELECT
            p.user_id, 'booking_cancelled', 'Client Cancelled',
            COALESCE(NEW.customer_name, 'A client') || ' cancelled their ' ||
              COALESCE(NEW.group_booking_count, 1)::TEXT || ' service(s) on ' ||
              TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || '.',
            'medium', FALSE, NEW.id, NEW.provider_id, 'provider'
          FROM public.providers p WHERE p.id = NEW.provider_id;
        END IF;
      END IF;
    ELSE
      IF v_actor IS NULL OR v_actor != NEW.user_id THEN
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
        INSERT INTO public.notifications
          (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
        SELECT
          p.user_id, 'booking_cancelled', 'Client Cancelled',
          COALESCE(NEW.customer_name, 'A client') || ' cancelled their ' ||
            NEW.service_name_snapshot ||
            ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || '.',
          'medium', FALSE, NEW.id, NEW.provider_id, 'provider'
        FROM public.providers p WHERE p.id = NEW.provider_id;
      END IF;
    END IF;

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

REVOKE ALL ON FUNCTION public.handle_booking_status_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_booking_status_change() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_booking_status_change() FROM authenticated;

-- ── Verification ─────────────────────────────────────────────────────────
-- After applying, both markers must be present:
--   select pg_get_functiondef('public.handle_booking_status_change') like '%group_booking_id%'; -- true
--   select pg_get_functiondef('public.handle_booking_status_change') like '%close_orphaned_reschedule_request%'; -- true
-- And a 3-service group-cancel-by-provider should produce exactly 1
-- 'booking_cancelled' notification for the client and 1 for the provider
-- (if the provider wasn't the actor), not 3 each:
--   select recipient_role, count(*) from notifications
--   where booking_id in (select id from bookings where group_booking_id = '<group id>')
--     and type = 'booking_cancelled'
--   group by recipient_role;
-- ============================================================
