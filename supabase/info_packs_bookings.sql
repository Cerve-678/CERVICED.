-- ============================================================
-- CERVICED — Info Packs → Bookings + Provider Daily Recap
-- Attaches provider info packs (aftercare guides, prep tips) to client
-- bookings so they appear in the booking's TO-DO section, with an in-app
-- + push notification. Also adds the provider daily recap job
-- (Automations screen "newBookingRecap" toggle).
--
-- Run this in the Supabase SQL editor AFTER client_automation_jobs.sql
-- (it reads providers.automation_settings). Safe to re-run.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
GRANT USAGE ON SCHEMA cron TO postgres;

-- ───────────────────────────────────────────────────────────
-- STEP 1: info_packs table
--   Created ad-hoc in the live DB by ProviderInfoPackScreen — defined
--   here so fresh environments get it. NOTE: the app has historically
--   written provider_id = auth.uid() (the provider's USER id, not
--   providers.id); the trigger below accepts either convention.
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.info_packs (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID NOT NULL,
  title       TEXT NOT NULL,
  service     TEXT DEFAULT 'GENERAL',
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Packs attach to SPECIFIC services (by name), mirroring
-- provider_form_library.service_names. Empty array = all services.
ALTER TABLE public.info_packs
  ADD COLUMN IF NOT EXISTS service_names TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.info_packs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "info_packs_provider_all" ON public.info_packs;
CREATE POLICY "info_packs_provider_all"
ON public.info_packs FOR ALL
USING (
  provider_id = auth.uid()
  OR provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
);

-- ───────────────────────────────────────────────────────────
-- STEP 2: booking_info_packs — a pack sent with a specific booking
--   Content is snapshotted so later edits/deletes of the library pack
--   never change what the client was sent. viewed_at drives the client
--   "needs attention" indicator.
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.booking_info_packs (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id     UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  info_pack_id   UUID,
  provider_id    UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  client_user_id UUID NOT NULL,
  title          TEXT NOT NULL,
  service        TEXT DEFAULT 'GENERAL',
  content        TEXT NOT NULL,
  viewed_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (booking_id, info_pack_id)
);

ALTER TABLE public.booking_info_packs ENABLE ROW LEVEL SECURITY;

-- Client: read their own packs and mark them viewed
DROP POLICY IF EXISTS "booking_info_packs_client_select" ON public.booking_info_packs;
CREATE POLICY "booking_info_packs_client_select"
ON public.booking_info_packs FOR SELECT
USING (client_user_id = auth.uid());

DROP POLICY IF EXISTS "booking_info_packs_client_update" ON public.booking_info_packs;
CREATE POLICY "booking_info_packs_client_update"
ON public.booking_info_packs FOR UPDATE
USING (client_user_id = auth.uid())
WITH CHECK (client_user_id = auth.uid());

-- Provider: full control over packs on their own bookings
DROP POLICY IF EXISTS "booking_info_packs_provider_all" ON public.booking_info_packs;
CREATE POLICY "booking_info_packs_provider_all"
ON public.booking_info_packs FOR ALL
USING (provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid()));

-- ───────────────────────────────────────────────────────────
-- STEP 3: Expand notifications.type CHECK constraint
--   Adds info_pack_received (client got prep/aftercare info).
--   Keep in sync with every other copy of this constraint.
-- ───────────────────────────────────────────────────────────
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'booking_pending',
    'booking_confirmed',
    'booking_declined',
    'booking_cancelled',
    'booking_reminder',
    'booking_in_progress',
    'booking_not_started',
    'no_show',
    'payment_success',
    'new_provider',
    'reschedule_request',
    'reschedule_provider_response',
    'reschedule_confirmed',
    'review_request',
    'review_received',
    'promotion',
    'intake_form_reminder',
    'intake_form_received',
    'intake_form_completed',
    'info_pack_received',
    'provider_message',
    'announcement',
    'balance_collected',
    'balance_reminder',
    'waitlist_slot_available',
    'new_message'
  )) NOT VALID; -- enforce new rows only; legacy rows must not fail the migration

-- ───────────────────────────────────────────────────────────
-- STEP 4: Attach matching packs when a booking is created
--   Matches packs whose service_names lists this exact booked service,
--   or is empty (= attach to all services). One notification per
--   booking regardless of how many packs attach.
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_attach_info_packs()
RETURNS TRIGGER AS $$
DECLARE
  v_provider RECORD;
  v_count    INT := 0;
