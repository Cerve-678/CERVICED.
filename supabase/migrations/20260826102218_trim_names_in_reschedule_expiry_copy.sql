-- Trim the names interpolated into the expiry notification copy.
--
-- provider_name_snapshot / customer_name / service_name_snapshot are free text
-- and some rows carry a trailing space, which the first live run rendered as
-- a visible double space:
--
--   "FACEBYJEN  didn't confirm new dates for Full Glam"
--
-- NULLIF(btrim(...), '') rather than a bare btrim, so a name that is nothing
-- but whitespace reads as absent and the existing COALESCE fallback
-- ("Your provider" / "A client" / "your appointment") actually fires instead
-- of interpolating an empty string.

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
