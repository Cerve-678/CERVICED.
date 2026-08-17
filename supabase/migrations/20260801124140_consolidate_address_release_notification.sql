-- Shared notification helper
CREATE OR REPLACE FUNCTION public.notify_address_released(p_booking_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b RECORD;
BEGIN
  SELECT id, user_id, provider_id, service_name_snapshot, provider_name_snapshot, booking_date
    INTO b
  FROM public.bookings
  WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
  VALUES (
    b.user_id,
    'address_released',
    'Address Now Available',
    'The location for your ' || b.service_name_snapshot ||
      ' with ' || b.provider_name_snapshot ||
      ' on ' || TO_CHAR(b.booking_date, 'DD Mon YYYY') ||
      ' has been shared — tap to view.',
    'medium', TRUE, b.id, b.provider_id, 'client'
  )
  ON CONFLICT (booking_id, user_id) WHERE (type = 'address_released') DO NOTHING;
END;
$$;

-- Schema-level dedup guard
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_address_released
  ON public.notifications (booking_id, user_id)
  WHERE (type = 'address_released');

-- Redefine auto_release_address() to use the shared helper
CREATE OR REPLACE FUNCTION public.auto_release_address()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      PERFORM public.notify_address_released(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_release_address ON public.bookings;
CREATE TRIGGER trg_auto_release_address
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.auto_release_address();

-- Redefine process_address_release_notifications() to use the shared helper
CREATE OR REPLACE FUNCTION public.process_address_release_notifications()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r        RECORD;
  v_hours  INT;
BEGIN
  FOR r IN
    SELECT
      b.id                    AS booking_id,
      b.booking_date,
      b.booking_time,
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

    PERFORM public.notify_address_released(r.booking_id);
  END LOOP;
END;
$$;
;
