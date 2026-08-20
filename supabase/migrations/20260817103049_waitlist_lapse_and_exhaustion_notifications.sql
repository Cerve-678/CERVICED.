-- ============================================================
-- CERVICED — Waitlist: notify on hold expiry and full exhaustion.
--
-- PROBLEM: waitlist_holds.sql (2026-08-02) already cascades a freed slot
-- to the next candidate when a hold lapses (expire_waitlist_holds, the
-- */15 cron sweep) or is explicitly declined (decline_waitlist_hold) —
-- that part already worked. But neither path notified anyone:
--   1. A client whose 3-hour hold silently expired was never told —
--      they'd only discover it by checking their bookings and finding
--      the slot gone.
--   2. A provider was never told when the *entire* waitlist for a freed
--      slot got exhausted (every candidate expired/declined, nobody
--      left to try) — the slot just quietly reopened to the public with
--      no signal that their waitlist automation was done working it.
--   (Explicit decline is not notified back to the client — they took
--   that action themselves and already know.)
--
-- THE FIX: invite_next_waitlist_entry() now returns BOOLEAN (TRUE if a
-- candidate was found and offered the slot, FALSE if the queue was
-- exhausted with nobody eligible). Both callers use that to fire a
-- provider "waitlist exhausted" notification only on the final,
-- no-one-left outcome — not on every intermediate offer. expire_
-- waitlist_holds() also notifies the lapsed client directly, before
-- attempting the cascade.
-- ============================================================

-- ── 1. invite_next_waitlist_entry() — same matching/hold logic as before,
--    now returns whether it actually placed a hold on someone. ───────────
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
        -- bookings.sql) and enforce_booking_bookability's own overlap check.
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
  -- Loop exhausted with no eligible candidate.
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 2. expire_waitlist_holds() — tell the lapsed client their hold is
--    gone, then cascade; if the cascade comes back empty (queue
--    exhausted), tell the provider their waitlist automation is done
--    working this slot and it's back on the open market. ─────────────────
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

-- ── 3. decline_waitlist_hold() — same "tell the provider only if the
--    whole queue is now exhausted" rule. The declining client already
--    knows (they took the action), so no client-facing notification here. ─
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

-- Re-apply lockdown (CREATE OR REPLACE preserves existing grants, but stay
-- explicit and match waitlist_holds.sql's original grant list).
GRANT EXECUTE ON FUNCTION public.decline_waitlist_hold(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.decline_waitlist_hold(UUID) FROM public;
REVOKE EXECUTE ON FUNCTION public.decline_waitlist_hold(UUID) FROM anon;

-- VERIFY
--   select proname, prorettype::regtype from pg_proc
--     where proname = 'invite_next_waitlist_entry' and pronamespace = 'public'::regnamespace;
--     → expect prorettype = boolean
--   select jobname, schedule, active from cron.job where jobname = 'expire-waitlist-holds';
--     → expect one row, */15 * * * *, active = true (unchanged by this file)
-- ============================================================
