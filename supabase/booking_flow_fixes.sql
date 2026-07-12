-- ============================================================
-- CERVICED — Booking Flow Fixes
-- Run this in the Supabase SQL editor AFTER:
--   phase1_schema.sql, notifications_full_matrix.sql,
--   automation_jobs.sql, waitlist_schema.sql
-- Safe to re-run.
--
-- Fixes:
--   1. notifications had NO INSERT policy — RLS silently blocked every
--      notification the app writes directly (reschedule alerts, address
--      release, balance collected, waitlist invites, rebook nudges,
--      promotions, announcements). Only SECURITY DEFINER triggers could
--      insert. This adds a scoped INSERT policy for booking/conversation
--      participants.
--   2. Waitlist invites on cancellation ran client-side, where RLS hides
--      other users' waitlist rows from the canceller — so the "slot
--      opened up" invite never fired. Moved into the status-change
--      trigger (SECURITY DEFINER), which sees every cancellation no
--      matter who cancels or how (app, cron, SQL).
--   3. Cancellation notifications are now actor-aware: when the CLIENT
--      cancels their own pending request, the client no longer receives
--      a misleading "provider declined your booking" message (the
--      provider is told the request was withdrawn instead), and the
--      person who performed a cancellation no longer gets notified
--      about their own action.
-- ============================================================

-- ───────────────────────────────────────────────────────────
-- STEP 1: Scoped INSERT policy for notifications
--   A sender may insert a notification when:
--     • they are notifying themselves (self reminders), OR
--     • the notification references a booking they participate in
--       (as the booking's client, or as the owner of the booking's
--       provider), OR
--     • they OWN the provider_id on the notification (provider →
--       client messages, promos, announcements, rebook nudges), OR
--     • the recipient IS the provider referenced by provider_id
--       (client → provider messages: reschedule requests, waitlist
--       joins — equivalent to "contacting the provider").
--   Everything else stays blocked.
-- ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "notifications_participant_insert" ON public.notifications;
CREATE POLICY "notifications_participant_insert" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    -- self-notification
    user_id = auth.uid()
    -- participant of the referenced booking
    OR (
      booking_id IS NOT NULL AND EXISTS (
        SELECT 1
          FROM public.bookings b
         WHERE b.id = booking_id
           AND (
             b.user_id = auth.uid()
             OR b.provider_id IN (SELECT p.id FROM public.providers p WHERE p.user_id = auth.uid())
           )
      )
    )
    -- sender owns the provider profile on the notification
    OR (
      provider_id IS NOT NULL
      AND provider_id IN (SELECT p.id FROM public.providers p WHERE p.user_id = auth.uid())
    )
    -- recipient is the provider referenced on the notification
    OR (
      provider_id IS NOT NULL
      AND user_id IN (SELECT p.user_id FROM public.providers p WHERE p.id = provider_id)
    )
  );

-- ───────────────────────────────────────────────────────────
-- STEP 1b: Providers may create bookings for their own business
--   The waitlist "invite → pencil in a booking" flow inserts a booking
--   with user_id = the invited client. The only existing INSERT policy
--   (bookings_user_insert) requires user_id = auth.uid(), so that insert
--   was silently RLS-blocked and the invite flow did nothing.
-- ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "bookings_provider_insert" ON public.bookings;
CREATE POLICY "bookings_provider_insert" ON public.bookings
  FOR INSERT TO authenticated
  WITH CHECK (
    provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
  );

-- ───────────────────────────────────────────────────────────
-- STEP 2: DB-side waitlist invite
--   Invites the next 'waiting' entry for the same provider, preferring
--   an exact service match, falling back to a provider-level entry
--   (service_id IS NULL). Marks the entry notified and inserts the
--   waitlist_slot_available notification. SECURITY DEFINER so it works
--   regardless of who triggered the cancellation.
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.invite_next_waitlist_entry(
  p_provider_id UUID,
  p_service_id  UUID
) RETURNS VOID AS $$
DECLARE
  w RECORD;
