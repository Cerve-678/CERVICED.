-- Reschedule requests get a deadline, and expiry is communicated as an outcome.
--
-- Implements the rule agreed in BOOKINGS.md §7a, which had been specified but
-- never built. Until now a booking_reschedule_requests row sat in 'pending'
-- (waiting on the provider) or 'provider_responded' (waiting on the client)
-- forever. Three things went wrong because of that, all of them against the
-- client who asked:
--
--   1. request_reschedule_own_booking() refuses a second request while one is
--      open, so a provider who never replies blocks the client from asking
--      again — silence became a stronger veto than an outright refusal.
--   2. process_auto_complete_bookings() flips confirmed -> completed purely on
--      the clock. A client who asked to move an appointment, got no reply and
--      didn't attend ended up with a booking recorded as completed and the
--      reschedule row still pending underneath it. That is not hypothetical:
--      request a1b9c766 was still 'pending' on a booking completed 2026-08-21.
--   3. The provider's own rescheduleNotice window kept running while the
--      request sat there, so a request made in good time became un-actionable
--      by both sides with nothing telling either of them.
--
-- THE ANSWER WINDOW is the provider's own rescheduleNotice setting: a provider
-- who demands 72h notice to reschedule gets 72h to answer one, not forever.
-- The hours mapping is copied verbatim from request_reschedule_own_booking()
-- so the two can never disagree about what '48h' means.
--
-- Floored at 24h on purpose. rescheduleNotice = 'same_day' maps to 0 hours,
-- which as an answer window would expire a request the instant it was made.
-- A provider who asks for no notice still gets a day to reply.
--
-- Backstopped by the start of the appointment day, whichever comes first, so
-- the client wakes up on the day already knowing. That backstop deliberately
-- BEATS the provider's own window when the two disagree: a 72h provider does
-- not get to spend 72h and reply as the client is walking in.
--
-- !! SUPERSEDED IN PART BY 20260826094404. As written below the backstop is a
-- bare LEAST against the start of the appointment day, which for a 'same_day'
-- provider -- who skips the notice check entirely, so a client can legitimately
-- ask ON the day -- is already in the PAST, producing a deadline 8 hours behind
-- now and expiring the request on the next cron tick before the provider could
-- ever see it. 094404 wraps it in a 4-hour floor and caps it at the appointment
-- START time. Left as-run here so migration history stays honest; a fresh
-- replay reaches the corrected state at 094404.
--
-- WHO IS WAITING is decided by status, never by requested_by:
--   * 'pending'            -> always the provider. Only
--                             request_reschedule_own_booking() creates this
--                             state, always with requested_by = 'user'.
--   * 'provider_responded' -> always the client, including when the PROVIDER
--                             opened it: provider_initiate_reschedule()
--                             inserts straight into 'provider_responded' with
--                             requested_by = 'provider'.
--
-- 'expired' is a distinct terminal status, not 'rejected' or 'cancelled'.
-- Those mean somebody decided, and the difference matters both for the
-- notification copy and for any later dispute.
--
-- An expired request costs the client nothing. Neither of the two limits reads
-- this table: the max-reschedules check reads bookings.reschedule_count and
-- the 24h cooldown reads bookings.last_rescheduled_at, both of which are only
-- written when a reschedule actually completes. Re-requesting after an expiry
-- reuses the same row through the existing ON CONFLICT (booking_id) DO UPDATE,
-- so the UNIQUE constraint is not in the way either.
--
-- STILL OPEN, deliberately: whether the expiry of a 'pending' request should
-- also give the client a no-penalty cancellation, given the provider's
-- non-response is what stranded them. That one has real liability attached
-- (LEGAL-COMPLIANCE-NOTES.md §12) and is a product/legal call, not an
-- engineering one — so this migration leaves the cancellation policy exactly
-- as it is and the copy below promises nothing about it.

-- ── 1. Widen the status CHECK ────────────────────────────────────────────────

ALTER TABLE public.booking_reschedule_requests
  DROP CONSTRAINT IF EXISTS booking_reschedule_requests_status_check;

ALTER TABLE public.booking_reschedule_requests
  ADD CONSTRAINT booking_reschedule_requests_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text, 'provider_responded'::text, 'confirmed'::text,
    'rejected'::text, 'cancelled'::text, 'expired'::text
  ]));

