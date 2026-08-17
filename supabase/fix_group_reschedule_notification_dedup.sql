-- ============================================================
-- CERVICED — Dedup reschedule notifications for group bookings.
-- Run this in the Supabase SQL editor, whole file, top to bottom.
-- Safe to re-run.
--
-- PROBLEM: handle_reschedule_request_change() (fix_reschedule_flow_
-- completion.sql) fires per-ROW on booking_reschedule_requests, same as
-- handle_booking_status_change() did before fix_group_booking_notification_
-- dedup.sql. A group reschedule (provider_initiate_group_reschedule /
-- confirm_group_reschedule / decline_group_reschedule_offer — see
-- fix_group_booking_reschedule.sql) writes/updates N sibling request rows
-- at once, all sharing one group_reschedule_batch_id — so every reschedule
-- lifecycle event (provider proposes, client confirms, either side
-- declines) sent N notifications instead of one for the group. Flagged as
-- a known gap when fix_group_booking_reschedule.sql shipped; this file
-- closes it.
--
-- FIX: same representative-row pattern used for booking_confirmed/
-- booking_cancelled — only the group's earliest-original-appointment
-- sibling sends the notification, phrased with the group's service count.
-- Gated on group_reschedule_batch_id (not group_booking_id) so a STALE
-- prior round's siblings are never picked up as the representative set —
-- each new provider_initiate_group_reschedule() call mints a fresh batch
-- id, so only rows from the CURRENT round are ever compared. Ungrouped
-- requests (group_reschedule_batch_id IS NULL, the common case) are
-- completely unchanged: same condition, same per-row message, zero
-- behavior change.
--
-- The client-requests-a-reschedule path (NEW.status = 'pending', both
-- INSERT and UPDATE branches) is NOT grouped — group reschedule is
-- provider-initiated only in this app (see confirm_group_reschedule's
-- header), a client never has a group-scoped pending request to send in
-- the first place, so that branch is copied over unchanged.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_reschedule_request_change()
RETURNS TRIGGER AS $$
DECLARE
  v_actor              UUID := auth.uid();
  v_booking            RECORD;
  v_provider_user_id   UUID;
  v_representative_id  UUID;
