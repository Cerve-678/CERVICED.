-- Fix: `v_lines || 'literal'` is ambiguous in plpgsql (Postgres tries to
-- parse the bare string as an array literal rather than appending it as an
-- element), which made award_points_on_booking_completed() error on every
-- real booking completion for the few minutes between this migration and the
-- previous one. Caught by a functional test in a rolled-back transaction
-- before it ever reached a real booking — see supabase/MIGRATION_OWNER.md.
-- array_append() is unambiguous.

CREATE OR REPLACE FUNCTION public.award_points_on_booking_completed()
RETURNS TRIGGER AS $$
DECLARE
  v_completed_count INT;
  v_provider_completed_count INT;
  v_dob DATE;
  v_total INT := 0;
  v_lines TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    INSERT INTO public.client_points_ledger (client_id, delta, reason, booking_id)
    VALUES (NEW.user_id, 50, 'booking_completed', NEW.id)
    ON CONFLICT DO NOTHING;
    IF FOUND THEN
      v_total := v_total + 50;
      v_lines := array_append(v_lines, 'completing your booking (+50)');
    END IF;

    SELECT count(*) INTO v_completed_count
    FROM public.bookings
    WHERE user_id = NEW.user_id AND status = 'completed';

    IF v_completed_count = 1 THEN
      INSERT INTO public.client_points_ledger (client_id, delta, reason, booking_id)
      VALUES (NEW.user_id, 200, 'first_booking', NEW.id)
      ON CONFLICT DO NOTHING;
      IF FOUND THEN
        v_total := v_total + 200;
        v_lines := array_append(v_lines, 'your first booking (+200)');
      END IF;
    END IF;

    SELECT count(*) INTO v_provider_completed_count
    FROM public.bookings
    WHERE user_id = NEW.user_id AND provider_id = NEW.provider_id AND status = 'completed';

    IF v_provider_completed_count >= 2 THEN
      INSERT INTO public.client_points_ledger (client_id, delta, reason, booking_id, provider_id)
      VALUES (NEW.user_id, 30, 'returning_client', NEW.id, NEW.provider_id)
      ON CONFLICT DO NOTHING;
      IF FOUND THEN
        v_total := v_total + 30;
        v_lines := array_append(v_lines, 'booking with them again (+30)');
      END IF;
    END IF;

    SELECT dob INTO v_dob FROM public.users WHERE id = NEW.user_id;
    IF v_dob IS NOT NULL
       AND TO_CHAR(v_dob, 'MM-DD') = TO_CHAR(NEW.booking_date, 'MM-DD')
       AND NOT EXISTS (
         SELECT 1 FROM public.client_points_ledger l
         WHERE l.client_id = NEW.user_id
           AND l.reason = 'birthday_bonus'
           AND l.created_at > NOW() - INTERVAL '300 days'
       )
    THEN
      INSERT INTO public.client_points_ledger (client_id, delta, reason, booking_id)
      VALUES (NEW.user_id, 50, 'birthday_bonus', NEW.id);
      v_total := v_total + 50;
      v_lines := array_append(v_lines, 'booking on your birthday (+50)');
    END IF;

    IF v_total > 0 THEN
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
      VALUES (
        NEW.user_id,
        'points_earned',
        'You earned ' || v_total || ' points! 🎉',
        'For ' || array_to_string(v_lines, ', ') || '.',
        'low',
        TRUE,
        NEW.id,
        NEW.provider_id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
