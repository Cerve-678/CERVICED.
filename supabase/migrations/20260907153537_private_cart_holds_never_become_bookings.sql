-- Cart checkout holds are private infrastructure, not appointments.
--
-- expire_waitlist_holds() previously swept every expired on_hold booking.
-- That included cart holds (identified by hold_batch_id), so the waitlist
-- sweep promoted "Reserving…" to cancelled and sent both client and provider
-- waitlist notifications. Keep that worker strictly on waitlist rows. Cart
-- holds are removed by expire_cart_holds() instead.

CREATE OR REPLACE FUNCTION public.expire_waitlist_holds()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  h RECORD;
  v_provider_user_id UUID;
  v_offered_someone BOOLEAN;
BEGIN
  FOR h IN
    SELECT id, user_id, provider_id, service_id, booking_date, booking_time, end_time,
           base_price, add_ons_total, service_charge, service_category_snapshot,
           provider_name_snapshot, service_name_snapshot, waitlist_entry_id
      FROM public.bookings
     WHERE status = 'on_hold'
       AND hold_expires_at < NOW()
       AND waitlist_entry_id IS NOT NULL
       AND hold_batch_id IS NULL
  LOOP
    UPDATE public.bookings
       SET status = 'cancelled', hold_expires_at = NULL
     WHERE id = h.id;

    UPDATE public.provider_waitlist
       SET status = 'expired'
     WHERE id = h.waitlist_entry_id;

    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      h.user_id, 'waitlist_slot_available', 'Your held slot expired',
      'Your held slot for ' || h.service_name_snapshot || ' with ' || h.provider_name_snapshot ||
        ' on ' || TO_CHAR(h.booking_date, 'DD Mon YYYY') || ' at ' || TO_CHAR(h.booking_time, 'HH12:MI AM') ||
        ' has expired.',
      'medium', FALSE, h.id, h.provider_id, 'client'
    );

    v_offered_someone := public.invite_next_waitlist_entry(
      h.provider_id, h.service_id, h.booking_date, h.booking_time, h.end_time,
      h.base_price, h.add_ons_total, h.service_charge, h.service_category_snapshot
    );

    IF NOT v_offered_someone THEN
      SELECT p.user_id INTO v_provider_user_id
        FROM public.providers p
       WHERE p.id = h.provider_id;

      IF v_provider_user_id IS NOT NULL THEN
        INSERT INTO public.notifications
          (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
        VALUES (
          v_provider_user_id, 'waitlist_slot_available', 'Waitlist exhausted',
          'Nobody on the waitlist claimed ' || h.service_name_snapshot ||
            ' on ' || TO_CHAR(h.booking_date, 'DD Mon YYYY') || ' at ' || TO_CHAR(h.booking_time, 'HH12:MI AM') ||
            ' — the slot is open to the public again.',
          'medium', FALSE, h.id, h.provider_id, 'provider'
        );
      END IF;
    END IF;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.expire_waitlist_holds() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_waitlist_holds() TO service_role;

-- A user backing out of a prepared checkout must delete their temporary rows,
-- never convert them to a normal cancelled booking. The money/review guards
-- deliberately preserve anything anomalous for investigation.
CREATE OR REPLACE FUNCTION public.cancel_checkout(p_checkout_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in is required';
  END IF;

  UPDATE public.checkout_batches
     SET status = 'cancelled'
   WHERE id = p_checkout_batch_id
     AND user_id = auth.uid()
     AND status = 'prepared';

  IF NOT FOUND THEN
    RETURN;
  END IF;

  DELETE FROM public.notifications n
   USING public.bookings b
   WHERE n.booking_id = b.id
     AND b.hold_batch_id = p_checkout_batch_id
     AND b.user_id = auth.uid()
     AND b.status = 'on_hold'
     AND NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.booking_id = b.id)
     AND NOT EXISTS (SELECT 1 FROM public.reviews r WHERE r.booking_id = b.id);

  DELETE FROM public.bookings b
   WHERE b.hold_batch_id = p_checkout_batch_id
     AND b.user_id = auth.uid()
     AND b.status = 'on_hold'
     AND NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.booking_id = b.id)
     AND NOT EXISTS (SELECT 1 FROM public.reviews r WHERE r.booking_id = b.id);
END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_checkout(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_checkout(uuid) TO authenticated;

-- Repair rows created after the earlier abandoned-hold cleanup. These are
-- identifiable only by both placeholder snapshots because the oldest buggy
-- release path cleared their hold metadata. Never delete one with money or a
-- review attached.
DELETE FROM public.notifications n
 USING public.bookings b
 WHERE n.booking_id = b.id
   AND b.status = 'cancelled'
   AND b.service_name_snapshot = 'Reserving' || chr(8230)
   AND b.provider_name_snapshot = 'Reserving' || chr(8230)
   AND NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.booking_id = b.id)
   AND NOT EXISTS (SELECT 1 FROM public.reviews r WHERE r.booking_id = b.id);

DELETE FROM public.bookings b
 WHERE b.status = 'cancelled'
   AND b.service_name_snapshot = 'Reserving' || chr(8230)
   AND b.provider_name_snapshot = 'Reserving' || chr(8230)
   AND NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.booking_id = b.id)
   AND NOT EXISTS (SELECT 1 FROM public.reviews r WHERE r.booking_id = b.id);
