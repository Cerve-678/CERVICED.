-- A held slot is not a booking, and three triggers never learned that.
--
-- `on_hold` was introduced by waitlist_holds.sql (2026-08-02) as a real
-- bookings row, deliberately: reusing the table means the hold is respected
-- by bookings_no_overlap and every existing conflict check for free. That
-- migration added an early-return guard to handle_new_booking() so a hold
-- wouldn't fire "Booking Request Sent" / "New Booking Request".
--
-- It added that guard to ONE of the four AFTER INSERT triggers on bookings.
-- The other three have been firing on every hold ever since:
--
--   * handle_auto_send_intake_form   — inserts a booking_intake_forms row AND
--                                      increments provider_form_library.sent_count
--   * handle_attach_info_packs       — inserts booking_info_packs rows
--   * handle_booking_todo_notification — tells the CLIENT "To Do: you have a
--                                      form to fill in for your <service>
--                                      booking", is_actionable, priority high
--
-- Both hold producers are affected:
--
--   * invite_next_waitlist_entry() — the client is told a slot is held for
--     them AND, separately, to go fill in a form for it. If they let the hold
--     lapse (or decline it), they were asked to complete paperwork for an
--     appointment that never existed and now never will.
--   * hold_cart_booking_slots() — an abandoned checkout leaves the same
--     residue. The 10-minute TTL cancels the booking row; it does not
--     retract the notification or delete the intake form.
--
-- sent_count is the quietest casualty: it counts holds, so a provider's
-- "forms sent" figure has always been inflated by every hold that was never
-- claimed, with no way to tell the real sends from the phantom ones.
--
-- The guard is the same shape handle_new_booking() already uses. It is
-- deliberately an early return on INSERT rather than a WHEN clause on the
-- trigger, so the three functions stay individually correct if they are ever
-- called from somewhere else.
--
-- Nothing is lost by skipping these at hold time: claim_waitlist_hold() and
-- claim_cart_booking_slots() both UPDATE the row's status rather than
-- inserting a new one, so the AFTER INSERT triggers would not re-fire when a
-- hold becomes real either way. Part 2 below closes that, so a claimed hold
-- gets the forms, packs and To Do notification it should have had.
--
-- Safe to re-run.

-- ── 1. Skip the side effects while the row is only a hold ────────────────────

CREATE OR REPLACE FUNCTION public.handle_auto_send_intake_form()
RETURNS TRIGGER AS $$
DECLARE
  v_provider RECORD;
  v_form     RECORD;
BEGIN
  IF NEW.status = 'on_hold' THEN
    RETURN NEW;
  END IF;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.handle_attach_info_packs()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_provider RECORD;
BEGIN
  IF NEW.status = 'on_hold' THEN
    RETURN NEW;
  END IF;

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

CREATE OR REPLACE FUNCTION public.handle_booking_todo_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_has_form  BOOLEAN;
  v_has_packs BOOLEAN;
  v_type      TEXT;
  v_msg       TEXT;
BEGIN
  IF NEW.status = 'on_hold' THEN
    RETURN NEW;
  END IF;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ── 2. Apply them when the hold becomes a real booking ───────────────────────
--
-- Part 1 alone would lose these outright rather than defer them. Both claim
-- paths — claim_waitlist_hold() and claim_cart_booking_slots() — turn a hold
-- into a real booking with an UPDATE on the existing row, never a fresh
-- INSERT, so the AFTER INSERT triggers above cannot fire a second time to
-- pick up what they skipped. Without this part, every booking that arrived
-- through a hold would silently never receive its intake form, its info
-- packs, or its To Do notification.
--
-- That is not a new risk introduced here — it is the shape of the bug this
-- migration exists to fix, arriving from the other direction. Before Part 1
-- the side effects fired at the wrong moment (on a hold that might never
-- become anything); the fix is to move them, not to drop them.
--
-- Ordering below matches the AFTER INSERT trigger firing order exactly.
-- Postgres runs same-timing triggers alphabetically by trigger name, which
-- gives on_booking_attach_info_packs -> on_booking_auto_send_intake ->
-- on_booking_todo_notify. The To Do notification reads the rows the other
-- two write, so it has to stay last or it will find nothing and return early.

CREATE OR REPLACE FUNCTION public.apply_hold_claimed_side_effects()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_provider  RECORD;
  v_form      RECORD;
  v_has_form  BOOLEAN;
  v_has_packs BOOLEAN;
  v_type      TEXT;
  v_msg       TEXT;
BEGIN
  -- Only a hold that became real. A hold that expired or was declined goes
  -- on_hold -> cancelled and must stay silent: that client is being told the
  -- slot is gone, not handed paperwork for it.
  IF NOT (OLD.status = 'on_hold' AND NEW.status NOT IN ('on_hold', 'cancelled', 'no_show')) THEN
    RETURN NEW;
  END IF;

  SELECT id, user_id, display_name INTO v_provider
    FROM public.providers WHERE id = NEW.provider_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- (a) info packs
  INSERT INTO public.booking_info_packs
    (booking_id, info_pack_id, provider_id, client_user_id, title, service, content)
  SELECT NEW.id, ip.id, v_provider.id, NEW.user_id, ip.title, NEW.service_name_snapshot, ip.content
    FROM public.info_packs ip
   WHERE ip.provider_id IN (v_provider.id, v_provider.user_id)
     AND (NEW.service_name_snapshot = ANY(ip.service_names) OR cardinality(ip.service_names) = 0)
  ON CONFLICT (booking_id, info_pack_id) DO NOTHING;

  -- (b) auto-send intake form
  SELECT * INTO v_form FROM public.provider_form_library f
   WHERE f.provider_id = NEW.provider_id AND f.auto_send = TRUE
     AND (cardinality(f.service_names) = 0 OR NEW.service_name_snapshot = ANY(f.service_names))
   ORDER BY f.created_at DESC LIMIT 1;
  IF FOUND AND NOT EXISTS (
    SELECT 1 FROM public.booking_intake_forms bf WHERE bf.booking_id = NEW.id
  ) THEN
    INSERT INTO public.booking_intake_forms
      (booking_id, provider_id, client_user_id, title, questions, requires_signature, library_form_id)
    VALUES (NEW.id, NEW.provider_id, NEW.user_id, v_form.title, v_form.questions,
            v_form.requires_signature, v_form.id);
    -- Now counts real sends only. Holds no longer reach this line, so the
    -- figure stops drifting upward on abandoned checkouts and lapsed
    -- waitlist offers. Historic inflation is not corrected: there is no
    -- record of which past increments came from a hold.
    UPDATE public.provider_form_library
       SET sent_count = COALESCE(sent_count, 0) + 1 WHERE id = v_form.id;
  END IF;

  -- (c) combined To Do notification, reading what (a) and (b) just wrote
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

  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
  VALUES (NEW.user_id, v_type, 'To Do', v_msg,
    CASE WHEN v_has_form THEN 'high' ELSE 'medium' END, TRUE, NEW.id, NEW.provider_id, 'client');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_hold_claimed_apply_side_effects ON public.bookings;
CREATE TRIGGER on_hold_claimed_apply_side_effects
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.apply_hold_claimed_side_effects();

-- Trigger functions are never called directly by a client session.
REVOKE ALL ON FUNCTION public.apply_hold_claimed_side_effects() FROM PUBLIC, anon, authenticated;
