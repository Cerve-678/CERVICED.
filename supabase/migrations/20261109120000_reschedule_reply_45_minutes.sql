-- A reschedule request or offer now has to be answered within 45 minutes,
-- whichever side is waiting, and both people are told: when it's sent, the
-- person who has to answer is told how long they have (the sender sees the same
-- in the app), and when it runs out, both client and provider get a notice.
--
-- Before: the answer window was the provider's own reschedule-notice setting
-- (24h floor, up to 72h), capped by the appointment day and the cancellation
-- window. A client's unanswered request only told the client when it lapsed.
--
-- What changes:
--   1. reschedule_reply_window(): one place for the 45 minutes, like
--      waitlist_hold_duration(). src/constants/reschedule.ts mirrors it for the
--      app; src/tests/rescheduleReplyWindow.test.ts keeps the two in step.
--   2. process_expire_stale_reschedule_requests(): deadline is
--      LEAST(appointment start, updated_at + 45 minutes). The old
--      cancellation-window bound is dropped: it was never earlier than
--      updated_at + 4 hours, so 45 minutes always comes first. A pending
--      request that lapses now tells the provider as well as the client. A
--      group reschedule sends one pair of notices, not one per booking.
--   3. handle_reschedule_request_change(): the "your turn" notifications say
--      "You have 45 minutes to reply/choose, or the booking stays as it is."
--   4. Cron reschedule-request-expiry runs every minute (was :17 and :47, which
--      could let a 45-minute window run to 75).
--   5. The 4-hour "still waiting on you" provider reminder is removed (cron
--      provider-stale-reschedule-reminders and its function): a request now
--      expires long before it could fire.
--
-- No request was open live when this was written (2026-11-08), so nothing is
-- cut short by the switch. Both redefined functions are copied from live with
-- md5 guards.

BEGIN;

DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.handle_reschedule_request_change()'::regprocedure)) <> '63a4aaa1ad91ec857a7982081951c123' THEN
    RAISE EXCEPTION 'handle_reschedule_request_change changed live since this migration was written; redo it from live';
  END IF;
  IF md5(pg_get_functiondef('public.process_expire_stale_reschedule_requests()'::regprocedure)) <> '717bdca9751c0ec637dd159792e5e781' THEN
    RAISE EXCEPTION 'process_expire_stale_reschedule_requests changed live since this migration was written; redo it from live';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.reschedule_reply_window()
RETURNS INTERVAL
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$ SELECT INTERVAL '45 minutes' $$;

COMMENT ON FUNCTION public.reschedule_reply_window() IS
  'Single source for how long the waiting side has to answer a reschedule '
  'request or offer. The expiry cron enforces it and the notification copy '
  'quotes it, so the stated window and the enforced one cannot drift apart.';

