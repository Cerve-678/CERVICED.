-- ════════════════════════════════════════════════════════════════════════════
-- fix_provider_no_show_status.sql
--
-- GAP (policy audit, 2026-08-17): `no_show` as a booking status only ever
-- represents the CLIENT not showing up (provider marks it, via
-- provider_update_booking_status()). If a mobile/travelling provider is the
-- one who doesn't show up, there is no status, no notification, and no
-- dispute path — only messaging/reviews after the fact.
--
-- VERIFIED LIVE BEFORE WRITING (pg_get_functiondef / pg_constraint /
-- information_schema, 2026-08-17 — this repo has documented drift between
-- supabase/*.sql files and what's actually deployed, see
-- supabase-migration-tracking-gap in memory):
--   - public.bookings.status is TEXT with CHECK constraint
--     bookings_status_check — NOT a Postgres enum — currently
--     ('pending','confirmed','in_progress','completed','cancelled','no_show',
--     'on_hold'). Extended via the same DROP/ADD CONSTRAINT pattern
--     fix_pending_booking_provider_reminder.sql just used on
--     notifications_type_check.
--   - bookings has NO UPDATE RLS policy at all (only bookings_user_read,
--     bookings_provider_read, bookings_provider_insert) — every status
--     write already goes through a SECURITY DEFINER RPC by construction,
--     not just by convention. client_mark_provider_no_show() below follows
--     that same shape.
--   - handle_booking_status_change() (the trigger that owns every
--     status-change notification) confirmed live via pg_get_functiondef —
--     the client-notify-on-no_show branch this mirrors is
--     `IF NEW.status = 'no_show' AND OLD.status != 'no_show' THEN ...`,
--     inserting recipient_role='client'. This fix adds a parallel branch,
--     recipient_role='provider', for the new status — same trigger, no new
--     trigger object, so notifications stay owned by the DB per this repo's
--     standing rule (never app-side duplicate inserts).
--   - Guardrails mirrored from docs/vault/No-Show.md's documented list for
--     the existing (provider-facing) no_show action: same calendar day as
--     the appointment, appointment start time must have passed, terminal-
--     state check (cannot mark over cancelled/completed/no_show/
--     provider_no_show), and no active reschedule request
--     (booking_reschedule_requests.status IN ('pending','provider_responded')).
--
-- WHO CAN SET IT: the CLIENT, via a new RPC client_mark_provider_no_show(),
-- mirroring how only the provider can set 'no_show' for a client via
-- provider_update_booking_status(). Ownership scoped by b.user_id =
-- auth.uid(), same pattern as cancel_own_booking().
--
-- NO FEE/PENALTY: same deposit-liability boundary as every other
-- status/cancellation rule in this app (see CLAUDE.md) — this status is a
-- record and a provider notification only, never a charge/refund trigger.
--
-- Safe to re-run (CREATE OR REPLACE / idempotent DROP-then-ADD constraint).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Extend bookings_status_check to allow 'provider_no_show' ────────────
ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_status_check CHECK (status = ANY (ARRAY[
    'pending'::text, 'confirmed'::text, 'in_progress'::text,
    'completed'::text, 'cancelled'::text, 'no_show'::text, 'on_hold'::text,
    -- previously missing, added by this fix:
    'provider_no_show'::text
  ]));

-- ── 2. Extend notifications_type_check to allow 'provider_no_show' ─────────
-- Kept as its own distinct type (not reusing 'no_show') for the same reason
-- fix_pending_booking_provider_reminder.sql gave for
-- 'pending_booking_reminder' vs reusing 'booking_pending': the existing
-- 'no_show' type's copy ("Missed Appointment... was marked as a no-show")
-- is written from the client's point of view. Reusing it with only
-- recipient_role flipped would read ambiguously in a provider's own
-- notification history (is this about MY no-show, or a client's?).
-- A distinct type also lets the two directions dedup/filter independently,
-- consistent with how this repo already gives each audience its own type
-- (reschedule_request vs reschedule_provider_response).
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'booking_pending', 'booking_confirmed', 'booking_declined', 'booking_cancelled',
    'booking_reminder', 'booking_in_progress', 'booking_not_started', 'no_show',
    'payment_success', 'new_provider', 'reschedule_request', 'reschedule_provider_response',
    'reschedule_confirmed', 'reschedule_declined', 'review_request', 'review_received', 'promotion',
    'intake_form_reminder', 'intake_form_received', 'intake_form_completed',
    'info_pack_received', 'provider_message', 'announcement', 'balance_reminder',
    'waitlist_slot_available', 'new_message', 'address_released', 'birthday_greeting',
    'post_appt_check_in', 'rebooking_nudge', 'daily_recap', 'schedule_fully_booked',
    'pending_booking_reminder',
    -- previously missing, added by this fix:
    'provider_no_show'
  ));

-- ── 3. client_mark_provider_no_show(uuid) ───────────────────────────────────
-- Client-facing RPC: mark a booking as the PROVIDER having not shown up.
-- Mirrors provider_update_booking_status()'s no_show branch guardrails
-- exactly (same-day, appointment-start-passed, terminal-state, no active
-- reschedule), scoped to the calling client's own booking.
CREATE OR REPLACE FUNCTION public.client_mark_provider_no_show(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_status    text;
  v_booking_date      date;
  v_booking_time      time;
  v_appt_start        timestamp;
  v_active_reschedule boolean;
BEGIN
  SELECT b.status, b.booking_date, b.booking_time
    INTO v_current_status, v_booking_date, v_booking_time
    FROM public.bookings b
   WHERE b.id = p_booking_id
     AND b.user_id = auth.uid()
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  -- Terminal states never transition again through this RPC — mirrors
  -- provider_update_booking_status()'s terminal-state guard, extended to
  -- also block over an existing provider_no_show.
  IF v_current_status IN ('cancelled', 'completed', 'no_show', 'provider_no_show') THEN
    RAISE EXCEPTION 'Booking is already %, no further status changes allowed', v_current_status;
  END IF;

  -- Only makes sense once the booking was actually confirmed/started —
  -- a still-pending request was never accepted, so there's no appointment
  -- to have been missed yet.
  IF v_current_status NOT IN ('confirmed', 'in_progress') THEN
    RAISE EXCEPTION 'Cannot mark provider no-show from status %', v_current_status;
  END IF;

  v_appt_start := (v_booking_date + v_booking_time)::timestamp;

  -- Same calendar day as the appointment (not "any time after start") —
  -- mirrors the no_show guard's same-day tightening documented in
  -- docs/vault/No-Show.md, so a client can't mark a booking from weeks ago.
  IF v_booking_date <> CURRENT_DATE THEN
    RAISE EXCEPTION 'Provider no-show can only be marked on the day of the appointment';
  END IF;

  -- Appointment start time must have passed — can't claim a no-show before
  -- the provider was even due.
  IF NOW() < v_appt_start THEN
    RAISE EXCEPTION 'Cannot mark provider no-show before the appointment start time';
  END IF;

  -- Never while a reschedule offer either party could still act on is
  -- outstanding — same rationale as the client no_show guard: resolve the
  -- live negotiation first rather than short-circuiting it.
  SELECT EXISTS (
    SELECT 1 FROM public.booking_reschedule_requests r
     WHERE r.booking_id = p_booking_id
       AND r.status IN ('pending', 'provider_responded')
  ) INTO v_active_reschedule;
  IF v_active_reschedule THEN
    RAISE EXCEPTION 'Cannot mark provider no-show while a reschedule request is active for this booking';
  END IF;

  UPDATE public.bookings SET status = 'provider_no_show' WHERE id = p_booking_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.client_mark_provider_no_show(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.client_mark_provider_no_show(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.client_mark_provider_no_show(uuid) TO authenticated;

COMMENT ON FUNCTION public.client_mark_provider_no_show(uuid) IS
  'Client-facing reverse of provider_update_booking_status()''s no_show '
  'branch — lets a client mark a booking as the PROVIDER not showing up. '
  'Same guardrails philosophy (same-day, appointment-start-passed, '
  'terminal-state check, no active reschedule request), scoped by '
  'user_id = auth.uid(). See fix_provider_no_show_status.sql.';

-- ── 4. handle_booking_status_change(): notify the PROVIDER when a client
--    marks this — mirrors the existing client-notify-on-no_show branch,
--    trigger-owned per this repo's "DB triggers own notifications, never
--    app-side duplicate inserts" rule. Re-affirms the rest of the live
--    function body unchanged (confirmed via pg_get_functiondef immediately
--    before writing this file) other than adding the new branch. ──────────
CREATE OR REPLACE FUNCTION public.handle_booking_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor              UUID := auth.uid();
  v_provider_user_id   UUID;
  v_representative_id  UUID;
BEGIN

  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    PERFORM public.close_orphaned_reschedule_request(NEW.id);
  END IF;

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

  -- NEW (this fix): reverse direction — a client marked the PROVIDER as
  -- having not shown up. Notify the provider, mirroring the branch above
  -- but recipient_role='provider' and worded from the provider's side.
  IF NEW.status = 'provider_no_show' AND OLD.status != 'provider_no_show' THEN
    SELECT p.user_id INTO v_provider_user_id
      FROM public.providers p WHERE p.id = NEW.provider_id;

    IF v_provider_user_id IS NOT NULL THEN
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
      VALUES (
        v_provider_user_id, 'provider_no_show', 'Client Reported a Missed Appointment',
        COALESCE(NEW.customer_name, 'A client') || ' marked ' ||
          NEW.service_name_snapshot || ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') ||
          ' at ' || TO_CHAR(NEW.booking_time, 'HH12:MI AM') ||
          ' as a missed appointment — you did not show up.',
        'high', FALSE, NEW.id, NEW.provider_id, 'provider'
      );
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' AND OLD.status != 'pending' AND OLD.status != 'on_hold' THEN
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
$function$;

-- ───────────────────────────────────────────────────────────
-- VERIFY
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.bookings'::regclass AND conname = 'bookings_status_check';
--    → expect 'provider_no_show' present
--
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.notifications'::regclass AND conname = 'notifications_type_check';
--    → expect 'provider_no_show' present
--
--   SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'client_mark_provider_no_show';
--   SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'handle_booking_status_change';
--    → expect the new provider_no_show branch present
--
--   SELECT grantee, privilege_type FROM information_schema.routine_privileges
--    WHERE routine_name = 'client_mark_provider_no_show';
--    → expect authenticated only, no anon/public
-- ───────────────────────────────────────────────────────────

-- ============================================================
-- DONE — reverse no-show path: clients can mark a provider as not having
-- shown up via client_mark_provider_no_show(), notified to the provider by
-- the same trigger that owns every other status-change notification.
-- ============================================================
