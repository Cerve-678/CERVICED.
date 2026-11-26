-- The "slot opened" notification leads with the time that's the client's.
--
-- Was:  "A slot opened up!" / "Classic Full Set with Studio Ren on 20 Nov at
--       2:00pm is held for you for 10 minutes. Confirm and pay in Bookings
--       before it's offered to someone else."
-- Now:  "Fri 20 Nov, 2:00pm is yours for 10 min" /
--       "Classic Full Set with Studio Ren. Tap to confirm and pay."
--
-- The wording the user picked on 2026-11-24 (the waitlist ticket mockup). The
-- notification opens the slot's ticket, where it's paid for (#735, #737).
-- Only the title and message change: offer_waitlist_slot is rebuilt from its
-- live definition, guarded by md5 so a newer version is never overwritten.

BEGIN;

DO $$
BEGIN
  IF (SELECT md5(pg_get_functiondef('public.offer_waitlist_slot(uuid,uuid,date,time without time zone,time without time zone)'::regprocedure)))
     <> 'c046664ded4cf7ac1753d2a8f82e2118' THEN
    RAISE EXCEPTION 'offer_waitlist_slot changed live since this migration was written';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.offer_waitlist_slot(p_entry_id uuid, p_service_id uuid, p_booking_date date, p_booking_time time without time zone, p_end_time time without time zone DEFAULT NULL::time without time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  w public.provider_waitlist%ROWTYPE;
  v_service public.services%ROWTYPE;
  v_provider public.providers%ROWTYPE;
  v_hold interval := public.waitlist_hold_duration();
  v_end time;
  v_booking_id uuid;
BEGIN
  SELECT * INTO w FROM public.provider_waitlist WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND OR w.status <> 'waiting' THEN
    RAISE EXCEPTION 'This client is no longer waiting for a slot';
  END IF;
  SELECT * INTO v_provider FROM public.providers WHERE id = w.provider_id;
  SELECT * INTO v_service FROM public.services
   WHERE id = p_service_id AND provider_id = w.provider_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That service is no longer available';
  END IF;
  v_end := COALESCE(p_end_time, p_booking_time + make_interval(mins => v_service.duration_minutes));

  -- Placeholder money: prepare_checkout() prices the row from the database
  -- when the client pays, and nothing is final until finalize_checkout().
  INSERT INTO public.bookings (
    user_id, provider_id, service_id, status,
    booking_date, booking_time, end_time,
    payment_type, base_price, add_ons_total, service_charge,
    deposit_amount, amount_paid, remaining_balance, payment_status,
    is_group_booking, group_booking_count,
    provider_name_snapshot, service_name_snapshot, service_category_snapshot,
    provider_logo_snapshot, customer_name, waitlist_entry_id, hold_expires_at
  ) VALUES (
    w.user_id, w.provider_id, v_service.id, 'on_hold',
    p_booking_date, p_booking_time, v_end,
    'full', v_service.price, 0, 0,
    0, 0, v_service.price, 'pending',
    FALSE, 1,
    COALESCE(v_provider.display_name, w.provider_name_snapshot), v_service.name, v_provider.service_category,
    v_provider.logo_url, w.user_name_snapshot, w.id, now() + v_hold
  )
  RETURNING id INTO v_booking_id;

  UPDATE public.provider_waitlist
     SET status = 'notified',
         notified_at = now(),
         offered_booking_id = v_booking_id,
         offered_date = p_booking_date,
         offered_time = p_booking_time,
         offer_expires_at = now() + v_hold,
         offer_ended_at = NULL
   WHERE id = w.id;

  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, provider_id, recipient_role, booking_id)
  VALUES (
    w.user_id, 'waitlist_slot_available',
    -- Leads with the time that's theirs: "Fri 20 Nov, 2:00pm is yours for 10 min".
    TO_CHAR(p_booking_date, 'Dy FMDD Mon') || ', ' || public.format_notification_time(p_booking_time) ||
      ' is yours for ' || (EXTRACT(EPOCH FROM v_hold) / 60)::int || ' min',
    v_service.name || ' with ' || COALESCE(v_provider.display_name, w.provider_name_snapshot) ||
      '. Tap to confirm and pay.',
    'high', TRUE, w.provider_id, 'client', v_booking_id
  );

  RETURN v_booking_id;
END;
$function$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261124140000', 'waitlist_slot_push_wording');

COMMIT;