BEGIN
  SELECT *
    INTO w
    FROM public.provider_waitlist
   WHERE provider_id = p_provider_id
     AND status = 'waiting'
     AND (service_id = p_service_id OR service_id IS NULL)
   ORDER BY (service_id IS NOT NULL AND service_id = p_service_id) DESC,
            position ASC
   LIMIT 1;

  IF w.id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.provider_waitlist
     SET status = 'notified',
         notified_at = NOW()
   WHERE id = w.id;

  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, provider_id)
  VALUES (
    w.user_id,
    'waitlist_slot_available',
    'A slot opened up!',
    w.service_name_snapshot || ' with ' || w.provider_name_snapshot || ' — tap to book.',
    'high',
    TRUE,
    w.provider_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ───────────────────────────────────────────────────────────
-- STEP 3: Replace handle_booking_status_change
--   Same coverage as notifications_full_matrix.sql, plus:
--     • actor-aware cancellation messages (auth.uid() = the person
--       whose session performed the UPDATE; NULL for cron/service).
--     • waitlist invite on every transition INTO 'cancelled'.
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_booking_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_actor            UUID := auth.uid();  -- NULL when cron / service role
  v_provider_user_id UUID;
BEGIN

  -- Provider confirmed: pending → confirmed
  IF NEW.status = 'confirmed' AND OLD.status = 'pending' THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
    VALUES (
      NEW.user_id,
      'booking_confirmed',
      'Booking Confirmed! 🎉',
      NEW.provider_name_snapshot || ' confirmed your booking for ' ||
        NEW.service_name_snapshot ||
        ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') ||
        ' at ' || TO_CHAR(NEW.booking_time, 'HH12:MI AM') || '.',
      'high',
      TRUE,
      NEW.id,
      NEW.provider_id
    );
    RETURN NEW;
  END IF;

  -- Pending booking cancelled: provider declined OR client withdrew
  IF NEW.status = 'cancelled' AND OLD.status = 'pending' THEN
    IF v_actor IS NOT NULL AND v_actor = NEW.user_id THEN
      -- Client withdrew their own request → tell the provider, not the client
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
      SELECT
        p.user_id,
        'booking_cancelled',
        'Booking Request Withdrawn',
        COALESCE(NEW.customer_name, 'A client') || ' withdrew their request for ' ||
          NEW.service_name_snapshot ||
          ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || '.',
        'medium',
        FALSE,
        NEW.id,
        NEW.provider_id
      FROM public.providers p
      WHERE p.id = NEW.provider_id;
    ELSE
      -- Provider (or system) declined → tell the client
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
      VALUES (
        NEW.user_id,
        'booking_declined',
        'Booking Declined',
        'Unfortunately, ' || NEW.provider_name_snapshot ||
          ' is unable to accept your booking for ' ||
          NEW.service_name_snapshot ||
          ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || '.',
        'high',
        FALSE,
        NEW.id,
        NEW.provider_id
      );
    END IF;

    -- The slot is free again — invite the next waitlist entry
    PERFORM public.invite_next_waitlist_entry(NEW.provider_id, NEW.service_id);
    RETURN NEW;
  END IF;

  -- Provider started session: * → in_progress
  IF NEW.status = 'in_progress' AND OLD.status != 'in_progress' THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
    VALUES (
      NEW.user_id,
      'booking_in_progress',
      'Your Appointment Has Started',
      NEW.provider_name_snapshot || ' has started your ' ||
        NEW.service_name_snapshot || ' appointment.',
      'high',
      FALSE,
      NEW.id,
      NEW.provider_id
    );
    RETURN NEW;
  END IF;

  -- Provider marked no-show: * → no_show
  IF NEW.status = 'no_show' AND OLD.status != 'no_show' THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
    VALUES (
      NEW.user_id,
      'no_show',
      'Missed Appointment',
      'Your appointment with ' || NEW.provider_name_snapshot ||
        ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') ||
        ' was marked as a no-show.',
      'high',
      FALSE,
      NEW.id,
      NEW.provider_id
    );
    RETURN NEW;
  END IF;

  -- Cancelled after confirmation. Notify both sides EXCEPT the person
  -- who performed the cancellation (they already know).
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' AND OLD.status != 'pending' THEN
    SELECT p.user_id INTO v_provider_user_id
      FROM public.providers p WHERE p.id = NEW.provider_id;

    IF v_actor IS NULL OR v_actor != NEW.user_id THEN
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
      VALUES (
        NEW.user_id,
        'booking_cancelled',
        'Booking Cancelled',
        'Your booking with ' || NEW.provider_name_snapshot ||
          ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || ' has been cancelled.',
        'high',
        FALSE,
        NEW.id,
        NEW.provider_id
      );
    END IF;

    IF v_provider_user_id IS NOT NULL
       AND (v_actor IS NULL OR v_actor != v_provider_user_id) THEN
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
      VALUES (
        v_provider_user_id,
        'booking_cancelled',
        'Booking Cancelled',
        COALESCE(NEW.customer_name, 'A client') || ' cancelled their ' ||
          NEW.service_name_snapshot ||
          ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || '.',
        'medium',
        FALSE,
        NEW.id,
        NEW.provider_id
      );
    END IF;

    -- The slot is free again — invite the next waitlist entry
    PERFORM public.invite_next_waitlist_entry(NEW.provider_id, NEW.service_id);
    RETURN NEW;
  END IF;

  -- Booking completed → prompt user to leave a review
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
    VALUES (
      NEW.user_id,
      'review_request',
      'How was your appointment?',
      'Leave a review for ' || NEW.provider_name_snapshot ||
        '. Your feedback helps others find great providers.',
      'medium',
      TRUE,
      NEW.id,
      NEW.provider_id
    );
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_booking_status_changed ON public.bookings;
CREATE TRIGGER on_booking_status_changed
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.handle_booking_status_change();

-- ───────────────────────────────────────────────────────────
-- STEP 4: Auto-expire stale pending requests
--   A provider gets 48 hours to accept a booking request. If they
--   don't respond in time — or the appointment start time arrives
--   while still pending — the request is auto-declined. The
--   status-change trigger then notifies the client ("provider is
--   unable to accept your booking") and invites the next waitlist
--   entry, so an expired request never just sits there.
-- ───────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
GRANT USAGE ON SCHEMA cron TO postgres;

CREATE OR REPLACE FUNCTION public.process_expire_stale_pending_bookings()
RETURNS VOID AS $$
BEGIN
  UPDATE public.bookings
     SET status = 'cancelled'
   WHERE status = 'pending'
     AND (
       created_at < NOW() - INTERVAL '48 hours'
       OR (booking_date::TIMESTAMP + booking_time) < NOW()
     );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Every 30 minutes
SELECT cron.schedule(
  'expire-stale-pending-bookings',
  '*/30 * * * *',
  $$ SELECT public.process_expire_stale_pending_bookings(); $$
);

-- ───────────────────────────────────────────────────────────
-- STEP 5: Provider-set booking instructions
--   Providers write their own optional instructions ("please arrive
--   10 minutes early", parking notes, etc.) in their profile policies
--   (booking_policies->>'bookingInstructions'). A BEFORE INSERT
--   trigger stamps them onto each new booking so the client sees them
--   in their booking details. Nothing is fabricated by the app.
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_provider_booking_instructions()
RETURNS TRIGGER AS $$
DECLARE
  v_instructions TEXT;
BEGIN
  IF NEW.booking_instructions IS NULL THEN
    SELECT NULLIF(TRIM(p.booking_policies->>'bookingInstructions'), '')
      INTO v_instructions
      FROM public.providers p
     WHERE p.id = NEW.provider_id;
    NEW.booking_instructions := v_instructions;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_booking_set_instructions ON public.bookings;
CREATE TRIGGER on_booking_set_instructions
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.apply_provider_booking_instructions();

-- ───────────────────────────────────────────────────────────
-- STEP 6: Instant booking by default (Fresha model)
--   Bookings auto-confirm the moment they're placed. Providers who
--   want to vet each request can still turn auto-accept OFF —
--   manual approval becomes the opt-in exception.
-- ───────────────────────────────────────────────────────────
ALTER TABLE public.providers
  ALTER COLUMN auto_accept_bookings SET DEFAULT TRUE;

-- Flip existing providers too (pre-launch data). Remove this UPDATE if you
-- ever re-run after launch and want to preserve providers' own choices.
UPDATE public.providers SET auto_accept_bookings = TRUE;

-- With instant booking, the "Booking Request Sent … awaiting confirmation"
-- notification is noise — the client would get it back-to-back with
-- "Booking Confirmed 🎉". Redefine handle_new_booking (from
-- automation_jobs.sql) so the pending notices only go out in the manual flow.
CREATE OR REPLACE FUNCTION public.handle_new_booking()
RETURNS TRIGGER AS $$
DECLARE
  v_provider_user_id UUID;
  v_auto_accept      BOOLEAN;
BEGIN
  SELECT p.user_id, p.auto_accept_bookings
    INTO v_provider_user_id, v_auto_accept
    FROM public.providers p
   WHERE p.id = NEW.provider_id;

  IF v_auto_accept THEN
    -- Instant booking: confirm immediately. The status-change trigger
    -- (pending → confirmed) sends the client their confirmation.
    UPDATE public.bookings
       SET status       = 'confirmed',
           confirmed_at = NOW()
     WHERE id = NEW.id;

  ELSE
    -- Manual flow: tell the client the request is awaiting confirmation…
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

    -- …and tell the provider to review it
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

DROP TRIGGER IF EXISTS on_booking_created ON public.bookings;
CREATE TRIGGER on_booking_created
  AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_booking();

-- ============================================================
-- DONE — notifications insertable by participants, actor-aware
-- cancellation messages, waitlist invites fire server-side,
-- pending requests expire after 48h, provider instructions
-- stamped onto new bookings, instant booking by default
-- ============================================================