BEGIN
  SELECT b.user_id, b.provider_id, b.customer_name,
         b.provider_name_snapshot, b.service_name_snapshot,
         b.group_booking_id, b.group_booking_count
    INTO v_booking
    FROM public.bookings b
   WHERE b.id = NEW.booking_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT p.user_id INTO v_provider_user_id
    FROM public.providers p WHERE p.id = v_booking.provider_id;

  -- For any group-batched request, find which sibling request row is the
  -- representative (earliest ORIGINAL appointment, tie-broken by id — same
  -- convention as the bookings-table dedup, but scoped through the request
  -- table's own original_date/original_time since that's what's stable
  -- across a reschedule, unlike booking_date/booking_time which the
  -- reschedule itself is changing).
  IF NEW.group_reschedule_batch_id IS NOT NULL THEN
    SELECT r.booking_id INTO v_representative_id
      FROM public.booking_reschedule_requests r
     WHERE r.group_reschedule_batch_id = NEW.group_reschedule_batch_id
     ORDER BY r.original_date ASC, r.original_time ASC, r.booking_id ASC
     LIMIT 1;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'pending' THEN
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
      IF NEW.group_reschedule_batch_id IS NOT NULL THEN
        IF v_representative_id = NEW.booking_id THEN
          INSERT INTO public.notifications
            (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
          VALUES (
            v_booking.user_id, 'reschedule_request', v_booking.provider_name_snapshot || ' needs to reschedule',
            v_booking.provider_name_snapshot || ' has proposed new times for your ' ||
              COALESCE(v_booking.group_booking_count, 1)::TEXT || ' service(s), starting with ' ||
              v_booking.service_name_snapshot || '.',
            'high', TRUE, NEW.id, v_booking.provider_id, 'client'
          );
        END IF;
      ELSE
        INSERT INTO public.notifications
          (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
        VALUES (
          v_booking.user_id, 'reschedule_request', v_booking.provider_name_snapshot || ' needs to reschedule',
          v_booking.provider_name_snapshot || ' has proposed new times for your ' ||
            v_booking.service_name_snapshot || ' appointment.',
          'high', TRUE, NEW.id, v_booking.provider_id, 'client'
        );
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN

    IF NEW.status = 'pending' THEN
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
      IF NEW.group_reschedule_batch_id IS NOT NULL THEN
        IF v_representative_id = NEW.booking_id THEN
          INSERT INTO public.notifications
            (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
          VALUES (
            v_booking.user_id, 'reschedule_provider_response',
            CASE WHEN NEW.response_note IS NOT NULL
              THEN v_booking.provider_name_snapshot || ' can''t make those dates'
              ELSE 'Provider Responded' END,
            COALESCE(NEW.response_note,
              v_booking.provider_name_snapshot || ' has shared available dates for your ' ||
                COALESCE(v_booking.group_booking_count, 1)::TEXT || ' service(s).'),
            'high', TRUE, NEW.id, v_booking.provider_id, 'client'
          );
        END IF;
      ELSE
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
      END IF;

    ELSIF NEW.status = 'confirmed' THEN
      IF NEW.group_reschedule_batch_id IS NOT NULL THEN
        IF v_representative_id = NEW.booking_id AND v_provider_user_id IS NOT NULL THEN
          INSERT INTO public.notifications
            (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
          VALUES (
            v_provider_user_id, 'reschedule_confirmed', 'Reschedule Confirmed',
            COALESCE(v_booking.customer_name, 'A client') || ' confirmed the new time for their ' ||
              COALESCE(v_booking.group_booking_count, 1)::TEXT || ' service(s).',
            'medium', FALSE, NEW.id, v_booking.provider_id, 'provider'
          );
        END IF;
      ELSE
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
      END IF;

    ELSIF NEW.status = 'rejected' THEN
      IF NEW.group_reschedule_batch_id IS NOT NULL AND v_representative_id != NEW.booking_id THEN
        -- Non-representative sibling in a group decline — skip, the
        -- representative's own trigger firing (same UPDATE statement,
        -- different row) already sent the one group notification.
        NULL;
      ELSIF v_actor IS NOT NULL AND v_actor = v_provider_user_id THEN
        INSERT INTO public.notifications
          (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
        VALUES (
          v_booking.user_id, 'reschedule_declined', 'Reschedule Declined',
          COALESCE(NEW.response_note,
            v_booking.provider_name_snapshot ||
              (CASE WHEN NEW.group_reschedule_batch_id IS NOT NULL
                THEN ' was unable to accommodate your reschedule request for ' ||
                     COALESCE(v_booking.group_booking_count, 1)::TEXT || ' service(s). Your original appointment times stand.'
                ELSE ' was unable to accommodate your reschedule request. Your original appointment time stands.' END)),
          'high', FALSE, NEW.id, v_booking.provider_id, 'client'
        );
      ELSE
        IF v_provider_user_id IS NOT NULL THEN
          INSERT INTO public.notifications
            (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
          VALUES (
            v_provider_user_id, 'reschedule_declined',
            CASE WHEN NEW.group_reschedule_batch_id IS NOT NULL THEN 'Reschedule Times Declined' ELSE 'Reschedule Times Declined' END,
            COALESCE(v_booking.customer_name, 'A client') ||
              (CASE WHEN NEW.group_reschedule_batch_id IS NOT NULL
                THEN ' declined the offered times for their ' || COALESCE(v_booking.group_booking_count, 1)::TEXT || ' service(s). Their original appointment times stand.'
                ELSE ' declined the offered times for their ' || v_booking.service_name_snapshot || ' appointment. Their original appointment time stands.' END),
            'medium', FALSE, NEW.id, v_booking.provider_id, 'provider'
          );
        END IF;
      END IF;
    END IF;

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

-- ── Verification ─────────────────────────────────────────────────────────
-- CONFIRMED LIVE 2026-08-09: pg_get_functiondef body matches this dedup
-- definition (representative-row keyed on group_reschedule_batch_id,
-- tie-broken by original_date/original_time/booking_id, "N service(s)" copy);
-- trigger on_reschedule_request_changed present + enabled; EXECUTE scoped to
-- service_role/postgres only (anon + authenticated revoked).
--   select pg_get_functiondef('public.handle_reschedule_request_change') like '%group_reschedule_batch_id%'; -- true
-- A 3-service group reschedule proposal/confirm/decline should each
-- produce exactly 1 notification of the relevant type, not 3:
--   select type, count(*) from notifications
--   where booking_id in (
--     select booking_id from booking_reschedule_requests
--     where group_reschedule_batch_id = '<batch id>'
--   )
--   group by type;
-- ============================================================
