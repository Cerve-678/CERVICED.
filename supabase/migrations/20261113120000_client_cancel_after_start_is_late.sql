-- A client cancelling after the start time is a late cancel, not a free one.
--
-- cancel_own_booking() counted a cancel as late only while
-- 0 <= hours until the start < the notice window, and apply-cancellation-refund
-- used the same rule for the money. A client who cancelled a confirmed booking
-- after it had started (it stays 'confirmed' until auto-complete) was refunded
-- as though they'd cancelled days ahead, and the provider kept nothing.
--
-- Here: the late-cancel reliability count drops the ">= 0". The money rule is
-- isLateClientCancel() in supabase/functions/_shared/cancellationSettlement.ts,
-- used by apply-cancellation-refund. Deploy apply-cancellation-refund with this.
--
-- Not changed here (a decision for the owner): a request the provider hadn't
-- accepted, withdrawn inside the window, is still settled as late by the
-- refund function, although the app's cancel sheet warns of no penalty for one.
--
-- The UTC reading of booking_date + booking_time here is left for
-- 20261113140000 (UK time), which redefines this function again.
--
-- Redefined from live with an md5 guard.

BEGIN;

DO $$
BEGIN
  IF md5(pg_get_functiondef('public.cancel_own_booking(uuid)'::regprocedure)) <> '1dbe7f0e4d1ee1021298d970443e4883' THEN
    RAISE EXCEPTION 'cancel_own_booking changed live since this migration was written; redo it from live';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_own_booking(p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking        RECORD;
  v_notice_hrs     INT;
  v_policies       JSONB;
  v_hours_until    NUMERIC;
  v_late_threshold INT;
BEGIN
  SELECT b.status, b.booking_date, b.booking_time, b.provider_id, b.user_id,
         b.late_reschedule_from, b.cancel_notice_hours
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

  -- The window this booking was made under; rows from before it was stored
  -- fall back to the provider's current one.
  v_notice_hrs := COALESCE(v_booking.cancel_notice_hours, public.cancel_notice_hours(v_notice_hrs, v_policies));

  v_hours_until := EXTRACT(EPOCH FROM (
    (v_booking.booking_date + v_booking.booking_time)::timestamp - NOW()
  )) / 3600;

  v_late_threshold := CASE WHEN COALESCE(v_notice_hrs, 0) > 0 THEN v_notice_hrs ELSE 24 END;

  -- A booking the client moved while already inside the window counts as a
  -- late cancel whenever it's cancelled, as if cancelled on the original date.
  -- Cancelling after the start is late too (it used to count as on time);
  -- same rule as isLateClientCancel in apply-cancellation-refund (20261113120000).
  IF v_booking.status = 'confirmed'
     AND (v_hours_until < v_late_threshold
          OR (v_booking.late_reschedule_from IS NOT NULL AND COALESCE(v_notice_hrs, 0) > 0)) THEN
    INSERT INTO public.client_provider_reliability (provider_id, client_user_id, late_cancel_count, updated_at)
    VALUES (v_booking.provider_id, v_booking.user_id, 1, NOW())
    ON CONFLICT (provider_id, client_user_id)
    DO UPDATE SET late_cancel_count = client_provider_reliability.late_cancel_count + 1,
                  updated_at = NOW();
  END IF;

  UPDATE public.bookings SET status = 'cancelled' WHERE id = p_booking_id;
END;
$function$
;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261113120000', 'client_cancel_after_start_is_late')
ON CONFLICT (version) DO NOTHING;

COMMIT;