BEGIN
  SELECT id, user_id, display_name
    INTO v_provider
    FROM public.providers
   WHERE id = NEW.provider_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  INSERT INTO public.booking_info_packs
    (booking_id, info_pack_id, provider_id, client_user_id, title, service, content)
  SELECT NEW.id, ip.id, v_provider.id, NEW.user_id, ip.title, NEW.service_name_snapshot, ip.content
    FROM public.info_packs ip
   WHERE ip.provider_id IN (v_provider.id, v_provider.user_id)
     AND (
       NEW.service_name_snapshot = ANY(ip.service_names)
       OR cardinality(ip.service_names) = 0
     )
  ON CONFLICT (booking_id, info_pack_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
    VALUES (
      NEW.user_id,
      'info_pack_received',
      'Info From Your Provider',
      COALESCE(v_provider.display_name, 'Your provider') ||
        ' sent you prep & aftercare info for your ' || NEW.service_name_snapshot ||
        ' — open the booking to read it.',
      'medium',
      TRUE,
      NEW.id,
      v_provider.id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_booking_attach_info_packs ON public.bookings;
CREATE TRIGGER on_booking_attach_info_packs
  AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.handle_attach_info_packs();

-- ───────────────────────────────────────────────────────────
-- STEP 5: Attach a NEW pack to existing upcoming bookings
--   Covers the reverse direction: provider writes a pack after
--   bookings already exist. One notification per affected booking.
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_info_pack()
RETURNS TRIGGER AS $$
DECLARE
  v_provider RECORD;
  b          RECORD;
BEGIN
  -- Resolve the provider row from either id convention
  SELECT id, user_id, display_name
    INTO v_provider
    FROM public.providers
   WHERE id = NEW.provider_id OR user_id = NEW.provider_id
   LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;

  FOR b IN
    SELECT bk.id, bk.user_id, bk.service_name_snapshot
      FROM public.bookings bk
     WHERE bk.provider_id = v_provider.id
       AND bk.status IN ('pending', 'confirmed')
       AND bk.booking_date >= CURRENT_DATE
       AND (
         bk.service_name_snapshot = ANY(NEW.service_names)
         OR cardinality(NEW.service_names) = 0
       )
  LOOP
    INSERT INTO public.booking_info_packs
      (booking_id, info_pack_id, provider_id, client_user_id, title, service, content)
    VALUES (b.id, NEW.id, v_provider.id, b.user_id, NEW.title, b.service_name_snapshot, NEW.content)
    ON CONFLICT (booking_id, info_pack_id) DO NOTHING;

    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
    VALUES (
      b.user_id,
      'info_pack_received',
      'Info From Your Provider',
      COALESCE(v_provider.display_name, 'Your provider') ||
        ' sent you "' || NEW.title || '" for your ' || b.service_name_snapshot ||
        ' — open the booking to read it.',
      'medium',
      TRUE,
      b.id,
      v_provider.id
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_info_pack_created ON public.info_packs;
CREATE TRIGGER on_info_pack_created
  AFTER INSERT ON public.info_packs
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_info_pack();

-- ───────────────────────────────────────────────────────────
-- STEP 5b: Notify the provider when a client completes an intake form
--   Fires on booking_intake_forms status pending → completed. The
--   notification is actionable and carries the booking so the provider
--   can jump straight to the responses.
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_intake_form_completed()
RETURNS TRIGGER AS $$
DECLARE
  v_provider_user UUID;
  v_booking       RECORD;
BEGIN
  IF NEW.status <> 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  SELECT user_id INTO v_provider_user
    FROM public.providers WHERE id = NEW.provider_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT customer_name, service_name_snapshot, booking_date
    INTO v_booking
    FROM public.bookings WHERE id = NEW.booking_id;

  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, metadata)
  VALUES (
    v_provider_user,
    'intake_form_completed',
    'Form Completed',
    COALESCE(v_booking.customer_name, 'A client') || ' filled in "' || NEW.title ||
      '" for their ' || COALESCE(v_booking.service_name_snapshot, 'appointment') ||
      COALESCE(' on ' || TO_CHAR(v_booking.booking_date, 'DD Mon'), '') || '.',
    'medium',
    TRUE,
    NEW.booking_id,
    NEW.provider_id,
    jsonb_build_object('form_id', NEW.id)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_intake_form_completed ON public.booking_intake_forms;
CREATE TRIGGER on_intake_form_completed
  AFTER UPDATE ON public.booking_intake_forms
  FOR EACH ROW EXECUTE FUNCTION public.handle_intake_form_completed();

-- ───────────────────────────────────────────────────────────
-- STEP 6: process_provider_daily_recap()
--   Runs daily at 07:00 UTC. Automations "newBookingRecap" toggle
--   (default ON when unset). Sends providers a morning summary of
--   today's confirmed/pending bookings. Duplicate guard: one per day.
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_provider_daily_recap()
RETURNS VOID AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      p.id      AS provider_id,
      p.user_id AS provider_user_id,
      COUNT(*)  AS booking_count,
      MIN(b.booking_time) AS first_time
    FROM public.providers p
    JOIN public.bookings b ON b.provider_id = p.id
    WHERE b.booking_date = CURRENT_DATE
      AND b.status IN ('pending', 'confirmed')
      AND COALESCE((p.automation_settings->>'newBookingRecap')::BOOLEAN, TRUE) = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
         WHERE n.user_id = p.user_id
           AND n.metadata->>'kind' = 'daily_recap'
           AND n.created_at::DATE = CURRENT_DATE
      )
    GROUP BY p.id, p.user_id
  LOOP
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, provider_id, metadata)
    VALUES (
      r.provider_user_id,
      'booking_reminder',
      'Today''s Schedule',
      'You have ' || r.booking_count || ' appointment' ||
        CASE WHEN r.booking_count = 1 THEN '' ELSE 's' END ||
        ' today, starting at ' || TO_CHAR(r.first_time, 'HH12:MI AM') || '.',
      'medium',
      TRUE,
      r.provider_id,
      jsonb_build_object('kind', 'daily_recap')
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT cron.schedule(
  'provider-daily-recap',
  '0 7 * * *',
  $$ SELECT public.process_provider_daily_recap(); $$
);

-- ============================================================
-- DONE — Info packs attach to bookings; daily recap scheduled
-- ============================================================
