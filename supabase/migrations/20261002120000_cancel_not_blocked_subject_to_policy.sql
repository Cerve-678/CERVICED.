-- cancel_own_booking(): the provider's notice window no longer BLOCKS a
-- cancellation. A client can always cancel their own (pending/confirmed)
-- booking; the notice window instead only records a late cancel against the
-- client's reliability with that provider, so they remain subject to the
-- provider's policy without being prevented from cancelling.
--
-- Reproduced verbatim from the verified-live pg_get_functiondef with exactly
-- two deltas, SECURITY DEFINER and `SET search_path TO 'public'` preserved:
--   1. Removed the `IF ... RAISE EXCEPTION 'This provider requires % hours
--      notice to cancel'` block entirely.
--   2. The reliability late-cancel counter now fires when the cancellation
--      falls inside the provider's own notice window (so a 48h/72h policy is
--      honoured), falling back to the previous fixed 24h when the provider has
--      set no notice window.
--
-- The guards that genuinely stop a cancel ("Booking not found",
-- "This booking can no longer be cancelled") are unchanged.

CREATE OR REPLACE FUNCTION public.cancel_own_booking(p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking     RECORD;
  v_notice_hrs  INT;
  v_policies    JSONB;
  v_hours_until NUMERIC;
BEGIN
  SELECT b.status, b.booking_date, b.booking_time, b.provider_id, b.user_id
    INTO v_booking
    FROM public.bookings b
   WHERE b.id = p_booking_id
     AND b.user_id = auth.uid()
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_booking.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'This booking can no longer be cancelled';
  END IF;

  SELECT cancellation_notice_hours, booking_policies
    INTO v_notice_hrs, v_policies
    FROM public.providers WHERE id = v_booking.provider_id;

  v_notice_hrs := public.cancel_notice_hours(v_notice_hrs, v_policies);

  v_hours_until := EXTRACT(EPOCH FROM (
    (v_booking.booking_date + v_booking.booking_time)::timestamp - NOW()
  )) / 3600;

  -- The notice window no longer blocks the cancellation. Instead, a cancel made
  -- inside the provider's notice window (or inside 24h when they've set none)
  -- is recorded against the client's reliability with that provider.
  IF v_booking.status = 'confirmed'
     AND v_hours_until >= 0
     AND v_hours_until < CASE WHEN COALESCE(v_notice_hrs, 0) > 0 THEN v_notice_hrs ELSE 24 END THEN
    INSERT INTO public.client_provider_reliability (provider_id, client_user_id, late_cancel_count, updated_at)
    VALUES (v_booking.provider_id, v_booking.user_id, 1, NOW())
    ON CONFLICT (provider_id, client_user_id)
    DO UPDATE SET late_cancel_count = client_provider_reliability.late_cancel_count + 1,
                  updated_at = NOW();
  END IF;

  UPDATE public.bookings SET status = 'cancelled' WHERE id = p_booking_id;
END;
$function$;
