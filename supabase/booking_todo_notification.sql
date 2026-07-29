-- ════════════════════════════════════════════════════════════════════════════
-- booking_todo_notification.sql
-- Collapse the two separate "you have stuff to do" client notifications fired at
-- booking creation — intake form (handle_auto_send_intake_form → intake_form_received)
-- and info packs (handle_attach_info_packs → info_pack_received) — into ONE
-- "To Do" notification, so a new booking doesn't spam the client.
--
--   • Both attach functions keep attaching form/packs, but no longer notify.
--   • A new last-firing trigger (on_booking_todo_notify) checks whether the
--     booking ended up with a form and/or info pack and emits a single "To Do".
--
-- Trigger order: Postgres fires AFTER-INSERT row triggers alphabetically by name.
-- 'on_booking_todo_notify' sorts after 'on_booking_attach_info_packs' and
-- 'on_booking_auto_send_intake', so by the time it runs the rows exist.
--
-- Run AFTER: client_automation_jobs.sql, info_packs_bookings.sql,
-- fix_missing_notifications.sql (this file's CREATE OR REPLACE must win). Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. handle_auto_send_intake_form — attach only, no per-form notification ───
CREATE OR REPLACE FUNCTION public.handle_auto_send_intake_form()
RETURNS TRIGGER AS $$
DECLARE
  v_provider RECORD;
  v_form     RECORD;
BEGIN
  SELECT id, display_name INTO v_provider
    FROM public.providers WHERE id = NEW.provider_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT * INTO v_form
    FROM public.provider_form_library f
   WHERE f.provider_id = NEW.provider_id
     AND f.auto_send = TRUE
     AND (cardinality(f.service_names) = 0 OR NEW.service_name_snapshot = ANY(f.service_names))
   ORDER BY f.created_at DESC
   LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF EXISTS (SELECT 1 FROM public.booking_intake_forms bf WHERE bf.booking_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.booking_intake_forms
    (booking_id, provider_id, client_user_id, title, questions, requires_signature, library_form_id)
  VALUES
    (NEW.id, NEW.provider_id, NEW.user_id, v_form.title, v_form.questions, v_form.requires_signature, v_form.id);

  UPDATE public.provider_form_library
     SET sent_count = COALESCE(sent_count, 0) + 1
   WHERE id = v_form.id;

  -- Per-form 'intake_form_received' notice removed — folded into the single
  -- "To Do" notification emitted by handle_booking_todo_notification().
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 2. handle_attach_info_packs — attach only, no per-pack notification ───────
CREATE OR REPLACE FUNCTION public.handle_attach_info_packs()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_provider RECORD;
BEGIN
  SELECT id, user_id, display_name INTO v_provider
    FROM public.providers WHERE id = NEW.provider_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  INSERT INTO public.booking_info_packs
    (booking_id, info_pack_id, provider_id, client_user_id, title, service, content)
  SELECT NEW.id, ip.id, v_provider.id, NEW.user_id, ip.title, NEW.service_name_snapshot, ip.content
    FROM public.info_packs ip
   WHERE ip.provider_id IN (v_provider.id, v_provider.user_id)
     AND (NEW.service_name_snapshot = ANY(ip.service_names) OR cardinality(ip.service_names) = 0)
  ON CONFLICT (booking_id, info_pack_id) DO NOTHING;

  -- Per-pack 'info_pack_received' notice removed — folded into the single
  -- "To Do" notification emitted by handle_booking_todo_notification().
  RETURN NEW;
END;
$$;

-- ── 3. The single combined "To Do" notification ──────────────────────────────
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

  IF NOT v_has_form AND NOT v_has_packs THEN
    RETURN NEW;  -- nothing to do
  END IF;

  IF v_has_form AND v_has_packs THEN
    v_msg := 'You have a form to fill in and an info pack to read for your ' ||
             NEW.service_name_snapshot || ' booking.';
  ELSIF v_has_form THEN
    v_msg := 'You have a form to fill in for your ' ||
             NEW.service_name_snapshot || ' booking.';
  ELSE
    v_msg := 'You have an info pack to read for your ' ||
             NEW.service_name_snapshot || ' booking.';
  END IF;

  -- Type drives deep-linking (both are BOOKING_TYPES in notificationTapHandler →
  -- the client opens the booking, whose TO DO section shows the form/packs).
  v_type := CASE WHEN v_has_form THEN 'intake_form_received' ELSE 'info_pack_received' END;

  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
  VALUES (
    NEW.user_id, v_type, 'To Do', v_msg,
    CASE WHEN v_has_form THEN 'high' ELSE 'medium' END,
    TRUE, NEW.id, NEW.provider_id, 'client'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Name sorts AFTER on_booking_attach_info_packs / on_booking_auto_send_intake,
-- so the form + packs are already attached when this runs.
DROP TRIGGER IF EXISTS on_booking_todo_notify ON public.bookings;
CREATE TRIGGER on_booking_todo_notify
  AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.handle_booking_todo_notification();