REVOKE ALL ON FUNCTION public.reschedule_reply_window() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reschedule_reply_window() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.process_expire_stale_reschedule_requests()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT rr.id            AS request_id,
           rr.status        AS request_status,
           rr.booking_id,
           b.user_id        AS client_user_id,
           b.booking_date,
           NULLIF(btrim(b.customer_name), '')            AS customer_name,
           NULLIF(btrim(b.service_name_snapshot), '')    AS service_name_snapshot,
           b.provider_id,
           NULLIF(btrim(b.provider_name_snapshot), '')   AS provider_name_snapshot,
           p.user_id        AS provider_user_id,
           -- A group reschedule is one request per booking in the batch but one
           -- conversation, so only its first booking (same ordering the
           -- notification trigger uses) sends the expiry notices.
           (rr.group_reschedule_batch_id IS NULL OR rr.booking_id = (
              SELECT g.booking_id
                FROM public.booking_reschedule_requests g
               WHERE g.group_reschedule_batch_id = rr.group_reschedule_batch_id
               ORDER BY g.original_date ASC, g.original_time ASC, g.booking_id ASC
               LIMIT 1
           )) AS sends_notices
      FROM public.booking_reschedule_requests rr
      JOIN public.bookings  b ON b.id = rr.booking_id
      JOIN public.providers p ON p.id = b.provider_id
     WHERE rr.status IN ('pending', 'provider_responded')
       -- Whoever has to answer gets reschedule_reply_window() (45 minutes)
       -- from the moment it became their turn (updated_at moves when the
       -- provider offers times), never past the appointment itself.
       AND NOW() >= LEAST(
             b.booking_date::TIMESTAMP + b.booking_time,
             rr.updated_at + public.reschedule_reply_window()
           )
     FOR UPDATE OF rr
  LOOP
    UPDATE public.booking_reschedule_requests
       SET status = 'expired', updated_at = NOW()
     WHERE id = r.request_id;

    CONTINUE WHEN NOT r.sends_notices;

    IF r.request_status = 'pending' THEN
      -- The client asked and the provider didn't reply: both are told.
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable,
         booking_id, provider_id, recipient_role)
      VALUES (
        r.client_user_id, 'reschedule_expired', 'Reschedule Request Expired',
        COALESCE(r.provider_name_snapshot, 'Your provider') ||
          ' didn''t reply in time to your request to reschedule ' ||
          COALESCE(r.service_name_snapshot, 'your appointment') ||
          ', so your booking on ' || to_char(r.booking_date, 'DD Mon YYYY') ||
          ' stays as originally scheduled.',
        'high', TRUE, r.booking_id, r.provider_id, 'client'
      );

      IF r.provider_user_id IS NOT NULL THEN
        INSERT INTO public.notifications
          (user_id, type, title, message, priority, is_actionable,
           booking_id, provider_id, recipient_role)
        VALUES (
          r.provider_user_id, 'reschedule_expired', 'Reschedule Request Expired',
          'You didn''t reply in time to ' || COALESCE(r.customer_name, 'a client') ||
            '''s request to reschedule ' ||
            COALESCE(r.service_name_snapshot, 'their appointment') ||
            ', so the booking on ' || to_char(r.booking_date, 'DD Mon YYYY') ||
            ' stays as originally scheduled.',
          'medium', TRUE, r.booking_id, r.provider_id, 'provider'
        );
      END IF;
    ELSE
      -- The provider offered times and the client didn't pick one: both are told.
      IF r.provider_user_id IS NOT NULL THEN
        INSERT INTO public.notifications
          (user_id, type, title, message, priority, is_actionable,
           booking_id, provider_id, recipient_role)
        VALUES (
          r.provider_user_id, 'reschedule_expired', 'Reschedule Offer Expired',
          COALESCE(r.customer_name, 'A client') ||
            ' didn''t pick one of the times you offered for ' ||
            COALESCE(r.service_name_snapshot, 'their appointment') ||
            ' in time, so the booking on ' || to_char(r.booking_date, 'DD Mon YYYY') ||
            ' stays as originally scheduled.',
          'medium', TRUE, r.booking_id, r.provider_id, 'provider'
        );
      END IF;

      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable,
         booking_id, provider_id, recipient_role)
      VALUES (
        r.client_user_id, 'reschedule_expired', 'Reschedule Offer Expired',
        'You didn''t pick one of the times ' || COALESCE(r.provider_name_snapshot, 'your provider') ||
          ' offered for ' || COALESCE(r.service_name_snapshot, 'your appointment') ||
          ' in time, so your booking on ' ||
          to_char(r.booking_date, 'DD Mon YYYY') ||
          ' stays as originally scheduled.',
        'high', TRUE, r.booking_id, r.provider_id, 'client'
      );
    END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_reschedule_request_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor              UUID := auth.uid();
  v_booking            RECORD;
  v_provider_user_id   UUID;
  v_representative_id  UUID;
  -- The reply window in words, read from reschedule_reply_window(), the value the
  -- expiry cron enforces, so the stated deadline and the real one can't drift.
  v_reply_words        TEXT := (EXTRACT(EPOCH FROM public.reschedule_reply_window()) / 60)::INT || ' minutes';
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
            v_booking.service_name_snapshot || ' appointment. You have ' || v_reply_words ||
            ' to reply, or the booking stays as it is.',
          'high', TRUE, NEW.booking_id, v_booking.provider_id, 'provider'
        );
      END IF;
    ELSIF NEW.status = 'provider_responded' THEN
      IF NEW.group_reschedule_batch_id IS NOT NULL THEN
        IF v_representative_id = NEW.booking_id THEN
          INSERT INTO public.notifications
            (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
          VALUES (
            v_booking.user_id, 'reschedule_request', v_booking.provider_name_snapshot || ' needs to reschedule',
            v_booking.provider_name_snapshot || ' needs to reschedule your ' ||
              COALESCE(v_booking.group_booking_count, 1)::TEXT || ' service(s), starting with ' ||
              v_booking.service_name_snapshot ||
              '. Accept or decline the new proposed dates and times to confirm. You have ' || v_reply_words ||
              ' to choose, or your booking stays as it is.' || CASE WHEN NULLIF(btrim(NEW.response_note), '') IS NOT NULL
                   THEN E'\n\nNote from provider: ' || NEW.response_note ELSE '' END,
            'high', TRUE, NEW.booking_id, v_booking.provider_id, 'client'
          );
        END IF;
      ELSE
        INSERT INTO public.notifications
          (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
        VALUES (
          v_booking.user_id, 'reschedule_request', v_booking.provider_name_snapshot || ' needs to reschedule',
          v_booking.provider_name_snapshot || ' needs to reschedule your ' ||
            v_booking.service_name_snapshot ||
            ' appointment. Accept or decline the new proposed date and time to confirm. You have ' || v_reply_words ||
            ' to choose, or your booking stays as it is.' || CASE WHEN NULLIF(btrim(NEW.response_note), '') IS NOT NULL
                   THEN E'\n\nNote from provider: ' || NEW.response_note ELSE '' END,
          'high', TRUE, NEW.booking_id, v_booking.provider_id, 'client'
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
            v_booking.service_name_snapshot || ' appointment. You have ' || v_reply_words ||
            ' to reply, or the booking stays as it is.',
          'high', TRUE, NEW.booking_id, v_booking.provider_id, 'provider'
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
              v_booking.provider_name_snapshot || ' has offered new dates and times for your ' ||
                COALESCE(v_booking.group_booking_count, 1)::TEXT ||
                ' service(s). Accept or decline to confirm.')
              || ' You have ' || v_reply_words || ' to choose, or your booking stays as it is.',
            'high', TRUE, NEW.booking_id, v_booking.provider_id, 'client'
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
            v_booking.provider_name_snapshot ||
              ' has offered new dates and times for your reschedule request.' ||
              ' Accept or decline to confirm.')
            || ' You have ' || v_reply_words || ' to choose, or your booking stays as it is.',
          'high', TRUE, NEW.booking_id, v_booking.provider_id, 'client'
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
            'medium', FALSE, NEW.booking_id, v_booking.provider_id, 'provider'
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
            'medium', FALSE, NEW.booking_id, v_booking.provider_id, 'provider'
          );
        END IF;
      END IF;

    ELSIF NEW.status = 'rejected' THEN
      IF NEW.group_reschedule_batch_id IS NOT NULL AND v_representative_id != NEW.booking_id THEN
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
          'high', FALSE, NEW.booking_id, v_booking.provider_id, 'client'
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
                THEN ' declined the offered times for their ' || COALESCE(v_booking.group_booking_count, 1)::TEXT || ' service(s).' ||
                  CASE WHEN NEW.cancel_if_declined THEN ' The booking was cancelled and any payment is being refunded in full.'
                       ELSE ' Their original appointment times stand.' END
                ELSE ' declined the offered times for their ' || v_booking.service_name_snapshot || ' appointment.' ||
                  CASE WHEN NEW.cancel_if_declined THEN ' The booking was cancelled and any payment is being refunded in full.'
                       ELSE ' Their original appointment time stands.' END END),
            'medium', FALSE, NEW.booking_id, v_booking.provider_id, 'provider'
          );
        END IF;
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'reschedule-request-expiry'),
  schedule := '* * * * *'
);

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'provider-stale-reschedule-reminders';
DROP FUNCTION IF EXISTS public.process_provider_stale_reschedule_reminders();

COMMIT;
