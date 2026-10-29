-- Tell providers when they owe money, and let late/no-show fee payouts pay
-- it off.
--
-- Frontier at authoring: 20261025140000 (verified live 2026-10-29). Check the
-- lock in MIGRATION_OWNER.md and re-check max(version) before applying.
--
-- Background (PAYMENTS_AND_LOGIC.md §5): when money has to come back from a
-- provider who was already paid and their Stripe balance can't cover it, the
-- rest is recorded in provider_shortfalls and taken out of their next booking
-- payout. Until now the provider was never told, and late/no-show fee payouts
-- were always sent in full.
--
-- Decided with the user 2026-10-29 ("Option A"): tell them, then take it
-- automatically. No pay-back button.
--   1. When a debt is recorded, the provider gets a notice saying how much
--      and that it will come out of their next payments.
--   2. Late/no-show fee payouts now pay it off too, exactly like booking
--      payouts: all of the payout if it's less than what's owed, only what's
--      owed if it's more.
--   3. Each time a payout that paid some of it off is sent, the provider gets
--      a notice saying how much went towards it and what's left.
-- Both notices always push: they're left out of send-push-notification's
-- provider switches on purpose, so muting "Payment Updates" can't hide money
-- being taken.
--
-- What this adds:
--   - booking_fee_charges.deducted_pence, mirroring provider_payouts.
--   - provider_shortfall_recoveries.fee_charge_id; payout_id becomes nullable
--     and exactly one of the two is set.
--   - take_provider_shortfalls(): the shared loop that pays off the oldest
--     debts first. apply_provider_shortfalls() is redefined from its live
--     body (read 2026-10-29) to call it, with no change in behaviour.
--   - apply_fee_payout_shortfalls() / release_fee_payout_shortfalls(): the
--     fee-payout twins of apply_/release_provider_shortfalls().
--   - Notification types payout_debt_recorded and payout_debt_recovered. The
--     CHECK is rebuilt from the live constraint (read 2026-10-29) plus these
--     two. Any later rebuild must keep them.
--   - Triggers that write the two notices. A failed notice is logged as a
--     WARNING and never rolls back the money record it describes.
--
-- No backfill: there were no provider_shortfalls rows and no
-- booking_fee_charges rows live at authoring.

BEGIN;

-- ── Fee payouts can carry deductions ────────────────────────────────────────
ALTER TABLE public.booking_fee_charges
  ADD COLUMN IF NOT EXISTS deducted_pence integer NOT NULL DEFAULT 0
  CONSTRAINT booking_fee_charges_deducted_pence_check CHECK (deducted_pence >= 0);

COMMENT ON COLUMN public.booking_fee_charges.deducted_pence IS
  'Pence of this fee payout used to pay off what the provider owed (provider_shortfalls) instead of being transferred. Set by apply_fee_payout_shortfalls().';

ALTER TABLE public.provider_shortfall_recoveries
  ALTER COLUMN payout_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS fee_charge_id uuid REFERENCES public.booking_fee_charges(id) ON DELETE CASCADE,
  ADD CONSTRAINT provider_shortfall_recoveries_one_target CHECK (num_nonnulls(payout_id, fee_charge_id) = 1),
  ADD CONSTRAINT provider_shortfall_recoveries_once_per_fee UNIQUE (shortfall_id, fee_charge_id);

CREATE INDEX IF NOT EXISTS provider_shortfall_recoveries_fee_idx
  ON public.provider_shortfall_recoveries (fee_charge_id) WHERE fee_charge_id IS NOT NULL;

