-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260718170808
-- Remote name: address_release_notification
-- Do not edit this recovery archive; create a new tracked migration for changes.

-- ── 1. Add address_released to the type CHECK constraint ─────────────────────
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
    'new_message',
    'address_released'
  )) NOT VALID;

-- ── 2. Extend auto_release_address trigger to also notify the client ──────────
CREATE OR REPLACE FUNCTION public.auto_release_address()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_released BOOLEAN := FALSE;
BEGIN
  IF NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM 'confirmed' THEN
    UPDATE public.bookings
       SET address_released_at = NOW()
     WHERE id = NEW.id
       AND address_released_at IS NULL
       AND EXISTS (
         SELECT 1 FROM public.providers p
          WHERE p.id = NEW.provider_id
            AND p.address_release_policy = 'on_confirmation'
       );

    GET DIAGNOSTICS v_released = ROW_COUNT;

    IF v_released THEN
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
      VALUES (
        NEW.user_id,
        'address_released',
        'Address Now Available',
        'The location for your ' || NEW.service_name_snapshot ||
          ' with ' || NEW.provider_name_snapshot ||
          ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') ||
          ' has been shared — tap to view.',
        'medium', TRUE, NEW.id, NEW.provider_id, 'client'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ── 3. Cron function for time-based release policies ─────────────────────────
CREATE OR REPLACE FUNCTION public.process_address_release_notifications()
RETURNS VOID AS $$
DECLARE
  r        RECORD;
  v_hours  INT;
BEGIN
  FOR r IN
    SELECT
      b.id                    AS booking_id,
      b.user_id,
      b.booking_date,
      b.booking_time,
      b.provider_id,
      b.service_name_snapshot,
      b.provider_name_snapshot,
      p.address_release_policy
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
    WHERE b.status IN ('confirmed', 'in_progress')
      AND b.address_released_at IS NULL
      AND p.address_release_policy IN (
        'day_before', 'two_days_before', 'three_days_before',
        'five_days_before', 'week_before'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
         WHERE n.booking_id = b.id
           AND n.user_id    = b.user_id
           AND n.type       = 'address_released'
      )
  LOOP
    v_hours := CASE r.address_release_policy
      WHEN 'day_before'        THEN 24
      WHEN 'two_days_before'   THEN 48
      WHEN 'three_days_before' THEN 72
      WHEN 'five_days_before'  THEN 120
      WHEN 'week_before'       THEN 168
      ELSE NULL
    END;

    CONTINUE WHEN v_hours IS NULL;

    CONTINUE WHEN now() < (
      (r.booking_date::TIMESTAMP + r.booking_time) AT TIME ZONE 'UTC'
      - (v_hours || ' hours')::INTERVAL
    );

    UPDATE public.bookings
       SET address_released_at = NOW()
     WHERE id = r.booking_id AND address_released_at IS NULL;

    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      r.user_id,
      'address_released',
      'Address Now Available',
      'The location for your ' || r.service_name_snapshot ||
        ' with ' || r.provider_name_snapshot ||
        ' on ' || TO_CHAR(r.booking_date, 'DD Mon YYYY') ||
        ' has been shared — tap to view.',
      'medium', TRUE, r.booking_id, r.provider_id, 'client'
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 4. Schedule the hourly cron ───────────────────────────────────────────────
SELECT cron.schedule(
  'address-release-notifications',
  '0 * * * *',
  $$ SELECT public.process_address_release_notifications(); $$
);
