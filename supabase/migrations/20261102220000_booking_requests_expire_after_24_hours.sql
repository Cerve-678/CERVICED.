-- A provider now has 24 hours, not 48, to answer a booking request. Nothing
-- else changes: it still also expires at the appointment time, and a paid
-- request is still refunded in full.
BEGIN;

DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.process_expire_stale_pending_bookings'::regproc))
     <> 'ecb4cd978db3d01f27cb70e7257c88e4' THEN
    RAISE EXCEPTION 'process_expire_stale_pending_bookings changed live; rebase this migration on it';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.process_expire_stale_pending_bookings()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rec RECORD;
BEGIN
  FOR v_rec IN
    WITH expired AS (
      UPDATE public.bookings
         SET status = 'cancelled'
       WHERE status = 'pending'
         AND (
           created_at < NOW() - INTERVAL '24 hours'
           OR (booking_date::TIMESTAMP + booking_time) < NOW()
         )
      RETURNING id, payment_intent_id, payment_status, stripe_refund_id
    )
    SELECT id
      FROM expired
     WHERE payment_intent_id IS NOT NULL
       AND payment_status IN ('fully_paid', 'deposit_paid')
       AND stripe_refund_id IS NULL
  LOOP
    PERFORM public.refund_booking_async(v_rec.id, 'provider_no_response');
  END LOOP;
END;
$function$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261102220000', 'booking_requests_expire_after_24_hours')
ON CONFLICT DO NOTHING;

COMMIT;
