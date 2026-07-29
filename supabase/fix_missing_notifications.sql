  -- ════════════════════════════════════════════════════════════════════════════
  -- fix_missing_notifications.sql
  -- Fixes recipient_role on existing triggers that pre-date the column,
  -- adds new_provider notification when a provider goes live,
  -- and adds an RPC for manually attaching an info pack to a booking.
  -- Safe to re-run (CREATE OR REPLACE / IF NOT EXISTS throughout).
  -- ════════════════════════════════════════════════════════════════════════════

  -- ── 1. Fix notify_on_new_chat_message() ──────────────────────────────────────
  -- Was inserting without recipient_role → both sides defaulted to 'client'.
  -- Provider-direction messages (client → provider) were invisible in provider mode.
  CREATE OR REPLACE FUNCTION public.notify_on_new_chat_message()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
  DECLARE
    v_user_id          UUID;
    v_provider_id      UUID;
    v_provider_user_id UUID;
    v_provider_name    TEXT;
    v_recipient        UUID;
    v_sender_name      TEXT;
    v_recipient_role   TEXT;
  BEGIN
    SELECT c.user_id, c.provider_id, p.user_id, p.display_name
      INTO v_user_id, v_provider_id, v_provider_user_id, v_provider_name
      FROM public.provider_conversations c
      JOIN public.providers p ON p.id = c.provider_id
    WHERE c.id = NEW.conversation_id;

    IF v_user_id IS NULL THEN RETURN NEW; END IF;

    IF NEW.sender_type = 'user' THEN
      v_recipient      := v_provider_user_id;
      v_recipient_role := 'provider';
      SELECT COALESCE(u.name, 'A client') INTO v_sender_name
        FROM public.users u WHERE u.id = v_user_id;
    ELSE
      v_recipient      := v_user_id;
      v_recipient_role := 'client';
      v_sender_name    := v_provider_name;
    END IF;

    IF v_recipient IS NULL THEN RETURN NEW; END IF;

    -- Debounce: one notification per conversation partner per 10 minutes
    IF EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id        = v_recipient
        AND n.type           = 'new_message'
        AND n.provider_id    = v_provider_id
        AND n.recipient_role = v_recipient_role
        AND n.is_read        = FALSE
        AND n.created_at     > NOW() - INTERVAL '10 minutes'
    ) THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, provider_id, recipient_role)
    VALUES (
      v_recipient,
      'new_message',
      'New message from ' || COALESCE(v_sender_name, 'your conversation'),
      LEFT(NEW.content, 120) || CASE WHEN LENGTH(NEW.content) > 120 THEN '…' ELSE '' END,
      'medium', TRUE, v_provider_id, v_recipient_role
    );

    RETURN NEW;
  END;
  $$;

  DROP TRIGGER IF EXISTS trg_notify_new_chat_message ON public.provider_messages;
  CREATE TRIGGER trg_notify_new_chat_message
    AFTER INSERT ON public.provider_messages
    FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_chat_message();

  -- ── 2. Fix handle_intake_form_completed() ────────────────────────────────────
  -- Was defaulting recipient_role to 'client' — but this goes to the PROVIDER.
  CREATE OR REPLACE FUNCTION public.handle_intake_form_completed()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
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
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, metadata, recipient_role)
    VALUES (
      v_provider_user,
      'intake_form_completed',
      'Form Completed',
      COALESCE(v_booking.customer_name, 'A client') || ' filled in "' || NEW.title ||
        '" for their ' || COALESCE(v_booking.service_name_snapshot, 'appointment') ||
        COALESCE(' on ' || TO_CHAR(v_booking.booking_date, 'DD Mon'), '') || '.',
      'medium', TRUE, NEW.booking_id, NEW.provider_id,
      jsonb_build_object('form_id', NEW.id),
      'provider'
    );

    RETURN NEW;
  END;
  $$;

  DROP TRIGGER IF EXISTS on_intake_form_completed ON public.booking_intake_forms;
  CREATE TRIGGER on_intake_form_completed
    AFTER UPDATE ON public.booking_intake_forms
    FOR EACH ROW EXECUTE FUNCTION public.handle_intake_form_completed();

  -- ── 3. Fix handle_attach_info_packs() — explicit recipient_role ───────────────
  CREATE OR REPLACE FUNCTION public.handle_attach_info_packs()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
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
      AND (NEW.service_name_snapshot = ANY(ip.service_names) OR cardinality(ip.service_names) = 0)
    ON CONFLICT (booking_id, info_pack_id) DO NOTHING;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
      VALUES (
        NEW.user_id, 'info_pack_received', 'Info From Your Provider',
        COALESCE(v_provider.display_name, 'Your provider') ||
          ' sent you prep & aftercare info for your ' || NEW.service_name_snapshot ||
          ' — open the booking to read it.',
        'medium', TRUE, NEW.id, v_provider.id, 'client'
      );
    END IF;

    RETURN NEW;
  END;
  $$;

  DROP TRIGGER IF EXISTS on_booking_attach_info_packs ON public.bookings;
  CREATE TRIGGER on_booking_attach_info_packs
    AFTER INSERT ON public.bookings
    FOR EACH ROW EXECUTE FUNCTION public.handle_attach_info_packs();

  -- ── 4. Fix handle_new_info_pack() — explicit recipient_role ──────────────────
  CREATE OR REPLACE FUNCTION public.handle_new_info_pack()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
  DECLARE
    v_provider RECORD;
    b          RECORD;
  BEGIN
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
        AND (bk.service_name_snapshot = ANY(NEW.service_names) OR cardinality(NEW.service_names) = 0)
    LOOP
      INSERT INTO public.booking_info_packs
        (booking_id, info_pack_id, provider_id, client_user_id, title, service, content)
      VALUES (b.id, NEW.id, v_provider.id, b.user_id, NEW.title, b.service_name_snapshot, NEW.content)
      ON CONFLICT (booking_id, info_pack_id) DO NOTHING;

      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
      VALUES (
        b.user_id, 'info_pack_received', 'Info From Your Provider',
        COALESCE(v_provider.display_name, 'Your provider') || ' sent you "' || NEW.title ||
          '" for your ' || b.service_name_snapshot || ' — open the booking to read it.',
        'medium', TRUE, b.id, v_provider.id, 'client'
      );
    END LOOP;

    RETURN NEW;
  END;
  $$;

  DROP TRIGGER IF EXISTS on_info_pack_created ON public.info_packs;
  CREATE TRIGGER on_info_pack_created
    AFTER INSERT ON public.info_packs
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_info_pack();

  -- ── 5. new_provider — notify bookmarked clients when provider goes live ───────
  CREATE OR REPLACE FUNCTION public.handle_provider_gone_live()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
  BEGIN
    IF NEW.has_gone_live = TRUE AND (OLD.has_gone_live IS DISTINCT FROM TRUE) THEN
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, provider_id, recipient_role)
      SELECT
        bm.user_id,
        'new_provider',
        COALESCE(NEW.display_name, 'A provider') || ' is now live!',
        'A provider you bookmarked is now accepting bookings. Tap to check their services.',
        'medium', TRUE, NEW.id, 'client'
      FROM public.bookmarks bm
      WHERE bm.provider_id = NEW.id;
    END IF;
    RETURN NEW;
  END;
  $$;

  DROP TRIGGER IF EXISTS trg_provider_gone_live ON public.providers;
  CREATE TRIGGER trg_provider_gone_live
    AFTER UPDATE OF has_gone_live ON public.providers
    FOR EACH ROW EXECUTE FUNCTION public.handle_provider_gone_live();

  -- ── 6. RPC: manually attach an info pack to a specific booking ────────────────
  CREATE OR REPLACE FUNCTION public.attach_info_pack_to_booking(
    p_booking_id   UUID,
    p_info_pack_id UUID
  ) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
  DECLARE
    v_pack    RECORD;
    v_booking RECORD;
    v_provider RECORD;
    v_rows    INT;
  BEGIN
    SELECT * INTO v_pack FROM public.info_packs WHERE id = p_info_pack_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Info pack not found'; END IF;

    SELECT user_id, provider_id, service_name_snapshot
      INTO v_booking FROM public.bookings WHERE id = p_booking_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;

    SELECT id, display_name INTO v_provider
      FROM public.providers WHERE id = v_booking.provider_id;

    INSERT INTO public.booking_info_packs
      (booking_id, info_pack_id, provider_id, client_user_id, title, service, content)
    VALUES
      (p_booking_id, p_info_pack_id, v_provider.id, v_booking.user_id,
      v_pack.title, v_booking.service_name_snapshot, v_pack.content)
    ON CONFLICT (booking_id, info_pack_id) DO NOTHING;

    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF v_rows > 0 THEN
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
      VALUES (
        v_booking.user_id, 'info_pack_received', 'Info From Your Provider',
        COALESCE(v_provider.display_name, 'Your provider') || ' sent you "' || v_pack.title ||
          '" for your ' || v_booking.service_name_snapshot || ' — open the booking to read it.',
        'medium', TRUE, p_booking_id, v_provider.id, 'client'
      );
    END IF;
  END;
  $$;
