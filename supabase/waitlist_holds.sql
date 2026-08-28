-- ============================================================
-- CERVICED — Waitlist redesign: real time-boxed holds instead of a bare
-- "tap to book" notification with no reservation.
-- Run this in the Supabase SQL editor, whole file, top to bottom.
-- Safe to re-run.
--
-- NOTE (2026-08-17): invite_next_waitlist_entry(), expire_waitlist_holds(),
-- and decline_waitlist_hold() below reflect a follow-up fix already applied
-- live — see supabase/migrations/20260817110500_waitlist_lapse_and_
-- exhaustion_notifications.sql for the full rationale (lapsed-hold client
-- notification + provider "waitlist exhausted" notification, gated on the
-- function's new BOOLEAN return value).
--
-- PROBLEMS THIS FIXES (see waitlist_automation_settings.sql for prior state):
--   1. With autoAcceptWaitlist off (the default), invite_next_waitlist_entry()
--      only ever sent a generic notification with no date/time and no
--      reservation — the waitlisted client had zero priority over a stranger
--      independently booking the same freed slot. Whoever's INSERT landed
--      first won.
--   2. preferred_dates was collected (ProviderProfileScreen's waitlist join
--      modal has had a real from/to date-range picker this whole time — see
--      handleJoinWaitlist) but never read by invite_next_waitlist_entry(),
--      which invited the top-of-queue candidate regardless of whether the
--      freed slot's date fell anywhere near what they'd actually asked for.
--   3. expires_at / the 'expired' status exist in the schema and have never
--      been enforced by anything — a notified entry that never acts just
--      sits forever, and since only one candidate is ever invited per
--      cancellation, nobody else gets a shot at that slot either.
--   4. position is tracked but never shown to the client.
--
-- THE FIX: a freed slot now gets held — a real bookings row with a new
-- status 'on_hold' and an expiry — exclusively for the best-matching
-- candidate (service match, then whether the freed date falls in their
-- preferred range, then queue position) for a fixed window. Reusing the
-- bookings table (rather than a parallel holds table) means the hold is
-- automatically respected by every existing overlap check — the new
-- bookings_no_overlap EXCLUDE constraint (prevent_overlapping_bookings.sql)
-- already blocks anything overlapping a non-cancelled row, 'on_hold'
-- included, with zero extra work. A cron sweep expires unclaimed holds and
-- cascades to the next matching candidate automatically.
-- ============================================================

-- ── 1. Schema: allow the new status, add hold/traceability columns ────────
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_status_check CHECK (status IN (
    'pending','confirmed','in_progress','completed','cancelled','no_show','on_hold'
  ));

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS hold_expires_at TIMESTAMPTZ;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS waitlist_entry_id UUID
  REFERENCES public.provider_waitlist(id) ON DELETE SET NULL;

-- ── 2. handle_new_booking() must not fire the normal "request sent" /
--    "new booking request" notifications for a hold — the client hasn't
--    seen or agreed to it yet. invite_next_waitlist_entry() below sends its
--    own explicit, date/time-specific invite instead. Everything else about
--    this function is untouched — this is a pure early-return guard. ──────
CREATE OR REPLACE FUNCTION public.handle_new_booking()
RETURNS TRIGGER AS $$
DECLARE
  v_provider_user_id UUID;
  v_auto_accept      BOOLEAN;
BEGIN
  IF NEW.status = 'on_hold' THEN
    RETURN NEW;
  END IF;

  SELECT p.user_id, p.auto_accept_bookings
    INTO v_provider_user_id, v_auto_accept
    FROM public.providers p
   WHERE p.id = NEW.provider_id;

  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
  VALUES (
    NEW.user_id,
    'booking_pending',
    'Booking Request Sent',
    'Your request with ' || NEW.provider_name_snapshot ||
      ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') ||
      ' at ' || TO_CHAR(NEW.booking_time, 'HH12:MI AM') ||
      ' is awaiting confirmation.',
    'high',
    TRUE,
    NEW.id,
    NEW.provider_id
  );

  IF v_auto_accept THEN
    UPDATE public.bookings
       SET status       = 'confirmed',
           confirmed_at = NOW()
     WHERE id = NEW.id;

    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
    VALUES (
      v_provider_user_id,
      'booking_confirmed',
      'New Booking',
      COALESCE(NEW.customer_name, 'A client') || ' booked ' ||
        NEW.service_name_snapshot ||
        ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') ||
        ' at ' || TO_CHAR(NEW.booking_time, 'HH12:MI AM') || '.',
      'high',
      FALSE,
      NEW.id,
      NEW.provider_id
    );
  ELSE
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
    VALUES (
      v_provider_user_id,
      'booking_pending',
      'New Booking Request',
      COALESCE(NEW.customer_name, 'A client') || ' requested ' ||
        NEW.service_name_snapshot ||
        ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') ||
        '. Please confirm or decline.',
      'high',
      TRUE,
      NEW.id,
      NEW.provider_id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 3. enforce_booking_bookability()'s own overlap check (availability_v2.sql)
--    only ever looked at pending/confirmed/in_progress — add on_hold so a
--    held slot is recognised as occupied by this check too, not just by the
--    (newer, stricter) bookings_no_overlap EXCLUDE constraint. ────────────
CREATE OR REPLACE FUNCTION public.enforce_booking_bookability()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_window_days INTEGER;
  v_notice_hours INTEGER;
  v_has_override BOOLEAN;
  v_fits_window BOOLEAN;
  v_legacy_open TIME;
  v_legacy_close TIME;
  v_legacy_closed BOOLEAN;
BEGIN
  SELECT booking_window_days, min_booking_notice_hrs
    INTO v_window_days, v_notice_hours
    FROM public.providers WHERE id = NEW.provider_id;

  IF NEW.booking_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Booking date cannot be in the past';
  END IF;
  IF COALESCE(v_window_days, 60) > 0
     AND NEW.booking_date > CURRENT_DATE + COALESCE(v_window_days, 60) THEN
    RAISE EXCEPTION 'Booking is outside this provider''s booking window';
  END IF;
  IF COALESCE(v_notice_hours, 0) > 0
     AND (NEW.booking_date + NEW.booking_time) < now() + make_interval(hours => v_notice_hours) THEN
    RAISE EXCEPTION 'This appointment does not meet the provider''s minimum notice';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.provider_blocked_dates
    WHERE provider_id = NEW.provider_id AND blocked_date = NEW.booking_date
  ) THEN RAISE EXCEPTION 'Provider is unavailable on this date'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.provider_availability_overrides
     WHERE provider_id = NEW.provider_id AND availability_date = NEW.booking_date
  ) INTO v_has_override;
  IF v_has_override AND EXISTS (
    SELECT 1 FROM public.provider_availability_overrides
     WHERE provider_id = NEW.provider_id AND availability_date = NEW.booking_date AND is_closed
  ) THEN RAISE EXCEPTION 'Provider is unavailable on this date'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.provider_availability_overrides
     WHERE provider_id = NEW.provider_id AND availability_date = NEW.booking_date
       AND is_closed = FALSE AND NEW.booking_time >= start_time AND NEW.end_time <= end_time
  ) INTO v_fits_window;

  IF NOT v_has_override THEN
    SELECT EXISTS (
      SELECT 1 FROM public.provider_availability_windows
       WHERE provider_id = NEW.provider_id
         AND day_of_week = EXTRACT(DOW FROM NEW.booking_date)
         AND NEW.booking_time >= start_time AND NEW.end_time <= end_time
    ) INTO v_fits_window;

    IF NOT v_fits_window AND NOT EXISTS (
      SELECT 1 FROM public.provider_availability_windows WHERE provider_id = NEW.provider_id
    ) THEN
      SELECT open_time, close_time, is_closed INTO v_legacy_open, v_legacy_close, v_legacy_closed
      FROM public.provider_availability
      WHERE provider_id = NEW.provider_id AND day_of_week = EXTRACT(DOW FROM NEW.booking_date);
      v_fits_window := FOUND AND NOT COALESCE(v_legacy_closed, TRUE)
        AND NEW.booking_time >= v_legacy_open AND NEW.end_time <= v_legacy_close;
    END IF;
  END IF;
  IF NOT COALESCE(v_fits_window, FALSE) THEN
    RAISE EXCEPTION 'This appointment is outside the provider''s working hours';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.bookings b
     WHERE b.provider_id = NEW.provider_id AND b.booking_date = NEW.booking_date
       AND b.status IN ('pending', 'confirmed', 'in_progress', 'on_hold')
       AND b.id IS DISTINCT FROM NEW.id
       AND NEW.booking_time < b.end_time AND NEW.end_time > b.booking_time
  ) THEN RAISE EXCEPTION 'That time is no longer available'; END IF;
  RETURN NEW;
