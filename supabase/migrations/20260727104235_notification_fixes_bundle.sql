-- notification_fixes_bundle: recipient_role, clean handle_new_booking, To Do merge

-- ── 1. recipient_role column ────────────────────────────────────────────────
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS recipient_role TEXT NOT NULL DEFAULT 'client'
  CHECK (recipient_role IN ('provider', 'client'));

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_role
  ON public.notifications (recipient_role);

UPDATE public.notifications
SET recipient_role = 'provider'
WHERE type IN ('review_received','booking_not_started','intake_form_reminder','provider_message','balance_reminder');

UPDATE public.notifications n
SET recipient_role = 'provider'
WHERE n.type IN ('booking_pending','booking_reminder','booking_cancelled','reschedule_request','intake_form_completed','balance_collected')
  AND n.provider_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.providers p WHERE p.id = n.provider_id AND p.user_id = n.user_id);

-- ── handle_booking_status_change (client-only confirm; both-sides cancel) ─────
CREATE OR REPLACE FUNCTION public.handle_booking_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'confirmed' AND OLD.status = 'pending' THEN
    INSERT INTO public.notifications (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (NEW.user_id, 'booking_confirmed', 'Booking Confirmed! 🎉',
      NEW.provider_name_snapshot || ' confirmed your booking for ' || NEW.service_name_snapshot ||
      ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || ' at ' || TO_CHAR(NEW.booking_time, 'HH12:MI AM') || '.',
      'high', TRUE, NEW.id, NEW.provider_id, 'client');
    RETURN NEW;
  END IF;
  IF NEW.status = 'cancelled' AND OLD.status = 'pending' THEN
    INSERT INTO public.notifications (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (NEW.user_id, 'booking_declined', 'Booking Declined',
      'Unfortunately, ' || NEW.provider_name_snapshot || ' is unable to accept your booking for ' ||
      NEW.service_name_snapshot || ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || '.',
      'high', FALSE, NEW.id, NEW.provider_id, 'client');
    RETURN NEW;
  END IF;
  IF NEW.status = 'in_progress' AND OLD.status != 'in_progress' THEN
    INSERT INTO public.notifications (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (NEW.user_id, 'booking_in_progress', 'Your Appointment Has Started',
      NEW.provider_name_snapshot || ' has started your ' || NEW.service_name_snapshot || ' appointment.',
      'high', FALSE, NEW.id, NEW.provider_id, 'client');
    RETURN NEW;
  END IF;
  IF NEW.status = 'no_show' AND OLD.status != 'no_show' THEN
    INSERT INTO public.notifications (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (NEW.user_id, 'no_show', 'Missed Appointment',
      'Your appointment with ' || NEW.provider_name_snapshot || ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') ||
      ' was marked as a no-show.', 'high', FALSE, NEW.id, NEW.provider_id, 'client');
    RETURN NEW;
  END IF;
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' AND OLD.status != 'pending' THEN
    INSERT INTO public.notifications (user_id, type, title, message, priority, is_actionable, booking_id, recipient_role)
    VALUES (NEW.user_id, 'booking_cancelled', 'Booking Cancelled',
      'Your booking with ' || NEW.provider_name_snapshot || ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || ' has been cancelled.',
      'high', FALSE, NEW.id, 'client');
    INSERT INTO public.notifications (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    SELECT p.user_id, 'booking_cancelled', 'Booking Cancelled',
      COALESCE(NEW.customer_name, 'A client') || ' cancelled their ' || NEW.service_name_snapshot ||
      ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || '.', 'medium', FALSE, NEW.id, NEW.provider_id, 'provider'
    FROM public.providers p WHERE p.id = NEW.provider_id;
    RETURN NEW;
  END IF;
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    IF COALESCE((SELECT (p.automation_settings->>'autoReviewRequest')::BOOLEAN FROM public.providers p WHERE p.id = NEW.provider_id), TRUE) THEN
      INSERT INTO public.notifications (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
      VALUES (NEW.user_id, 'review_request', 'How was your appointment?',
        'Leave a review for ' || NEW.provider_name_snapshot || '. Your feedback helps others find great providers.',
        'medium', TRUE, NEW.id, NEW.provider_id, 'client');
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── handle_new_booking (auto → provider "You have a new booking", no client "awaiting") ──
CREATE OR REPLACE FUNCTION public.handle_new_booking()
RETURNS TRIGGER AS $$
DECLARE
  v_provider_user_id UUID;
  v_auto_accept      BOOLEAN;
BEGIN
  SELECT p.user_id, p.auto_accept_bookings INTO v_provider_user_id, v_auto_accept
    FROM public.providers p WHERE p.id = NEW.provider_id;

  IF v_auto_accept THEN
    UPDATE public.bookings SET status = 'confirmed', confirmed_at = NOW() WHERE id = NEW.id;
    INSERT INTO public.notifications (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (v_provider_user_id, 'booking_confirmed', 'You have a new booking',
      COALESCE(NEW.customer_name, 'A client') || ' booked ' || NEW.service_name_snapshot ||
      ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || ' at ' || TO_CHAR(NEW.booking_time, 'HH12:MI AM') || '.',
      'high', FALSE, NEW.id, NEW.provider_id, 'provider');
  ELSE
    INSERT INTO public.notifications (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (NEW.user_id, 'booking_pending', 'Booking Request Sent',
      'Your request with ' || NEW.provider_name_snapshot || ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') ||
      ' at ' || TO_CHAR(NEW.booking_time, 'HH12:MI AM') || ' is awaiting confirmation.',
      'high', TRUE, NEW.id, NEW.provider_id, 'client');
    INSERT INTO public.notifications (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (v_provider_user_id, 'booking_pending', 'New Booking Request',
      COALESCE(NEW.customer_name, 'A client') || ' requested ' || NEW.service_name_snapshot ||
      ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || '. Please confirm or decline.',
      'high', TRUE, NEW.id, NEW.provider_id, 'provider');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── attach functions: attach only, no per-item notification ──────────────────
CREATE OR REPLACE FUNCTION public.handle_auto_send_intake_form()
RETURNS TRIGGER AS $$
DECLARE
  v_provider RECORD;
  v_form     RECORD;
BEGIN
  SELECT id, display_name INTO v_provider FROM public.providers WHERE id = NEW.provider_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT * INTO v_form FROM public.provider_form_library f
   WHERE f.provider_id = NEW.provider_id AND f.auto_send = TRUE
     AND (cardinality(f.service_names) = 0 OR NEW.service_name_snapshot = ANY(f.service_names))
   ORDER BY f.created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.booking_intake_forms bf WHERE bf.booking_id = NEW.id) THEN RETURN NEW; END IF;
  INSERT INTO public.booking_intake_forms
    (booking_id, provider_id, client_user_id, title, questions, requires_signature, library_form_id)
  VALUES (NEW.id, NEW.provider_id, NEW.user_id, v_form.title, v_form.questions, v_form.requires_signature, v_form.id);
  UPDATE public.provider_form_library SET sent_count = COALESCE(sent_count, 0) + 1 WHERE id = v_form.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.handle_attach_info_packs()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_provider RECORD;
BEGIN
  SELECT id, user_id, display_name INTO v_provider FROM public.providers WHERE id = NEW.provider_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  INSERT INTO public.booking_info_packs
    (booking_id, info_pack_id, provider_id, client_user_id, title, service, content)
  SELECT NEW.id, ip.id, v_provider.id, NEW.user_id, ip.title, NEW.service_name_snapshot, ip.content
    FROM public.info_packs ip
   WHERE ip.provider_id IN (v_provider.id, v_provider.user_id)
     AND (NEW.service_name_snapshot = ANY(ip.service_names) OR cardinality(ip.service_names) = 0)
  ON CONFLICT (booking_id, info_pack_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ── single combined "To Do" notification (last-firing trigger) ───────────────
CREATE OR REPLACE FUNCTION public.handle_booking_todo_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_has_form  BOOLEAN;
  v_has_packs BOOLEAN;
  v_type      TEXT;
  v_msg       TEXT;
BEGIN
  v_has_form  := EXISTS (SELECT 1 FROM public.booking_intake_forms WHERE booking_id = NEW.id);
  v_has_packs := EXISTS (SELECT 1 FROM public.booking_info_packs   WHERE booking_id = NEW.id);
  IF NOT v_has_form AND NOT v_has_packs THEN RETURN NEW; END IF;
  IF v_has_form AND v_has_packs THEN
    v_msg := 'You have a form to fill in and an info pack to read for your ' || NEW.service_name_snapshot || ' booking.';
  ELSIF v_has_form THEN
    v_msg := 'You have a form to fill in for your ' || NEW.service_name_snapshot || ' booking.';
  ELSE
    v_msg := 'You have an info pack to read for your ' || NEW.service_name_snapshot || ' booking.';
  END IF;
  v_type := CASE WHEN v_has_form THEN 'intake_form_received' ELSE 'info_pack_received' END;
  INSERT INTO public.notifications (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
  VALUES (NEW.user_id, v_type, 'To Do', v_msg,
    CASE WHEN v_has_form THEN 'high' ELSE 'medium' END, TRUE, NEW.id, NEW.provider_id, 'client');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_booking_todo_notify ON public.bookings;
CREATE TRIGGER on_booking_todo_notify
  AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.handle_booking_todo_notification();

-- ── address auto-release on confirm (+ backfill) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_release_address()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM 'confirmed' THEN
    UPDATE public.bookings SET address_released_at = NOW()
    WHERE id = NEW.id AND address_released_at IS NULL
      AND EXISTS (SELECT 1 FROM public.providers p WHERE p.id = NEW.provider_id AND p.address_release_policy = 'on_confirmation');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_release_address ON public.bookings;
CREATE TRIGGER trg_auto_release_address
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.auto_release_address();

UPDATE public.bookings b
SET address_released_at = COALESCE(b.confirmed_at, b.updated_at, NOW())
FROM public.providers p
WHERE b.provider_id = p.id
  AND p.address_release_policy = 'on_confirmation'
  AND b.address_released_at IS NULL
  AND b.status IN ('confirmed', 'in_progress', 'completed');;
