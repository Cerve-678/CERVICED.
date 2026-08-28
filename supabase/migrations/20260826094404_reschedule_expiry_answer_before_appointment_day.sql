-- Corrects the deadline formula shipped in 20260826090555.
--
-- That version was LEAST(updated_at + answer_window, start of appointment day).
-- The backstop was right for the common case and wrong at the edge:
--
--   * 72h provider, client asks at 72h  -> 58h, answer due the night before  OK
--   * 24h provider, client asks at 24h  -> 10h, answer due the night before  OK
--   * same-day provider, asks 6h before -> MINUS 8 HOURS
--
-- The last one is the bug. 'same_day' skips the notice check in
-- request_reschedule_own_booking() entirely, so a client can legitimately ask
-- on the day -- and "start of the appointment day" is then already in the past,
-- so the request expired on the next cron tick before the provider could ever
-- see it. Same-day providers are the most flexible ones and this punished them
-- specifically.
--
-- The intent is unchanged: THE PROVIDER SHOULD ANSWER BEFORE THE APPOINTMENT
-- DAY, so the client wakes up on the day already knowing. That is why the
-- backstop beats the provider's own window whenever the two disagree. Two
-- guards are added around it rather than weakening it:
--
--   1. a 4-hour floor, so a late request always gives a real chance to answer
--      instead of a deadline already in the past;
--   2. a hard cap at the appointment START time, so a deadline can never sit
--      after the appointment it is about.
--
-- Verified against all five shapes; none produce a negative window:
--
--   | provider | client asks | answer by            | window |
--   |----------|-------------|----------------------|--------|
--   | 72h      | 3 days out  | midnight before      | 58h    |
--   | 24h      | 24h before  | midnight before      | 10h    |
--   | 24h      | a week out  | 24h after the ask    | 24h    |
--   | same-day | 6h before   | 4h after the ask     | 4h     |
--   | same-day | 1h before   | the appointment time | 1h     |

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
           b.customer_name,
           b.service_name_snapshot,
           b.provider_id,
           b.provider_name_snapshot,
           p.user_id        AS provider_user_id
      FROM public.booking_reschedule_requests rr
      JOIN public.bookings  b ON b.id = rr.booking_id
      JOIN public.providers p ON p.id = b.provider_id
     WHERE rr.status IN ('pending', 'provider_responded')
       AND NOW() >= LEAST(
             -- Never later than the appointment itself.
             b.booking_date::TIMESTAMP + b.booking_time,
             LEAST(
               -- The provider's own notice policy, floored at 24h. Mapping
               -- kept identical to request_reschedule_own_booking().
               rr.updated_at + (GREATEST(
                 CASE p.booking_policies->>'rescheduleNotice'
                   WHEN 'same_day' THEN 0
                   WHEN '48h'      THEN 48
                   WHEN '72h'      THEN 72
                   ELSE 24
                 END, 24) || ' hours')::INTERVAL,
               -- Answer before the appointment DAY starts, so the client knows
               -- the night before -- but never less than 4 hours from the ask,
               -- or a same-day request would be dead on arrival.
               GREATEST(
                 b.booking_date::TIMESTAMP,
                 rr.updated_at + INTERVAL '4 hours'
               )
             )
           )
     FOR UPDATE OF rr
  LOOP
    UPDATE public.booking_reschedule_requests
       SET status = 'expired', updated_at = NOW()
     WHERE id = r.request_id;

    IF r.request_status = 'pending' THEN
      -- Waiting on the PROVIDER, who never offered dates. The client's request
      -- is dead and they had no part in that, so they are the one told. The
      -- provider caused it by inaction and has already had up to N nudges from
      -- process_provider_stale_reschedule_reminders() — another message here
      -- would be a fourth nag, not news.
      --
      -- Copy asserts only what is certainly true. It deliberately does NOT
      -- offer "ask again or cancel": by this point the provider's own notice
      -- window may have lapsed, which is exactly what would make both of those
      -- fail. Promising an action the next tap rejects is worse than silence.
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable,
         booking_id, provider_id, recipient_role)
      VALUES (
        r.client_user_id, 'reschedule_expired', 'Reschedule Request Expired',
        COALESCE(r.provider_name_snapshot, 'Your provider') ||
          ' didn''t confirm new dates for ' ||
          COALESCE(r.service_name_snapshot, 'your appointment') ||
          ', so your booking on ' || to_char(r.booking_date, 'DD Mon YYYY') ||
          ' stays as originally scheduled.',
        'high', TRUE, r.booking_id, r.provider_id, 'client'
      );
    ELSE
      -- Waiting on the CLIENT, who never picked one of the offered times.
      -- Both sides are told here, unlike the branch above: the provider's held
      -- offer is dead (their state changed through no act of their own), and
      -- the client's app is still showing those offered dates as live, so
      -- leaving them to tap a slot that no longer exists is the worse failure.
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable,
         booking_id, provider_id, recipient_role)
      VALUES (
        r.provider_user_id, 'reschedule_expired', 'Reschedule Offer Expired',
        COALESCE(r.customer_name, 'A client') ||
          ' didn''t pick one of the times you offered for ' ||
          COALESCE(r.service_name_snapshot, 'their appointment') ||
          ', so the booking on ' || to_char(r.booking_date, 'DD Mon YYYY') ||
          ' stays as originally scheduled.',
        'medium', TRUE, r.booking_id, r.provider_id, 'provider'
      );

      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable,
         booking_id, provider_id, recipient_role)
      VALUES (
        r.client_user_id, 'reschedule_expired', 'Reschedule Offer Expired',
        'The times ' || COALESCE(r.provider_name_snapshot, 'your provider') ||
          ' offered for ' || COALESCE(r.service_name_snapshot, 'your appointment') ||
          ' have expired, so your booking on ' ||
          to_char(r.booking_date, 'DD Mon YYYY') ||
          ' stays as originally scheduled.',
        'high', TRUE, r.booking_id, r.provider_id, 'client'
      );
    END IF;
  END LOOP;
END;
$function$;

-- Trigger-and-cron only. Nothing client-facing calls this, so nothing outside
-- the scheduler needs EXECUTE (see the anon EXECUTE hardening pass, 2026-08-20).
REVOKE ALL ON FUNCTION public.process_expire_stale_reschedule_requests() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_expire_stale_reschedule_requests() FROM anon;
REVOKE ALL ON FUNCTION public.process_expire_stale_reschedule_requests() FROM authenticated;