-- ── One loop pays off debts, oldest first ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.take_provider_shortfalls(
  p_provider_id uuid, p_available integer, p_payout_id uuid, p_fee_charge_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_left integer := GREATEST(COALESCE(p_available, 0), 0);
  v_take integer;
  v_total integer := 0;
  v_shortfall record;
BEGIN
  FOR v_shortfall IN
    SELECT id, amount_pence - recovered_pence AS owed
      FROM public.provider_shortfalls
     WHERE provider_id = p_provider_id AND recovered_pence < amount_pence
     ORDER BY created_at
     FOR UPDATE
  LOOP
    EXIT WHEN v_left <= 0;
    v_take := LEAST(v_shortfall.owed, v_left);
    INSERT INTO public.provider_shortfall_recoveries (shortfall_id, payout_id, fee_charge_id, amount_pence)
      VALUES (v_shortfall.id, p_payout_id, p_fee_charge_id, v_take);
    UPDATE public.provider_shortfalls
       SET recovered_pence = recovered_pence + v_take,
           settled_at = CASE WHEN recovered_pence + v_take >= amount_pence THEN now() ELSE settled_at END
     WHERE id = v_shortfall.id;
    v_left := v_left - v_take;
    v_total := v_total + v_take;
  END LOOP;
  RETURN v_total;
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_provider_shortfalls(p_payout_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_payout record;
  v_total integer;
BEGIN
  SELECT id, provider_id, status, payout_amount, deducted_pence
    INTO v_payout
    FROM public.provider_payouts WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND OR v_payout.status <> 'held' THEN
    RAISE EXCEPTION 'payout % is not held', p_payout_id;
  END IF;
  UPDATE public.provider_payouts SET release_claimed_at = COALESCE(release_claimed_at, now()) WHERE id = p_payout_id;
  IF EXISTS (SELECT 1 FROM public.provider_shortfall_recoveries WHERE payout_id = p_payout_id) THEN
    RETURN GREATEST(v_payout.payout_amount - v_payout.deducted_pence, 0);
  END IF;

  v_total := public.take_provider_shortfalls(v_payout.provider_id, v_payout.payout_amount, p_payout_id, NULL);

  IF v_total > 0 THEN
    UPDATE public.provider_payouts SET deducted_pence = v_total WHERE id = p_payout_id;
  END IF;
  RETURN v_payout.payout_amount - v_total;
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_fee_payout_shortfalls(p_fee_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_fee record;
  v_total integer;
BEGIN
  SELECT id, provider_id, payout_status, COALESCE(payout_pence, 0) AS payout_pence, deducted_pence
    INTO v_fee
    FROM public.booking_fee_charges WHERE id = p_fee_id FOR UPDATE;
  IF NOT FOUND OR v_fee.payout_status <> 'held' THEN
    RAISE EXCEPTION 'fee payout % is not held', p_fee_id;
  END IF;
  -- A retry after a run that deducted but didn't transfer: same answer again.
  IF EXISTS (SELECT 1 FROM public.provider_shortfall_recoveries WHERE fee_charge_id = p_fee_id) THEN
    RETURN GREATEST(v_fee.payout_pence - v_fee.deducted_pence, 0);
  END IF;

  v_total := public.take_provider_shortfalls(v_fee.provider_id, v_fee.payout_pence, NULL, p_fee_id);

  IF v_total > 0 THEN
    UPDATE public.booking_fee_charges SET deducted_pence = v_total WHERE id = p_fee_id;
  END IF;
  RETURN v_fee.payout_pence - v_total;
END;
$function$;

-- A fee payout that never went out gives its deductions back, so the debt
-- isn't forgiven by money the provider never received.
CREATE OR REPLACE FUNCTION public.release_fee_payout_shortfalls(p_fee_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_recovery record;
BEGIN
  PERFORM 1 FROM public.booking_fee_charges WHERE id = p_fee_id FOR UPDATE;
  FOR v_recovery IN
    SELECT id, shortfall_id, amount_pence FROM public.provider_shortfall_recoveries
     WHERE fee_charge_id = p_fee_id FOR UPDATE
  LOOP
    UPDATE public.provider_shortfalls
       SET recovered_pence = recovered_pence - v_recovery.amount_pence, settled_at = NULL
     WHERE id = v_recovery.shortfall_id;
    DELETE FROM public.provider_shortfall_recoveries WHERE id = v_recovery.id;
  END LOOP;
  UPDATE public.booking_fee_charges SET deducted_pence = 0 WHERE id = p_fee_id;
END;
$function$;

-- ── Notification types ──────────────────────────────────────────────────────
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'cancel_window_closing', 'booking_pending', 'booking_confirmed', 'booking_declined', 'booking_cancelled',
  'booking_reminder', 'booking_in_progress', 'booking_not_started', 'no_show', 'payment_success',
  'new_provider', 'reschedule_request', 'reschedule_provider_response', 'reschedule_confirmed',
  'reschedule_declined', 'reschedule_expired', 'review_request', 'review_received', 'promotion',
  'intake_form_reminder', 'intake_form_received', 'intake_form_completed', 'info_pack_received',
  'provider_message', 'announcement', 'balance_reminder', 'waitlist_slot_available', 'new_message',
  'address_released', 'birthday_greeting', 'post_appt_check_in', 'rebooking_nudge', 'daily_recap',
  'schedule_fully_booked', 'pending_booking_reminder', 'provider_no_show', 'no_show_disputed',
  'points_earned', 'cancellation_settled', 'fee_charged', 'fee_disputed', 'fee_dispute_resolved',
  'refund_requested', 'refund_request_updated', 'maintenance_due', 'aftercare_available',
  'fee_payment_requested', 'fee_paid_by_client', 'fee_payment_lapsed', 'provider_saved',
  'payout_debt_recorded', 'payout_debt_recovered'
]::text[]));

-- ── The two notices ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.format_pounds(p_pence integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT '£' || to_char(p_pence / 100.0, 'FM999999990.00');
$function$;

CREATE OR REPLACE FUNCTION public.provider_owed_pence(p_provider_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(SUM(amount_pence - recovered_pence), 0)::integer
    FROM public.provider_shortfalls
   WHERE provider_id = p_provider_id AND recovered_pence < amount_pence;
$function$;

-- "£30.00 will come out of your next payments"
CREATE OR REPLACE FUNCTION public.notify_provider_debt_recorded()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid;
  v_client text;
  v_owed integer;
  v_what text;
BEGIN
  BEGIN
    SELECT user_id INTO v_user_id FROM public.providers WHERE id = NEW.provider_id;
    IF v_user_id IS NULL THEN
      RETURN NEW;
    END IF;
    SELECT NULLIF(split_part(trim(customer_name), ' ', 1), '') INTO v_client
      FROM public.bookings WHERE id = NEW.booking_id;
    v_owed := public.provider_owed_pence(NEW.provider_id);
    v_what := CASE NEW.source
      WHEN 'fee_refund' THEN 'late or no-show fee was refunded'
      WHEN 'bank_dispute' THEN 'payment was taken back by their bank'
      ELSE 'booking was refunded'
    END;

    INSERT INTO public.notifications (
      user_id, type, title, message, priority, is_actionable,
      booking_id, provider_id, recipient_role, metadata
    ) VALUES (
      v_user_id,
      'payout_debt_recorded',
      public.format_pounds(NEW.amount_pence) || ' will come out of your next payments',
      COALESCE(v_client || '''s ', 'A client''s ') || v_what
        || ' after you''d been paid, and ' || public.format_pounds(NEW.amount_pence)
        || ' of it couldn''t be taken back from your Stripe balance. It will come out of your next payments.'
        || CASE WHEN v_owed > NEW.amount_pence
             THEN ' In total you owe ' || public.format_pounds(v_owed) || '.'
             ELSE '' END,
      'high',
      false,
      NEW.booking_id,
      NEW.provider_id,
      'provider',
      jsonb_build_object('shortfall_id', NEW.id, 'amount_pence', NEW.amount_pence,
                         'owed_pence', v_owed, 'source', NEW.source)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[notify_provider_debt_recorded] shortfall %: % (%)', NEW.id, SQLERRM, SQLSTATE;
  END;
  RETURN NEW;
END;
$function$;

-- "£15.00 went towards what you owe". p_label names what was paid, e.g.
-- "£50.00 payment" or "£15.00 no-show fee".
CREATE OR REPLACE FUNCTION public.notify_provider_debt_recovered(
  p_provider_id uuid, p_booking_id uuid, p_taken integer, p_gross integer, p_label text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid;
  v_client text;
  v_owed integer;
  v_sent integer := GREATEST(p_gross - p_taken, 0);
BEGIN
  SELECT user_id INTO v_user_id FROM public.providers WHERE id = p_provider_id;
  IF v_user_id IS NULL OR p_taken <= 0 THEN
    RETURN;
  END IF;
  SELECT NULLIF(split_part(trim(customer_name), ' ', 1), '') INTO v_client
    FROM public.bookings WHERE id = p_booking_id;
  v_owed := public.provider_owed_pence(p_provider_id);

  INSERT INTO public.notifications (
    user_id, type, title, message, priority, is_actionable,
    booking_id, provider_id, recipient_role, metadata
  ) VALUES (
    v_user_id,
    'payout_debt_recovered',
    public.format_pounds(p_taken) || ' went towards what you owe',
    'Cerviced kept ' || public.format_pounds(p_taken) || ' of your ' || p_label
      || COALESCE(' from ' || v_client || '''s booking', '') || ' to pay off what you owe.'
      || CASE WHEN v_sent > 0
           THEN ' The other ' || public.format_pounds(v_sent) || ' has been sent to your Stripe account.'
           ELSE '' END
      || CASE WHEN v_owed > 0
           THEN ' You still owe ' || public.format_pounds(v_owed) || '.'
           ELSE ' That''s everything paid off.' END,
    'medium',
    false,
    p_booking_id,
    p_provider_id,
    'provider',
    jsonb_build_object('taken_pence', p_taken, 'sent_pence', v_sent, 'owed_pence', v_owed)
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[notify_provider_debt_recovered] provider % booking %: % (%)', p_provider_id, p_booking_id, SQLERRM, SQLSTATE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_payout_debt_recovered()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.notify_provider_debt_recovered(
    NEW.provider_id, NEW.booking_id, NEW.deducted_pence, NEW.payout_amount,
    public.format_pounds(NEW.payout_amount) || ' payment');
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_fee_payout_debt_recovered()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.notify_provider_debt_recovered(
    NEW.provider_id, NEW.booking_id, NEW.deducted_pence, COALESCE(NEW.payout_pence, 0),
    public.format_pounds(COALESCE(NEW.payout_pence, 0))
      || CASE NEW.kind WHEN 'late' THEN ' late arrival fee' ELSE ' no-show fee' END);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS after_shortfall_notify_provider ON public.provider_shortfalls;
CREATE TRIGGER after_shortfall_notify_provider
  AFTER INSERT ON public.provider_shortfalls
  FOR EACH ROW EXECUTE FUNCTION public.notify_provider_debt_recorded();

-- Fires once, when the payout is actually sent (or settled in full), never on
-- a run that deducted and then failed: release_*_shortfalls zeroes
-- deducted_pence before the row can become 'transferred'.
DROP TRIGGER IF EXISTS after_payout_sent_notify_debt_recovered ON public.provider_payouts;
CREATE TRIGGER after_payout_sent_notify_debt_recovered
  AFTER UPDATE OF status ON public.provider_payouts
  FOR EACH ROW
  WHEN (NEW.status = 'transferred' AND OLD.status IS DISTINCT FROM 'transferred' AND NEW.deducted_pence > 0)
  EXECUTE FUNCTION public.notify_payout_debt_recovered();

DROP TRIGGER IF EXISTS after_fee_payout_sent_notify_debt_recovered ON public.booking_fee_charges;
CREATE TRIGGER after_fee_payout_sent_notify_debt_recovered
  AFTER UPDATE OF payout_status ON public.booking_fee_charges
  FOR EACH ROW
  WHEN (NEW.payout_status = 'transferred' AND OLD.payout_status IS DISTINCT FROM 'transferred' AND NEW.deducted_pence > 0)
  EXECUTE FUNCTION public.notify_fee_payout_debt_recovered();

-- ── Access: server only ─────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.take_provider_shortfalls(uuid, integer, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_provider_shortfalls(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_fee_payout_shortfalls(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_fee_payout_shortfalls(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.provider_owed_pence(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_provider_debt_recorded() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_provider_debt_recovered(uuid, uuid, integer, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_payout_debt_recovered() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_fee_payout_debt_recovered() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_provider_shortfalls(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_fee_payout_shortfalls(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_fee_payout_shortfalls(uuid) TO service_role;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261029120000', 'provider_debt_notices_and_fee_recovery')
ON CONFLICT (version) DO NOTHING;

COMMIT;