-- ── 2. The expiry job ────────────────────────────────────────────────────────

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
             -- The provider's own notice policy, floored at 24h. Mapping kept
             -- identical to request_reschedule_own_booking().
             rr.updated_at + (GREATEST(
               CASE p.booking_policies->>'rescheduleNotice'
                 WHEN 'same_day' THEN 0
                 WHEN '48h'      THEN 48
                 WHEN '72h'      THEN 72
                 ELSE 24
               END, 24) || ' hours')::INTERVAL,
             -- SUPERSEDED by 20260826094404 -- see the header note. This bare
             -- backstop is already in the past for a same-day request.
             b.booking_date::TIMESTAMP
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

-- ── 3. A terminal booking closes its open reschedule request ─────────────────
--
-- The deadline above makes the auto-complete case unreachable, but a booking
-- can still reach a terminal state while a request is open by other routes —
-- most obviously the client or provider cancelling it. Without this the row
-- stays 'pending' forever and the app keeps rendering the booking as
-- mid-reschedule.
--
-- 'cancelled' rather than 'expired': the request did not run out of time, it
-- was ended by a decision about the booking underneath it. No notification is
-- inserted — the booking's own status change already notifies both parties
-- (handle_booking_status_change), and a second message about the dependent
-- request would be noise restating the same event.
--
-- Deliberately a separate, narrowly-scoped trigger rather than an edit to
-- handle_booking_status_change(): that function owns every lifecycle
-- notification in the app, and redeploying it to add an unrelated concern is
-- exactly what silently reverted the group-dedup fix on 2026-08-08.

CREATE OR REPLACE FUNCTION public.close_reschedule_requests_on_terminal_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('cancelled', 'completed', 'no_show') THEN
    UPDATE public.booking_reschedule_requests
       SET status = 'cancelled', updated_at = NOW()
     WHERE booking_id = NEW.id
       AND status IN ('pending', 'provider_responded');
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_booking_terminal_close_reschedule ON public.bookings;
CREATE TRIGGER on_booking_terminal_close_reschedule
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.close_reschedule_requests_on_terminal_booking();

-- ── 4. Auto-complete leaves a booking with an open request alone ─────────────
--
-- Defence in depth. §3's deadline already guarantees no request is still open
-- once the appointment day starts, so in practice this guard should never fire
-- — but if it ever does, completing the booking out from under a live request
-- is the failure that produced the a1b9c766 row, and it should not be possible
-- from two directions at once. Safe against stranding a booking forever
-- precisely because expiry is now guaranteed.

CREATE OR REPLACE FUNCTION public.process_auto_complete_bookings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.bookings b
     SET status = 'completed'
   WHERE b.status IN ('confirmed', 'in_progress')
     AND (
       -- Use end_time when available
       (b.end_time IS NOT NULL AND (b.booking_date::TIMESTAMP + b.end_time)                       < NOW())
       OR
       -- Fall back to booking_time + 1 hour when end_time is not set
       (b.end_time IS NULL     AND (b.booking_date::TIMESTAMP + b.booking_time + INTERVAL '1 hour') < NOW())
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.booking_reschedule_requests rr
        WHERE rr.booking_id = b.id
          AND rr.status IN ('pending', 'provider_responded')
     );
END;
$function$;

-- ── 5. Close the rows that are already stranded ──────────────────────────────
--
-- Same rule as §3 applied to history: any open request whose booking has
-- already reached a terminal state. No notifications — telling someone their
-- request expired days after the appointment happened is noise, not news.

UPDATE public.booking_reschedule_requests rr
   SET status = 'cancelled', updated_at = NOW()
  FROM public.bookings b
 WHERE b.id = rr.booking_id
   AND rr.status IN ('pending', 'provider_responded')
   AND b.status IN ('cancelled', 'completed', 'no_show');

-- ── 6. Schedule it ───────────────────────────────────────────────────────────
--
-- Every 30 minutes, matching process_expire_stale_pending_bookings (jobid 70)
-- — the closest existing analogue, an "answer by" deadline on a booking rather
-- than a short-lived hold.

SELECT cron.unschedule('reschedule-request-expiry')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reschedule-request-expiry');

SELECT cron.schedule(
  'reschedule-request-expiry',
  '17,47 * * * *',
  $cron$ SELECT public.process_expire_stale_reschedule_requests(); $cron$
);
