-- A provider who never answers a reschedule request can strand the client
-- with zero available actions.
--
-- Confirmed against LIVE state (project ztrfpfvvejzaysrelmfm), not just the
-- tracked files, on 2026-09-01:
--
--   * cancel_own_booking() enforces the provider's cancellation-notice
--     window unconditionally -- it does not look at booking_reschedule_
--     requests at all, so a pending request never itself blocks a cancel
--     attempt. The block is purely time-based: once
--     hours_until_appointment < cancel_notice_hours, RAISE EXCEPTION, no
--     exceptions carved out.
--   * request_reschedule_own_booking() refuses a SECOND reschedule request
--     while one is already 'pending' or 'provider_responded' on the same
--     booking ("A reschedule request is already in progress").
--   * process_expire_stale_reschedule_requests() (cron 154, 20260826094404)
--     auto-expires a stale pending/provider_responded request, but the
--     deadline it computes is anchored ONLY on the provider's own
--     rescheduleNotice policy (floored at 24h) and the appointment date --
--     it has no idea the same booking also carries a SEPARATE
--     cancellation-notice policy (cancelNotice) that can close sooner.
--
-- Put together: a client who submits a reschedule request while still
-- inside their cancellation window, on a booking whose cancelNotice policy
-- is shorter than the reschedule answer window computed above, can watch
-- their cancel deadline pass while the request is still 'pending' -- at
-- which point cancel_own_booking() starts rejecting them and request_
-- reschedule_own_booking() is still refusing a second request. Nothing is
-- broken about either check individually; the two policies were just never
-- reconciled against each other. Concretely, with a 24h cancelNotice policy
-- and a same_day rescheduleNotice policy (answer window floored at 24h) on a
-- booking 30h out: cancel closes 6h after the request is made, the request
-- doesn't auto-expire for another 18h after that -- an 18-hour window with
-- no available action at all.
--
-- process_cancel_window_closing_warnings() (20260827160000, cron 157)
-- already tells the client "cancel by X" starting 6h before that cutoff --
-- but it is a notification, not a guarantee, and if the client doesn't act
-- on it in time (asleep, at work, whatever), there is currently nothing
-- forcing the pending request out of the way before the cutoff it just
-- warned about actually arrives.
--
-- THE FIX: process_expire_stale_reschedule_requests()'s deadline gets a
-- third bound, alongside the existing two -- never later than 6 hours
-- before the client's OWN cancel_notice_hours() deadline on the same
-- booking, floored at the same 4-hour "real chance to answer" minimum the
-- existing rescheduleNotice bound already uses. Whichever bound is soonest
-- wins, same as today. This guarantees the pending row resolves (auto-
-- expires) with enough lead time for the client to still act on the
-- warning notification while their cancellation window is still open --
-- rather than fixing the reverse (making cancellation ignore a pending
-- request, or extending the cancel window itself).
--
-- Deliberately NOT touching the "STILL OPEN" question 20260826090555's own
-- header raised -- whether an expired-by-provider-inaction request should
-- entitle the client to a NO-PENALTY cancellation past their notice window.
-- That has real liability attached (LEGAL-COMPLIANCE-NOTES.md §12) and is a
-- product/legal call this migration does not make. cancel_own_booking()'s
-- notice-window enforcement is completely unchanged below -- a client whose
-- cancel window closes before they act still cannot cancel for free. What
-- changes is only that they are never left checking an app that shows
-- neither Cancel nor Reschedule as an option at all.
--
-- Along the way, the cancel-notice-hours mapping (cancellation_notice_hours
-- if set, else booking_policies->>'cancelNotice' mapped 24h/48h/72h) is
-- pulled into a single helper, cancel_notice_hours(), instead of staying
-- inline in cancel_own_booking() and duplicated three more times inside
-- process_cancel_window_closing_warnings() -- the exact drift risk
-- MIGRATION_OWNER.md's queue already flagged ("STEP 2 BELONGS TO WHOEVER
-- APPLIES IT") when 20260827160000 was written without it, because the MCP
-- connection was down and reproducing a live function from memory is what
-- stripped SET search_path off three functions the same day. All three
-- reproductions below are CREATE OR REPLACE against unchanged signatures,
-- so existing grants carry forward untouched -- only the brand-new helper
-- needs its own REVOKE/GRANT.
--
-- Applied live 2026-09-02, recorded as this version (renamed from its
-- authored 20260901150000). Reproductions were diffed against live
-- pg_get_functiondef() output before applying -- byte-identical logic, just
-- consolidated onto the new helper.

