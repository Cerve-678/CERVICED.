-- No-show: "Half the price" replaces the Custom £ no-show fee (user decision
-- 2026-11-13, auto-memory late-cancel-half-top-up). Same idea as the late
-- cancellation charge from 20261113160000: on a no-show the client gets
-- nothing back, so the provider keeps the deposit, and under Half they may
-- also charge the client's saved card the rest up to half the price. A client
-- who paid in full has already paid more than half, so nothing more.
--
-- 1. booking_half_price_balance_pence(): half of (service price + add-ons),
--    rounded down to the penny, minus the deposit, for a deposit-only booking.
--    NULL otherwise, or when the deposit already covers half.
-- 2. snapshot_booking_fees freezes no_show_fee_pence from it when the
--    provider's noShowAction is 'half'. A typed £ noShowFee (older app builds
--    can still save one) keeps working as before, capped at half the price.
-- 3. Saved Custom no-show fees become Half and the £ amount is dropped
--    (1 live provider at authoring: £25, deposit required). Bookings already
--    made keep the fee they were booked with.
--
-- The amount is charged exactly like the old £ no-show fee: booking-fee kind
-- 'no_show', after the provider marks the no-show, within 24 hours of the
-- appointment's end, against the client's checkout agreement. No edge
-- function changes.
--
-- Redefined from live with an md5 guard, per supabase/MIGRATION_OWNER.md.
-- Frontier at authoring: live max 20261113180000; unapplied above it on an
-- open PR: 20261113190000_refund_request_five_days (fix/cart-drops-offline-
-- providers), which doesn't touch these objects. Written on feat/no-show-half.

BEGIN;

DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.snapshot_booking_fees()'::regprocedure)) <> 'edf404245c2a8724cce57d2a8631be22' THEN
    RAISE EXCEPTION 'snapshot_booking_fees changed live since this migration was written';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.booking_half_price_balance_pence(
  p_payment_type text,
  p_base_price numeric,
  p_add_ons_total numeric,
  p_deposit numeric
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN p_payment_type = 'deposit' AND COALESCE(p_deposit, 0) > 0
    THEN NULLIF(GREATEST(
           floor((COALESCE(p_base_price, 0) + COALESCE(p_add_ons_total, 0)) * 100 / 2)::integer
           - round(p_deposit * 100)::integer,
           0), 0)
  END;
$function$;

REVOKE ALL ON FUNCTION public.booking_half_price_balance_pence(text, numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.booking_half_price_balance_pence(text, numeric, numeric, numeric) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.snapshot_booking_fees()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_policies jsonb;
  v_notice_column integer;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Frozen at booking time: nothing may change what the client agreed to.
    NEW.late_fee_pence := OLD.late_fee_pence;
    NEW.no_show_fee_pence := OLD.no_show_fee_pence;
    NEW.late_cancel_fee_pence := OLD.late_cancel_fee_pence;
    RETURN NEW;
  END IF;

  SELECT p.booking_policies, p.cancellation_notice_hours
    INTO v_policies, v_notice_column
    FROM public.providers p WHERE p.id = NEW.provider_id;
  NEW.late_fee_pence := public.booking_fee_pence(v_policies->>'lateFee', NEW.base_price);
  -- 'half': the rest up to half the price on a deposit-only booking
  -- (20261113200000). Otherwise a typed £ fee, from older app builds.
  NEW.no_show_fee_pence := CASE
    WHEN v_policies->>'noShowAction' = 'half'
    THEN public.booking_half_price_balance_pence(NEW.payment_type, NEW.base_price, NEW.add_ons_total, NEW.deposit_amount)
    ELSE public.booking_fee_pence(v_policies->>'noShowFee', NEW.base_price)
  END;
  -- Always computed here, never taken from the inserted row. Runs before
  -- freeze_cancel_notice_hours_on_insert (trigger order is by name), so the
  -- notice period is read the same way that trigger reads it.
  NEW.late_cancel_fee_pence := public.booking_late_cancel_fee_pence(
    v_policies->>'cancelPenalty', NEW.payment_type, NEW.base_price, NEW.add_ons_total,
    NEW.deposit_amount, public.cancel_notice_hours(v_notice_column, v_policies));
  RETURN NEW;
END;
$function$;

UPDATE public.providers
   SET booking_policies = (booking_policies - 'noShowFee') || '{"noShowAction": "half"}'::jsonb
 WHERE booking_policies->>'noShowAction' = 'custom'
    OR NULLIF(btrim(booking_policies->>'noShowFee'), '') IS NOT NULL;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261113200000', 'no_show_half')
ON CONFLICT DO NOTHING;

COMMIT;