END;
$$;

-- ── 4. client_bookings view (address_release_enforcement.sql) — never
--    surface a not-yet-claimed hold in the client's own bookings list as if
--    it were a real appointment. Column list unchanged from the live
--    definition, only a WHERE clause added. ────────────────────────────────
CREATE OR REPLACE VIEW public.client_bookings
WITH (security_invoker = true) AS
SELECT
  b.id, b.user_id, b.provider_id, b.service_id, b.status,
  b.booking_date, b.booking_time, b.end_time, b.notes, b.booking_instructions,
  b.payment_type, b.base_price, b.add_ons_total, b.service_charge, b.deposit_amount,
  b.amount_paid, b.remaining_balance, b.payment_status, b.payment_method, b.payment_intent_id,
  b.is_group_booking, b.group_booking_id, b.group_booking_count,
  b.provider_name_snapshot, b.service_name_snapshot, b.service_category_snapshot, b.provider_logo_snapshot,
  CASE WHEN public.is_address_released(b.status, p.address_release_policy, b.address_released_at, b.booking_date, b.booking_time)
       THEN b.provider_address_snapshot ELSE NULL END AS provider_address_snapshot,
  b.provider_phone_snapshot,
  CASE WHEN public.is_address_released(b.status, p.address_release_policy, b.address_released_at, b.booking_date, b.booking_time)
       THEN b.provider_coordinates ELSE NULL END AS provider_coordinates,
  b.customer_name, b.customer_email, b.customer_phone,
  b.confirmed_at, b.address_released_at, b.client_address,
  b.occasion_type, b.style_request, b.reference_image_url,
  b.created_at, b.updated_at,
  (SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.id), '[]'::jsonb)
     FROM public.booking_add_ons a WHERE a.booking_id = b.id) AS add_ons,
  jsonb_build_object('logo_url', p.logo_url) AS provider