-- ── 1. The shared cancel-notice-hours mapping ────────────────────────────

CREATE OR REPLACE FUNCTION public.cancel_notice_hours(
  p_cancellation_notice_hours INT,
  p_booking_policies JSONB
)
RETURNS INT
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN COALESCE(p_cancellation_notice_hours, 0) > 0 THEN p_cancellation_notice_hours
    ELSE CASE p_booking_policies ->> 'cancelNotice'
           WHEN '24h' THEN 24
           WHEN '48h' THEN 48
           WHEN '72h' THEN 72
           ELSE 0
         END
  END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_notice_hours(INT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_notice_hours(INT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_notice_hours(INT, JSONB) TO authenticated, service_role;

-- ── 2. cancel_own_booking() -- now calls the helper, behaviour unchanged ──

CREATE OR REPLACE FUNCTION public.cancel_own_booking(p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking     RECORD;
  v_notice_hrs  INT;
  v_policies    JSONB;
  v_hours_until NUMERIC;
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

  SELECT cancellation_notice_hours, booking_policies
    INTO v_notice_hrs, v_policies
    FROM public.providers WHERE id = v_booking.provider_id;

  v_notice_hrs := public.cancel_notice_hours(v_notice_hrs, v_policies);

  v_hours_until := EXTRACT(EPOCH FROM (
    (v_booking.booking_date + v_booking.booking_time)::timestamp - NOW()
  )) / 3600;

  IF COALESCE(v_notice_hrs, 0) > 0 THEN
    IF v_hours_until < v_notice_hrs THEN
      RAISE EXCEPTION 'This provider requires % hours notice to cancel', v_notice_hrs;
    END IF;
  END IF;

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

-- ── 3. process_cancel_window_closing_warnings() -- same helper, same rows ─

CREATE OR REPLACE FUNCTION public.process_cancel_window_closing_warnings()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT rr.id                                          AS request_id,
           rr.booking_id,
           b.user_id                                      AS client_user_id,
           b.provider_id,
           NULLIF(btrim(b.service_name_snapshot), '')     AS service_name_snapshot,
           NULLIF(btrim(b.provider_name_snapshot), '')    AS provider_name_snapshot,
           -- Resolved exactly as cancel_own_booking() resolves it.
           ((b.booking_date + b.booking_time)::TIMESTAMP
             - (public.cancel_notice_hours(p.cancellation_notice_hours, p.booking_policies) || ' hours')::INTERVAL
           )                                               AS cancel_cutoff
      FROM public.booking_reschedule_requests rr
      JOIN public.bookings  b ON b.id = rr.booking_id
      JOIN public.providers p ON p.id = b.provider_id
     WHERE rr.status = 'pending'
       -- Only a booking that could still be cancelled has a right to lose.
       AND b.status IN ('pending', 'confirmed')
       -- No notice period means no window to close.
       AND public.cancel_notice_hours(p.cancellation_notice_hours, p.booking_policies) > 0
       -- Inside the last 6 hours before the window shuts, and not after it.
       -- A client who asks with less than 6h of window left is warned on the
       -- next tick, which is the case that matters most.
       AND NOW() >= ((b.booking_date + b.booking_time)::TIMESTAMP
             - (public.cancel_notice_hours(p.cancellation_notice_hours, p.booking_policies) || ' hours')::INTERVAL) - INTERVAL '6 hours'
       AND NOW() < ((b.booking_date + b.booking_time)::TIMESTAMP
             - (public.cancel_notice_hours(p.cancellation_notice_hours, p.booking_policies) || ' hours')::INTERVAL)
       -- Once per request, not once per tick. Keyed on rr.updated_at rather
       -- than "ever", so a client who requests again later (the same row is
       -- reused via ON CONFLICT (booking_id) DO UPDATE) is warned again.
       AND NOT EXISTS (
         SELECT 1 FROM public.notifications n
          WHERE n.booking_id = rr.booking_id
            AND n.type = 'cancel_window_closing'
            AND n.created_at > rr.updated_at
       )
     FOR UPDATE OF rr
  LOOP
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable,
       booking_id, provider_id, recipient_role)
    VALUES (
      r.client_user_id, 'cancel_window_closing', 'Still Waiting on Your Provider',
      COALESCE(r.provider_name_snapshot, 'Your provider') ||
        ' hasn''t answered your reschedule request for ' ||
        COALESCE(r.service_name_snapshot, 'your appointment') ||
        '. If you''d rather cancel, you need to do that by ' ||
        to_char(r.cancel_cutoff, 'FMHH12:MI') ||
        lower(to_char(r.cancel_cutoff, 'am')) || ' on ' ||
        to_char(r.cancel_cutoff, 'FMDD Mon') ||
        ' — after that their cancellation notice period has passed.',
      'high', TRUE, r.booking_id, r.provider_id, 'client'
    );
  END LOOP;
END;
$function$;

-- ── 4. process_expire_stale_reschedule_requests() -- the actual fix ──────

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
               -- The provider's own reschedule-notice policy, floored at
               -- 24h. Mapping kept identical to
               -- request_reschedule_own_booking().
               rr.updated_at + (GREATEST(
                 CASE p.booking_policies->>'rescheduleNotice'
                   WHEN 'same_day' THEN 0
                   WHEN '48h'      THEN 48
                   WHEN '72h'      THEN 72
                   ELSE 24
                 END, 24) || ' hours')::INTERVAL,
               -- Answer before the appointment DAY starts, so the client
               -- knows the night before -- but never less than 4 hours from
               -- the ask, or a same-day request would be dead on arrival.
               GREATEST(
                 b.booking_date::TIMESTAMP,
                 rr.updated_at + INTERVAL '4 hours'
               )
             ),
             -- NEW: never later than 6 hours before the CLIENT's own
             -- cancel_notice_hours() deadline on this same booking would
             -- close. The reschedule-notice bound above is a SEPARATE
             -- provider policy from cancelNotice and can easily outlast it
             -- (rescheduleNotice is floored at 24h; cancelNotice can be as
             -- short as the provider likes) -- without this bound a
             -- provider's silence can carry the client straight through
             -- their own cancellation deadline while the request is still
             -- 'pending', at which point cancel_own_booking() starts
             -- rejecting them and request_reschedule_own_booking() is still
             -- refusing a second request on the same booking. See this
             -- file's header for the confirmed live scenario.
             --
             -- Floored at the same 4-hour "real chance to answer" minimum as
             -- the bound above, for the same reason: a request made five
             -- minutes before the client's own cancel window shuts should
             -- not expire on the very next cron tick with no chance for the
             -- provider to have answered it.
             --
             -- Does NOT grant a no-penalty cancellation and does not change
             -- cancel_own_booking()'s own notice check below -- see header.
             CASE
               WHEN public.cancel_notice_hours(p.cancellation_notice_hours, p.booking_policies) > 0
                 THEN GREATEST(
                        (b.booking_date::TIMESTAMP + b.booking_time)
                          - (public.cancel_notice_hours(p.cancellation_notice_hours, p.booking_policies) || ' hours')::INTERVAL
                          - INTERVAL '6 hours',
                        rr.updated_at + INTERVAL '4 hours'
                      )
               ELSE 'infinity'::TIMESTAMP
             END
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
