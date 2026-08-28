-- ============================================================
-- Remove two provider reminders that assert facts the app cannot verify.
--
-- 1. "Payment Not Collected" (balance_reminder, via
--    process_provider_unpaid_deposit_reminders) fired on any confirmed
--    booking whose payment_status was still 'pending'. payment_status is
--    not evidence of whether the provider was actually paid — a
--    provider-created booking is written with amount_paid 0, and a client
--    may have paid off-app entirely. The app was therefore telling a
--    provider "no payment collected yet" about money it never handled and
--    cannot see. Same liability boundary that removed "mark balance
--    collected" and the outstanding-balance reminder.
--
-- 2. "Appointment Not Started" (booking_not_started, via
--    process_provider_not_started_reminders) fired 15 minutes past a
--    confirmed booking's start time if nobody had tapped "start". That is
--    a statement about whether an appointment happened, derived purely
--    from whether a button was pressed. If a client and provider ever
--    dispute what happened, the app would be holding a system-generated
--    record asserting the appointment did not start, with nothing behind
--    it. Not a claim it is in a position to make.
--
-- Both cron jobs are unscheduled and both producers dropped. The rows they
-- already wrote are purged by the companion migration
-- 20260821133926_purge_unverifiable_payment_and_not_started_notifications.
-- Both type values are deliberately LEFT in the notifications CHECK
-- constraint — nothing produces them any more, and the constraint was never
-- the thing holding the line here.
-- ============================================================

-- 1. Unschedule both cron jobs (guarded — safe to re-run) ──────────────────
DO $$
DECLARE
  j TEXT;
BEGIN
  FOREACH j IN ARRAY ARRAY[
    'provider-unpaid-deposit-reminders',
    'provider-not-started-reminders'
  ] LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = j) THEN
      PERFORM cron.unschedule(j);
    END IF;
  END LOOP;
END $$;

-- 2. Drop both producer functions ─────────────────────────────────────────
DROP FUNCTION IF EXISTS public.process_provider_unpaid_deposit_reminders();
DROP FUNCTION IF EXISTS public.process_provider_not_started_reminders();

-- 3. Drop the two now-unproducible types from the reminder throttle's list
--    (nothing can insert them any more, so counting them was dead weight)
CREATE OR REPLACE FUNCTION public.throttle_reminder_notifications()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  reminder_types text[] := array[
    'booking_pending','provider_message',
    'reschedule_request','intake_form_reminder',
    'booking_reminder'
  ];
  v_item_key  text;
  v_prior     int;
  v_last      timestamptz;
  v_required  interval;
  v_daily_cap constant int := 10;
  v_item_cap  constant int := 3;
begin
  if not (NEW.type = any(reminder_types)) then
    return NEW;
  end if;

  if (select count(*) from public.notifications n
        where n.user_id = NEW.user_id
          and n.type = any(reminder_types)
          and n.created_at > now() - interval '24 hours') >= v_daily_cap then
    return null;
  end if;

  v_item_key := coalesce(NEW.booking_id::text, NEW.metadata->>'conversation_id', NEW.provider_id::text, '');

  select count(*), max(n.created_at)
    into v_prior, v_last
    from public.notifications n
   where n.user_id = NEW.user_id
     and n.type    = NEW.type
     and coalesce(n.booking_id::text, n.metadata->>'conversation_id', n.provider_id::text, '') = v_item_key;

  if v_prior >= v_item_cap then
    return null;
  end if;

  v_required := case v_prior when 0 then interval '0' when 1 then interval '6 hours' else interval '24 hours' end;
  if v_last is not null and v_last > now() - v_required then
    return null;
  end if;

  return NEW;
end;
$function$;