FROM public.bookings b
LEFT JOIN public.providers p ON p.id = b.provider_id
WHERE b.status != 'on_hold';

GRANT SELECT ON public.client_bookings TO authenticated;

-- ── 5. invite_next_waitlist_entry() — now filters candidates by preferred
--    date range and loops through them (best match first) until one
--    successfully gets a hold placed, instead of trying only the single
--    top-of-queue entry and giving up if bookability fails for them.
--    Returns BOOLEAN (TRUE = someone was offered the slot, FALSE = queue
--    exhausted) as of waitlist_lapse_and_exhaustion_notifications.sql
--    (2026-08-17) — expire_waitlist_holds() and decline_waitlist_hold()
--    below use this to know when to notify the provider the whole
--    waitlist came up empty. ────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.invite_next_waitlist_entry(UUID, UUID, DATE, TIME, TIME, NUMERIC, NUMERIC, NUMERIC, TEXT);

CREATE OR REPLACE FUNCTION public.invite_next_waitlist_entry(
  p_provider_id UUID,
  p_service_id  UUID,
  p_booking_date DATE DEFAULT NULL,
  p_booking_time TIME DEFAULT NULL,
  p_end_time TIME DEFAULT NULL,
  p_base_price NUMERIC DEFAULT NULL,
  p_add_ons_total NUMERIC DEFAULT NULL,
  p_service_charge NUMERIC DEFAULT NULL,
  p_service_category_snapshot TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  w                   RECORD;
  v_waitlist_enabled  BOOLEAN;
  v_auto_accept       BOOLEAN;
  v_new_booking_id    UUID;
BEGIN
  SELECT COALESCE((automation_settings->>'waitlistEnabled')::boolean, TRUE),
         COALESCE((automation_settings->>'autoAcceptWaitlist')::boolean, FALSE)
    INTO v_waitlist_enabled, v_auto_accept
    FROM public.providers WHERE id = p_provider_id;

  IF NOT COALESCE(v_waitlist_enabled, TRUE) THEN
    RETURN FALSE;
  END IF;
  IF p_booking_date IS NULL OR p_booking_time IS NULL THEN
    RETURN FALSE;
  END IF;

  FOR w IN
    SELECT *
      FROM public.provider_waitlist
     WHERE provider_id = p_provider_id
       AND status = 'waiting'
       AND (service_id = p_service_id OR service_id IS NULL)
       -- preferred_dates[1] = range start, preferred_dates[2] = range end
       -- (absent = open-ended); NULL array = no preference, any date works.
       AND (
         preferred_dates IS NULL
         OR (p_booking_date >= preferred_dates[1]
             AND p_booking_date <= COALESCE(preferred_dates[2], 'infinity'::date))
       )
     ORDER BY (service_id IS NOT NULL AND service_id = p_service_id) DESC,
              position ASC
  LOOP
    BEGIN
      IF v_auto_accept THEN
        INSERT INTO public.bookings (
          user_id, provider_id, service_id, status,
          booking_date, booking_time, end_time,
          payment_type, base_price, add_ons_total, service_charge,
          deposit_amount, amount_paid, remaining_balance, payment_status,
          is_group_booking, group_booking_count,
          provider_name_snapshot, service_name_snapshot, service_category_snapshot,
          customer_name, waitlist_entry_id
        ) VALUES (
          w.user_id, p_provider_id, p_service_id, 'pending',
          p_booking_date, p_booking_time, p_end_time,
          'full', COALESCE(p_base_price, 0), COALESCE(p_add_ons_total, 0), COALESCE(p_service_charge, 0),
          0, 0, COALESCE(p_base_price, 0) + COALESCE(p_add_ons_total, 0) + COALESCE(p_service_charge, 0), 'pending',
          FALSE, 1,
          w.provider_name_snapshot, w.service_name_snapshot, p_service_category_snapshot,
          w.user_name_snapshot, w.id
        )
        RETURNING id INTO v_new_booking_id;

        UPDATE public.provider_waitlist SET status = 'booked', notified_at = NOW() WHERE id = w.id;
        RETURN TRUE;
      ELSE
        -- Real, exclusive hold — not just a notification. Blocks the slot
        -- from everyone else via bookings_no_overlap (prevent_overlapping_
        -- bookings.sql) and enforce_booking_bookability's own overlap check
        -- above, same as any other active booking.
        INSERT INTO public.bookings (
          user_id, provider_id, service_id, status,
          booking_date, booking_time, end_time,
          payment_type, base_price, add_ons_total, service_charge,
          deposit_amount, amount_paid, remaining_balance, payment_status,
          is_group_booking, group_booking_count,
          provider_name_snapshot, service_name_snapshot, service_category_snapshot,
          customer_name, waitlist_entry_id, hold_expires_at
        ) VALUES (
          w.user_id, p_provider_id, p_service_id, 'on_hold',
          p_booking_date, p_booking_time, p_end_time,
          'full', COALESCE(p_base_price, 0), COALESCE(p_add_ons_total, 0), COALESCE(p_service_charge, 0),
          0, 0, COALESCE(p_base_price, 0) + COALESCE(p_add_ons_total, 0) + COALESCE(p_service_charge, 0), 'pending',
          FALSE, 1,
          w.provider_name_snapshot, w.service_name_snapshot, p_service_category_snapshot,
          w.user_name_snapshot, w.id, NOW() + INTERVAL '3 hours'
        )
        RETURNING id INTO v_new_booking_id;

        UPDATE public.provider_waitlist SET status = 'notified', notified_at = NOW() WHERE id = w.id;

        INSERT INTO public.notifications
          (user_id, type, title, message, priority, is_actionable, provider_id, recipient_role, booking_id)
        VALUES (
          w.user_id,
          'waitlist_slot_available',
          'A slot opened up!',
          w.service_name_snapshot || ' with ' || w.provider_name_snapshot ||
            ' — ' || TO_CHAR(p_booking_date, 'DD Mon') || ' at ' || TO_CHAR(p_booking_time, 'HH12:MI AM') ||
            ' is held for you for 3 hours. Confirm now before it goes to the next person.',
          'high',
          TRUE,
          p_provider_id,
          'client',
          v_new_booking_id
        );
        RETURN TRUE;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Bookability rules changed since the original booking was made (or a
      -- concurrent write already claimed the slot) — try the next candidate
      -- instead of leaving the slot un-offered to anyone.
      CONTINUE;
    END;
  END LOOP;
  -- Loop exhausted with no eligible candidate — slot is open to the public
  -- same as any other cancellation. Caller uses this FALSE to notify the
  -- provider the waitlist is exhausted (see the 2026-08-17 fix below).
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 6. Cron sweep: release unclaimed holds and cascade to the next
--    candidate for that same freed slot. As of
--    waitlist_lapse_and_exhaustion_notifications.sql (2026-08-17), also
--    tells the lapsed client their hold expired, and — only if the
--    cascade finds nobody left to offer it to — tells the provider the
--    waitlist is exhausted and the slot is back on the open market. ─────
CREATE OR REPLACE FUNCTION public.expire_waitlist_holds()
RETURNS VOID AS $$
DECLARE
  h RECORD;
  v_provider_user_id UUID;
  v_offered_someone BOOLEAN;
BEGIN
  FOR h IN
    SELECT id, user_id, provider_id, service_id, booking_date, booking_time, end_time,
           base_price, add_ons_total, service_charge, service_category_snapshot,
           provider_name_snapshot, service_name_snapshot, waitlist_entry_id
      FROM public.bookings
     WHERE status = 'on_hold' AND hold_expires_at < NOW()
  LOOP
    UPDATE public.bookings SET status = 'cancelled', hold_expires_at = NULL WHERE id = h.id;
    IF h.waitlist_entry_id IS NOT NULL THEN
      UPDATE public.provider_waitlist SET status = 'expired' WHERE id = h.waitlist_entry_id;
    END IF;

    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      h.user_id, 'waitlist_slot_available', 'Your held slot expired',
      'Your held slot for ' || h.service_name_snapshot || ' with ' || h.provider_name_snapshot ||
        ' on ' || TO_CHAR(h.booking_date, 'DD Mon YYYY') || ' at ' || TO_CHAR(h.booking_time, 'HH12:MI AM') ||
        ' has expired.',
      'medium', FALSE, h.id, h.provider_id, 'client'
    );

    v_offered_someone := public.invite_next_waitlist_entry(
      h.provider_id, h.service_id, h.booking_date, h.booking_time, h.end_time,
      h.base_price, h.add_ons_total, h.service_charge, h.service_category_snapshot
    );

    IF NOT v_offered_someone THEN
      SELECT p.user_id INTO v_provider_user_id FROM public.providers p WHERE p.id = h.provider_id;
      IF v_provider_user_id IS NOT NULL THEN
        INSERT INTO public.notifications
          (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
        VALUES (
          v_provider_user_id, 'waitlist_slot_available', 'Waitlist exhausted',
          'Nobody on the waitlist claimed ' || h.service_name_snapshot ||
            ' on ' || TO_CHAR(h.booking_date, 'DD Mon YYYY') || ' at ' || TO_CHAR(h.booking_time, 'HH12:MI AM') ||
            ' — the slot is open to the public again.',
          'medium', FALSE, h.id, h.provider_id, 'provider'
        );
      END IF;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'expire-waitlist-holds';
SELECT cron.schedule('expire-waitlist-holds', '*/15 * * * *', $$SELECT public.expire_waitlist_holds();$$);

-- ── 7. Client-invoked: confirm ("claim") or explicitly decline a held slot.
--    Neither transition matches any branch in handle_booking_status_change()
--    (its branches all key off OLD.status IN ('pending', ...) for specific
--    named transitions — on_hold isn't one of them), so each function sends
--    its own single, explicit notification rather than relying on that
--    trigger — avoids double-notifying or silently notifying nobody. ──────
CREATE OR REPLACE FUNCTION public.claim_waitlist_hold(p_booking_id UUID)
RETURNS VOID AS $$
DECLARE
  v_booking RECORD;
  v_auto_accept_bookings BOOLEAN;
  v_provider_user_id UUID;
BEGIN
  SELECT * INTO v_booking FROM public.bookings
   WHERE id = p_booking_id AND status = 'on_hold' AND hold_expires_at > NOW();
  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'This hold has expired or no longer exists';
  END IF;
  IF v_booking.user_id != auth.uid() THEN
    RAISE EXCEPTION 'Not your hold';
  END IF;

  SELECT p.auto_accept_bookings, p.user_id
    INTO v_auto_accept_bookings, v_provider_user_id
    FROM public.providers p WHERE p.id = v_booking.provider_id;

  IF COALESCE(v_auto_accept_bookings, FALSE) THEN
    UPDATE public.bookings
       SET status = 'confirmed', hold_expires_at = NULL, confirmed_at = NOW()
     WHERE id = p_booking_id;

    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      v_booking.user_id, 'booking_confirmed', 'Booking Confirmed! 🎉',
      v_booking.provider_name_snapshot || ' confirmed your booking for ' || v_booking.service_name_snapshot ||
        ' on ' || TO_CHAR(v_booking.booking_date, 'DD Mon YYYY') ||
        ' at ' || TO_CHAR(v_booking.booking_time, 'HH12:MI AM') || '.',
      'high', TRUE, p_booking_id, v_booking.provider_id, 'client'
    );

    -- Mirrors handle_new_booking()'s auto-accept branch (which notifies the
    -- provider of a "New Booking") — this transition skips that trigger
    -- entirely (it early-returns on status = 'on_hold' at INSERT time), so
    -- without this the provider never learns their waitlist got filled.
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      v_provider_user_id, 'booking_confirmed', 'Waitlist Slot Filled',
      COALESCE(v_booking.customer_name, 'A client') || ' claimed the held slot for ' ||
        v_booking.service_name_snapshot ||
        ' on ' || TO_CHAR(v_booking.booking_date, 'DD Mon YYYY') ||
        ' at ' || TO_CHAR(v_booking.booking_time, 'HH12:MI AM') || ' — now fully booked.',
      'high', FALSE, p_booking_id, v_booking.provider_id, 'provider'
    );
  ELSE
    UPDATE public.bookings
       SET status = 'pending', hold_expires_at = NULL
     WHERE id = p_booking_id;

    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
    VALUES (
      v_booking.user_id, 'booking_pending', 'Booking Request Sent',
      'Your request with ' || v_booking.provider_name_snapshot ||
        ' on ' || TO_CHAR(v_booking.booking_date, 'DD Mon YYYY') ||
        ' at ' || TO_CHAR(v_booking.booking_time, 'HH12:MI AM') ||
        ' is awaiting confirmation.',
      'high', TRUE, p_booking_id, v_booking.provider_id
    );

    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
    SELECT
      p.user_id, 'booking_pending', 'New Booking Request',
      COALESCE(v_booking.customer_name, 'A client') || ' requested ' || v_booking.service_name_snapshot ||
        ' on ' || TO_CHAR(v_booking.booking_date, 'DD Mon YYYY') || '. Please confirm or decline.',
      'high', TRUE, p_booking_id, v_booking.provider_id
    FROM public.providers p WHERE p.id = v_booking.provider_id;
  END IF;

  IF v_booking.waitlist_entry_id IS NOT NULL THEN
    UPDATE public.provider_waitlist SET status = 'booked' WHERE id = v_booking.waitlist_entry_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- As of waitlist_lapse_and_exhaustion_notifications.sql (2026-08-17): if
