-- Stop awarding +30 points for completing another booking with the same
-- provider (`returning_client`).
--
-- Redefines award_points_on_booking_completed() from the LIVE definition
-- (md5 fc6b7188cddaff0fed1fe710440bd00c, read 2026-10-20) with only the
-- returning_client block and its counter removed. Every other award
-- (+2 completed, +100 first booking, +50 birthday) and the points_earned
-- notification are unchanged.
--
-- Points already awarded for returning_client stay in client_points_ledger:
-- this only stops new ones. The Points screen keeps its label for that reason
-- so those history rows still read correctly. The rule was never listed under
-- "Ways to earn", so no app copy advertises it.
--
-- Frontier at authoring: 20261019233000 (20261019235500 written, unapplied).

CREATE OR REPLACE FUNCTION public.award_points_on_booking_completed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_completed_count INT;
  v_dob DATE;
  v_total INT := 0;
  v_lines TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    INSERT INTO public.client_points_ledger (client_id, delta, reason, booking_id)
    VALUES (NEW.user_id, 2, 'booking_completed', NEW.id)
    ON CONFLICT DO NOTHING;
    IF FOUND THEN
      v_total := v_total + 2;
      v_lines := array_append(v_lines, 'completing your booking (+2)');
    END IF;

    SELECT count(*) INTO v_completed_count
    FROM public.bookings
    WHERE user_id = NEW.user_id AND status = 'completed';

    IF v_completed_count = 1 THEN
      INSERT INTO public.client_points_ledger (client_id, delta, reason, booking_id)
      VALUES (NEW.user_id, 100, 'first_booking', NEW.id)
      ON CONFLICT DO NOTHING;
      IF FOUND THEN
        v_total := v_total + 100;
        v_lines := array_append(v_lines, 'your first booking (+100)');
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
$function$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261020120000', 'remove_returning_client_points')
ON CONFLICT (version) DO NOTHING;
