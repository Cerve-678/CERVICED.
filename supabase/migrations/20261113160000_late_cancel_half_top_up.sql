-- Late cancellation: "Half the price" replaces the Custom £ amount, and a
-- deposit-only booking can be topped up to half (user decisions 2026-11-12/13,
-- auto-memory late-cancel-half-top-up).
--
-- Until now a late cancel only ever kept part of what the client had already
-- paid. A provider whose policy is half the price got just the deposit when the
-- client paid only a deposit. Now, on such a booking, the provider can charge
-- the client's saved card the difference, from the booking's own page, within
-- 24 hours of the appointment's end, the same way late and no-show fees work
-- (booking-fee edge function, kind 'late_cancel'). The client agrees to it at
-- checkout in its own tick box.
--
-- 1. bookings.late_cancel_fee_pence: frozen when the booking is made, like
--    late_fee_pence. Set only for a deposit-only booking under a half-price
--    policy with a notice period: half of (service price + add-ons) minus the
--    deposit, rounded down to the penny. NULL when the deposit already covers
--    half, so nothing more could ever be charged.
-- 2. booking_fee_charges.kind accepts 'late_cancel'.
-- 3. fee_terms_versions.late_cancel_line, folded into the hash when present,
--    and the '2026-11-13-late-cancel' wording (src/constants/feeTerms.ts).
-- 4. get_checkout_fees also returns the late cancellation amount, the deposit
--    it sits on top of and the notice period, so the cart can show them.
--    (Return type changes, so it is dropped and recreated with its grants.)
-- 5. accept_checkout_fees records the late cancellation amount per provider
--    and refuses wording without the late cancellation line when a checkout
--    carries one (older app builds never showed it).
-- 6. request_reschedule_own_booking refuses a new date outside the booking's
--    calendar month when the provider's policy says rescheduleWithin
--    'same_month' (new row on the Policies screen).
-- 7. Saved 'custom' late-cancel policies become 'half' (0 live at authoring).
--
-- Redefined from live with md5 guards, per supabase/MIGRATION_OWNER.md.
-- Frontier at authoring: live max 20261113150000; nothing unapplied above it on
-- an open PR; no open PR touches these objects. Written on
-- feat/late-cancel-half-top-up.

BEGIN;

DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.snapshot_booking_fees()'::regprocedure)) <> '7e5715c259b6897a0fa4fb0b080959eb' THEN
    RAISE EXCEPTION 'snapshot_booking_fees changed live since this migration was written';
  END IF;
  IF md5(pg_get_functiondef('public.get_checkout_fees(uuid)'::regprocedure)) <> '9c633ed3d76fd6a4b72ad75fd99fde00' THEN
    RAISE EXCEPTION 'get_checkout_fees changed live since this migration was written';
  END IF;
  IF md5(pg_get_functiondef('public.accept_checkout_fees(uuid, text, text, text, text)'::regprocedure)) <> '7d2aa850bdc729ad3aa9ef97edbfb2db' THEN
    RAISE EXCEPTION 'accept_checkout_fees changed live since this migration was written';
  END IF;
  IF md5(pg_get_functiondef('public.request_reschedule_own_booking(uuid, text[])'::regprocedure)) <> '34a5f04dd7bd14cc13af27b5bbe39354' THEN
    RAISE EXCEPTION 'request_reschedule_own_booking changed live since this migration was written';
  END IF;
  IF md5(pg_get_functiondef('public.set_fee_terms_sha256()'::regprocedure)) <> '08e3cd5dfe43c0a5f30cf45bc44aed89' THEN
    RAISE EXCEPTION 'set_fee_terms_sha256 changed live since this migration was written';
  END IF;
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint
       WHERE conrelid = 'public.booking_fee_charges'::regclass AND conname = 'booking_fee_charges_kind_check')
     IS DISTINCT FROM 'CHECK ((kind = ANY (ARRAY[''late''::text, ''no_show''::text])))' THEN
    RAISE EXCEPTION 'booking_fee_charges_kind_check changed live since this migration was written';
  END IF;