-- the cascade below finds nobody left to offer the slot to, tells the
-- provider the waitlist is exhausted. The declining client isn't notified
-- back — they took the action themselves and already know.
CREATE OR REPLACE FUNCTION public.decline_waitlist_hold(p_booking_id UUID)
RETURNS VOID AS $$
DECLARE
  v_booking RECORD;
  v_provider_user_id UUID;
  v_offered_someone BOOLEAN;
BEGIN
  SELECT * INTO v_booking FROM public.bookings
   WHERE id = p_booking_id AND status = 'on_hold';
  IF v_booking.id IS NULL THEN
    RETURN;
  END IF;
  IF v_booking.user_id != auth.uid() THEN
    RAISE EXCEPTION 'Not your hold';
  END IF;

  UPDATE public.bookings SET status = 'cancelled', hold_expires_at = NULL WHERE id = p_booking_id;
  IF v_booking.waitlist_entry_id IS NOT NULL THEN
    UPDATE public.provider_waitlist SET status = 'expired' WHERE id = v_booking.waitlist_entry_id;
  END IF;

  -- Don't make the next candidate wait out the full window just because
  -- this one actively said no.
  v_offered_someone := public.invite_next_waitlist_entry(
    v_booking.provider_id, v_booking.service_id, v_booking.booking_date,
    v_booking.booking_time, v_booking.end_time, v_booking.base_price,
    v_booking.add_ons_total, v_booking.service_charge, v_booking.service_category_snapshot
  );

  IF NOT v_offered_someone THEN
    SELECT p.user_id INTO v_provider_user_id FROM public.providers p WHERE p.id = v_booking.provider_id;
    IF v_provider_user_id IS NOT NULL THEN
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
      VALUES (
        v_provider_user_id, 'waitlist_slot_available', 'Waitlist exhausted',
        'Nobody on the waitlist claimed ' || v_booking.service_name_snapshot ||
          ' on ' || TO_CHAR(v_booking.booking_date, 'DD Mon YYYY') || ' at ' || TO_CHAR(v_booking.booking_time, 'HH12:MI AM') ||
          ' — the slot is open to the public again.',
        'medium', FALSE, p_booking_id, v_booking.provider_id, 'provider'
      );
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.claim_waitlist_hold(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_waitlist_hold(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.claim_waitlist_hold(UUID) FROM public;
REVOKE ALL ON FUNCTION public.decline_waitlist_hold(UUID) FROM public;
REVOKE EXECUTE ON FUNCTION public.claim_waitlist_hold(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.decline_waitlist_hold(UUID) FROM anon;

-- VERIFY
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conrelid = 'public.bookings'::regclass and conname = 'bookings_status_check';
--     → expect 'on_hold' present
--   select jobname, schedule from cron.job where jobname = 'expire-waitlist-holds';
--     → expect one row, */15 * * * *
--   select proname, proacl from pg_proc where pronamespace = 'public'::regnamespace
--     and proname in ('claim_waitlist_hold','decline_waitlist_hold');
--     → expect no anon=X entry, authenticated=X present (see
--       fix_anon_executable_security_definer_functions.sql for why this
--       matters — REVOKE ALL FROM public alone does not block anon here)
-- ============================================================