END
$guard$;

-- 1. The frozen late cancellation amount ----------------------------------

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS late_cancel_fee_pence integer
    CHECK (late_cancel_fee_pence IS NULL OR late_cancel_fee_pence > 0);

COMMENT ON COLUMN public.bookings.late_cancel_fee_pence IS
  'Frozen at booking: what the provider may charge on top of a kept deposit after a late client cancel under a half-price policy. Half of (base_price + add_ons_total) minus deposit_amount, in pence. NULL when nothing extra could be charged.';

-- Pure, so the cart, the trigger and the tests share one formula.
CREATE OR REPLACE FUNCTION public.booking_late_cancel_fee_pence(
  p_cancel_penalty text,
  p_payment_type text,
  p_base_price numeric,
  p_add_ons_total numeric,
  p_deposit numeric,
  p_notice_hours integer
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  -- 'full' is how policies saved before 2026-11-01 say half (readCancelPenalty).
  SELECT CASE
    WHEN p_cancel_penalty IN ('half', 'full')
     AND p_payment_type = 'deposit'
     AND COALESCE(p_deposit, 0) > 0
     AND COALESCE(p_notice_hours, 0) > 0
    THEN NULLIF(GREATEST(
           floor((COALESCE(p_base_price, 0) + COALESCE(p_add_ons_total, 0)) * 100 / 2)::integer
           - round(p_deposit * 100)::integer,
           0), 0)
  END;
$function$;

REVOKE ALL ON FUNCTION public.booking_late_cancel_fee_pence(text, text, numeric, numeric, numeric, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.booking_late_cancel_fee_pence(text, text, numeric, numeric, numeric, integer) TO authenticated, service_role;

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
  NEW.no_show_fee_pence := public.booking_fee_pence(v_policies->>'noShowFee', NEW.base_price);
  -- Always computed here, never taken from the inserted row. Runs before
  -- freeze_cancel_notice_hours_on_insert (trigger order is by name), so the
  -- notice period is read the same way that trigger reads it.
  NEW.late_cancel_fee_pence := public.booking_late_cancel_fee_pence(
    v_policies->>'cancelPenalty', NEW.payment_type, NEW.base_price, NEW.add_ons_total,
    NEW.deposit_amount, public.cancel_notice_hours(v_notice_column, v_policies));
  RETURN NEW;
END;
$function$;

-- 2. The new fee kind -----------------------------------------------------

ALTER TABLE public.booking_fee_charges DROP CONSTRAINT booking_fee_charges_kind_check;
ALTER TABLE public.booking_fee_charges ADD CONSTRAINT booking_fee_charges_kind_check
  CHECK (kind = ANY (ARRAY['late'::text, 'no_show'::text, 'late_cancel'::text]));

-- 3. The wording -----------------------------------------------------------

ALTER TABLE public.fee_terms_versions ADD COLUMN IF NOT EXISTS late_cancel_line text;

CREATE OR REPLACE FUNCTION public.set_fee_terms_sha256()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Versions without a late cancellation line hash exactly as before.
  NEW.sha256 := encode(sha256(convert_to(
    NEW.heading || E'\n\n' || NEW.body || E'\n\n' || NEW.consent_line
      || COALESCE(E'\n\n' || NEW.late_cancel_line, ''), 'UTF8')), 'hex');
  RETURN NEW;
END;
$function$;

INSERT INTO public.fee_terms_versions (version, heading, body, consent_line, late_cancel_line, sha256)
VALUES (
  '2026-11-13-late-cancel',
  'Late Arrival, No-Show & Late Cancellation Fees',
  'Some providers set a late arrival fee, a no-show fee, or both. Any fee is shown to you before you pay, and you must agree to it at checkout to book. If you agree, your card is saved securely by Stripe, and the provider may charge the agreed fee to it within 24 hours of your appointment: the late arrival fee if you arrive after the provider''s stated grace period, or the no-show fee if you do not attend. If a provider''s cancellation policy is half the price and you pay only a deposit, you must also agree at checkout to their late cancellation charge. If you then cancel within their notice period, the provider keeps your deposit and may charge your saved card the difference between that deposit and half the price of the booking, no later than 24 hours after the appointment ends. The amount is shown before you book and again before you cancel. If the charge is declined, we will ask you to pay the fee in the app or by email within 7 days, and we may try your saved card again up to three more times in those 7 days. If your bank asks you to approve the charge, we won''t try the card again; you can pay it yourself within the 7 days. Each fee is fixed at the amount shown when you book, can be collected only once per booking, and can never be more than half the price of the booking. You will be notified whenever a fee is charged or retried. If you believe a fee is wrong, you can dispute it with the provider in the app within 7 days of the charge, and the provider decides whether to refund it. Fees are paid to the provider, not to Cerviced, and Cerviced does not decide fee disputes. This does not affect your statutory rights, including your right to contact your bank.',
  'I agree that CERVICED may save this card with Stripe and, if the provider records that I arrived more than the stated grace period late or did not attend, may charge this card the applicable fee shown above. Each fee is for this booking only, is first charged no later than 24 hours after the appointment ends, and will not exceed the amount shown. If that charge is declined, it may be tried again up to three times within the following 7 days, and I may pay it myself in that time. I can dispute a charged fee in the app within 7 days; the provider will review the dispute and may refund or keep the fee. This does not affect my statutory rights.',
  'I understand that if I cancel within the provider''s notice period, I lose my deposit, and CERVICED may save this card with Stripe so the provider can charge it up to the amount shown above, no later than 24 hours after the appointment ends.',
  ''  -- replaced by before_fee_terms_sha256
)
ON CONFLICT (version) DO NOTHING;

DO $sha$
BEGIN
  IF (SELECT sha256 FROM public.fee_terms_versions WHERE version = '2026-11-13-late-cancel')
     IS DISTINCT FROM 'dd2e86b1049823962da974d8c8c2b27203f998be3b14e3874ced6917121765cd' THEN
    RAISE EXCEPTION 'The 2026-11-13-late-cancel wording does not hash to what the app sends';
  END IF;
END
$sha$;

-- 4. What the cart shows ---------------------------------------------------

DROP FUNCTION public.get_checkout_fees(uuid);
CREATE FUNCTION public.get_checkout_fees(p_checkout_batch_id uuid)
 RETURNS TABLE(provider_id uuid, provider_name text, late_fee_pence integer, no_show_fee_pence integer, grace_minutes integer,
               late_cancel_fee_pence integer, late_cancel_deposit_pence integer, cancel_notice_hours integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT b.provider_id,
         MAX(COALESCE(NULLIF(BTRIM(b.provider_name_snapshot), ''), p.display_name)) AS provider_name,
         MAX(b.late_fee_pence) AS late_fee_pence,
         MAX(b.no_show_fee_pence) AS no_show_fee_pence,
         MAX(CASE WHEN p.booking_policies->>'noShowGraceMinutes' ~ '^\d{1,3}$'
                  THEN (p.booking_policies->>'noShowGraceMinutes')::integer ELSE 0 END) AS grace_minutes,
         MAX(b.late_cancel_fee_pence) AS late_cancel_fee_pence,
         -- The deposit on the booking with the largest late cancellation amount.
         (ARRAY_AGG(round(COALESCE(b.deposit_amount, 0) * 100)::integer
                    ORDER BY b.late_cancel_fee_pence DESC NULLS LAST))[1] AS late_cancel_deposit_pence,
         MAX(b.cancel_notice_hours) AS cancel_notice_hours
    FROM public.bookings b
    JOIN public.checkout_batches c ON c.id = b.hold_batch_id
    JOIN public.providers p ON p.id = b.provider_id
   WHERE c.id = p_checkout_batch_id
     AND c.user_id = auth.uid()
     AND b.status = 'on_hold'
     AND (b.late_fee_pence IS NOT NULL OR b.no_show_fee_pence IS NOT NULL OR b.late_cancel_fee_pence IS NOT NULL)
   GROUP BY b.provider_id;
$function$;

REVOKE ALL ON FUNCTION public.get_checkout_fees(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_checkout_fees(uuid) TO authenticated, service_role;

-- 5. The agreement ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.accept_checkout_fees(p_checkout_batch_id uuid, p_terms_version text, p_terms_sha256 text, p_app_platform text DEFAULT NULL::text, p_app_version text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_sha text;
  v_covers_late_cancel boolean;
  v_fees jsonb;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in is required'; END IF;

  SELECT t.sha256, t.late_cancel_line IS NOT NULL
    INTO v_sha, v_covers_late_cancel
    FROM public.fee_terms_versions t WHERE t.version = p_terms_version;
  IF v_sha IS NULL OR v_sha IS DISTINCT FROM p_terms_sha256 THEN
    RAISE EXCEPTION 'These fee terms have been updated. Please update the app and try again.';
  END IF;

  PERFORM 1 FROM public.checkout_batches c
   WHERE c.id = p_checkout_batch_id AND c.user_id = v_uid AND c.status = 'prepared'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checkout has expired. Please review your booking and try again.';
  END IF;

  -- Same amounts get_checkout_fees shows, read from the held rows themselves.
  SELECT jsonb_agg(jsonb_build_object(
           'provider_id', f.provider_id,
           'provider_name', f.provider_name,
           'late_fee_pence', f.late_fee_pence,
           'no_show_fee_pence', f.no_show_fee_pence,
           'grace_minutes', f.grace_minutes,
           'late_cancel_fee_pence', f.late_cancel_fee_pence) ORDER BY f.provider_id)
    INTO v_fees
    FROM (
      SELECT b.provider_id,
             MAX(COALESCE(NULLIF(BTRIM(b.provider_name_snapshot), ''), p.display_name)) AS provider_name,
             MAX(b.late_fee_pence) AS late_fee_pence,
             MAX(b.no_show_fee_pence) AS no_show_fee_pence,
             MAX(CASE WHEN p.booking_policies->>'noShowGraceMinutes' ~ '^\d{1,3}$'
                      THEN (p.booking_policies->>'noShowGraceMinutes')::integer ELSE 0 END) AS grace_minutes,
             MAX(b.late_cancel_fee_pence) AS late_cancel_fee_pence
        FROM public.bookings b
        JOIN public.providers p ON p.id = b.provider_id
       WHERE b.hold_batch_id = p_checkout_batch_id
         AND b.status = 'on_hold'
         AND (b.late_fee_pence IS NOT NULL OR b.no_show_fee_pence IS NOT NULL OR b.late_cancel_fee_pence IS NOT NULL)
       GROUP BY b.provider_id
    ) f;
  IF v_fees IS NULL THEN
    RAISE EXCEPTION 'There are no fees to agree to on this checkout.';
  END IF;

  -- Older wording never showed the late cancellation box, so it can't stand
  -- for agreeing to one.
  IF NOT v_covers_late_cancel AND EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_fees) e
        WHERE (e->>'late_cancel_fee_pence') IS NOT NULL) THEN
    RAISE EXCEPTION 'These fee terms have been updated. Please update the app and try again.';
  END IF;

  INSERT INTO public.fee_consent_records
    (user_id, checkout_batch_id, terms_version, terms_sha256, fees, app_platform, app_version)
  VALUES
    (v_uid, p_checkout_batch_id, p_terms_version, v_sha, v_fees,
     left(p_app_platform, 20), left(p_app_version, 40))
  ON CONFLICT (checkout_batch_id) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    -- Already agreed for this checkout: only reuse it if the fees are the same.
    SELECT r.id INTO v_id FROM public.fee_consent_records r
     WHERE r.checkout_batch_id = p_checkout_batch_id
       AND r.user_id = v_uid
       AND r.fees = v_fees;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'The fees on this checkout have changed. Please review your booking and try again.';
    END IF;
  END IF;

  UPDATE public.checkout_batches
     SET fee_consent_at = COALESCE(fee_consent_at, now())
   WHERE id = p_checkout_batch_id;

  RETURN v_id;
END;
$function$;

-- 6. Reschedule within the same month ---------------------------------------

CREATE OR REPLACE FUNCTION public.request_reschedule_own_booking(p_booking_id uuid, p_preferred_dates text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking RECORD;
  v_policies JSONB;
  v_max_raw TEXT;
  v_max INT;
  v_notice_raw TEXT;
  v_notice_hrs INT;
  v_hours_until NUMERIC;
  v_hours_since_last NUMERIC;
  v_active_request BOOLEAN;
  v_dates DATE[] := ARRAY[]::DATE[];
  v_times TEXT[] := ARRAY[]::TEXT[];
  v_raw TEXT;
  v_duration INTERVAL;
  v_i INT;
  v_cancel_hrs INT;
  v_cancel_hours_until NUMERIC;
  v_inside_cancel_window BOOLEAN := false;
  v_date DATE;
BEGIN
  SELECT b.status, b.booking_date, b.booking_time, b.end_time, b.provider_id,
         b.reschedule_count, b.last_rescheduled_at, b.created_at, b.cancel_notice_hours
    INTO v_booking
    FROM public.bookings b
   WHERE b.id = p_booking_id
     AND b.user_id = auth.uid()
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_booking.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Only confirmed bookings can be rescheduled';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.booking_reschedule_requests
     WHERE booking_id = p_booking_id AND status IN ('pending', 'provider_responded')
  ) INTO v_active_request;

  IF v_active_request THEN
    RAISE EXCEPTION 'A reschedule request is already in progress for this booking';
  END IF;

  IF v_booking.last_rescheduled_at IS NOT NULL THEN
    v_hours_since_last := EXTRACT(EPOCH FROM (NOW() - v_booking.last_rescheduled_at)) / 3600;
    IF v_hours_since_last < 24 THEN
      RAISE EXCEPTION 'You can reschedule again in % hours', CEIL(24 - v_hours_since_last);
    END IF;
  END IF;

  SELECT booking_policies INTO v_policies
    FROM public.providers WHERE id = v_booking.provider_id;

  -- CHANGED: unset (NULL or '') now means unrestricted, same as an explicit
  -- 'unlimited' -- previously COALESCE(..., 1) silently capped a provider
  -- who had never opened Policies at exactly one reschedule.
  v_max_raw := v_policies->>'maxReschedules';
  IF v_max_raw IS NOT NULL AND v_max_raw <> '' AND v_max_raw IS DISTINCT FROM 'unlimited' THEN
    v_max := v_max_raw::INT;
    IF v_booking.reschedule_count >= v_max THEN
      RAISE EXCEPTION 'This provider allows a maximum of % reschedule(s) per booking', v_max;
    END IF;
  END IF;

  -- CHANGED: unset now falls to 0 (no notice required) instead of silently
  -- imposing 24h -- matches cancel_notice_hours()'s existing unset -> 0
  -- behavior. An explicit '24h' choice keeps its own WHEN branch.
  v_notice_raw := v_policies->>'rescheduleNotice';
  v_notice_hrs := CASE v_notice_raw
    WHEN 'same_day' THEN 0
    WHEN '24h' THEN 24
    WHEN '48h' THEN 48
    WHEN '72h' THEN 72
    ELSE 0
  END;

  IF v_notice_hrs > 0 THEN
    v_hours_until := EXTRACT(EPOCH FROM (
      (v_booking.booking_date + v_booking.booking_time)::timestamp - NOW()
    )) / 3600;
    IF v_hours_until < v_notice_hrs THEN
      RAISE EXCEPTION 'This provider requires % hours notice to reschedule', v_notice_hrs;
    END IF;
  END IF;

  -- Asking while already too late to cancel for free keeps the late-cancel
  -- rule on this booking once the move is confirmed (decided 2026-10-25).
  -- Only bookings made since the rule started (decided 2026-10-31).
  -- Booking dates/times are UK wall-clock.
  SELECT COALESCE(v_booking.cancel_notice_hours, public.cancel_notice_hours(p.cancellation_notice_hours, p.booking_policies))
    INTO v_cancel_hrs
    FROM public.providers p WHERE p.id = v_booking.provider_id;
  IF COALESCE(v_cancel_hrs, 0) > 0
     AND v_booking.created_at >= public.late_reschedule_rule_starts_at() THEN
    v_cancel_hours_until := EXTRACT(EPOCH FROM (
      ((v_booking.booking_date + v_booking.booking_time)::timestamp AT TIME ZONE 'Europe/London') - NOW()
    )) / 3600;
    v_inside_cancel_window := v_cancel_hours_until < v_cancel_hrs;
  END IF;

  FOREACH v_raw IN ARRAY p_preferred_dates LOOP
    v_dates := v_dates || (split_part(v_raw, ' ', 1))::DATE;
    v_times := v_times || NULLIF(split_part(v_raw, ' ', 2), '');
  END LOOP;

  -- The provider's "New date must be: Same month" (user decision 2026-11-13):
  -- every date the client asks for stays in the booking's calendar month.
  -- Times the provider offers back are theirs to choose, so only the client's
  -- own request is checked.
  IF v_policies->>'rescheduleWithin' = 'same_month' THEN
    FOREACH v_date IN ARRAY v_dates LOOP
      IF date_trunc('month', v_date) <> date_trunc('month', v_booking.booking_date) THEN
        RAISE EXCEPTION 'This provider only lets you move a booking to another day in %',
          to_char(v_booking.booking_date, 'FMMonth YYYY')
          USING ERRCODE = 'P0001';
      END IF;
    END LOOP;
  END IF;

  INSERT INTO public.booking_reschedule_requests
    (booking_id, requested_by, original_date, original_time, requested_dates,
     requested_times, provider_available_slots, status, reschedule_count, updated_at,
     requested_inside_cancel_window)
  VALUES
    (p_booking_id, 'user', v_booking.booking_date, v_booking.booking_time,
     v_dates, v_times, NULL, 'pending', 0, NOW(),
     v_inside_cancel_window)
  ON CONFLICT (booking_id) DO UPDATE
    SET requested_by = 'user',
        requested_dates = v_dates,
        requested_times = v_times,
        provider_available_slots = NULL,
        status = 'pending',
        updated_at = NOW(),
        requested_inside_cancel_window = v_inside_cancel_window;

  -- Any hold left by a previous, already-closed request on this booking.
  PERFORM public.release_reschedule_holds(p_booking_id);

  v_duration := COALESCE(v_booking.end_time, v_booking.booking_time + INTERVAL '1 hour')
                - v_booking.booking_time;

  FOR v_i IN 1 .. COALESCE(array_length(v_dates, 1), 0) LOOP
    IF v_times[v_i] IS NOT NULL THEN
      BEGIN
        PERFORM public.place_reschedule_hold(
          p_booking_id,
          v_dates[v_i],
          v_times[v_i]::TIME,
          (v_times[v_i]::TIME + v_duration)::TIME
        );
      EXCEPTION WHEN exclusion_violation OR check_violation THEN
        RAISE EXCEPTION 'That time has just been taken. Please pick another slot.'
          USING ERRCODE = 'P0001';
      END;
    END IF;
  END LOOP;
END;
$function$;

-- 7. Custom becomes Half -----------------------------------------------------

UPDATE public.providers
   SET booking_policies = (booking_policies - 'cancelCustomFee') || '{"cancelPenalty": "half"}'::jsonb
 WHERE booking_policies->>'cancelPenalty' = 'custom';

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261113160000', 'late_cancel_half_top_up')
ON CONFLICT DO NOTHING;

COMMIT;
