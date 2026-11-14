-- One cancellation notice per provider: the saved policy text always says the
-- window that is actually applied.
--
-- A provider's notice is stored twice: providers.cancellation_notice_hours (the
-- window the cancel flow and refunds apply, and what Policies and the public
-- profile show) and booking_policies.cancelNotice (the copy frozen into a
-- booking's policy_snapshot, so what the client's booking page and the intake
-- template show). Before Policies wrote the column (3 Nov) the two could be set
-- apart, and on 2026-11-13 three providers who take bookings on CERVICED had
-- them disagree: Daminkfinesse 48 vs '24h', Nails Studio 24 vs '48h',
-- CuratedByCilva 24 vs '12h'. A client saw one number on the profile and
-- another on their booking.
--
-- The column wins, one way only. It is what's enforced and what everyone saw
-- before booking, and InfoReg saves back the whole policy it loaded, so letting
-- the text drive the column would let a stale save quietly change the window.
-- Policies already writes both, so its saves are unaffected.
--
-- Not touched:
--   * link-only providers (booking_mode 'external'): their notice is only their
--     own text, nothing applies a window (Uniquely Aesthetics, 24 vs '48h');
--   * a column of 0, which defers to the text (cancel_notice_hours());
--   * a policy with no cancelNotice yet, which go-live reads as "not set".
--
-- No money changes: the window applied stays exactly as it was. Bookings keep
-- their own frozen bookings.cancel_notice_hours and policy_snapshot. A cart
-- holding the old text is refused once at checkout by prepare_checkout's policy
-- check, naming the provider, and then shows the corrected policy.

BEGIN;

DO $guard$
BEGIN
  IF to_regprocedure('public.keep_cancel_notice_in_step()') IS NOT NULL THEN
    RAISE EXCEPTION 'keep_cancel_notice_in_step() already exists live; redo this migration from live';
  END IF;
END
$guard$;

CREATE FUNCTION public.cancel_notice_choice(p_hours integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $fn$
  -- Mirror of NOTICE_CHOICE_HOURS / noticeChoiceForHours() in
  -- src/utils/policyDisplay.ts. 0 and anything else has no choice of its own.
  SELECT CASE p_hours
    WHEN 12 THEN '12h'
    WHEN 24 THEN '24h'
    WHEN 48 THEN '48h'
    WHEN 72 THEN '72h'
  END;
$fn$;
-- Left executable: the trigger below runs as whoever saves the provider row
-- (a provider, through RLS), and it's a plain lookup with nothing to protect.

-- 1. Bring today's providers in step.
DO $sync$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.providers p
     SET booking_policies = jsonb_set(p.booking_policies, '{cancelNotice}',
                                      to_jsonb(public.cancel_notice_choice(p.cancellation_notice_hours)))
   WHERE p.booking_mode IS DISTINCT FROM 'external'
     AND public.cancel_notice_choice(p.cancellation_notice_hours) IS NOT NULL
     AND jsonb_typeof(p.booking_policies) = 'object'
     AND p.booking_policies->>'cancelNotice' IS NOT NULL
     AND p.booking_policies->>'cancelNotice' <> public.cancel_notice_choice(p.cancellation_notice_hours);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  -- Three on 2026-11-13. Many more means something else is going on.
  IF v_n > 10 THEN
    RAISE EXCEPTION 'Expected about 3 providers out of step, found %; look before applying', v_n;
  END IF;
  RAISE NOTICE 'cancel notice: % provider(s) brought in step', v_n;
END
$sync$;

-- 2. Keep them in step from now on, whichever screen or build writes.
CREATE FUNCTION public.keep_cancel_notice_in_step()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_choice text := public.cancel_notice_choice(NEW.cancellation_notice_hours);
BEGIN
  IF NEW.booking_mode IS NOT DISTINCT FROM 'external' OR v_choice IS NULL THEN
    RETURN NEW;
  END IF;
  IF jsonb_typeof(NEW.booking_policies) = 'object'
     AND NEW.booking_policies->>'cancelNotice' IS NOT NULL
     AND NEW.booking_policies->>'cancelNotice' <> v_choice THEN
    NEW.booking_policies := jsonb_set(NEW.booking_policies, '{cancelNotice}', to_jsonb(v_choice));
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.keep_cancel_notice_in_step() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER keep_cancel_notice_in_step
  BEFORE INSERT OR UPDATE OF cancellation_notice_hours, booking_policies, booking_mode
  ON public.providers
  FOR EACH ROW
  EXECUTE FUNCTION public.keep_cancel_notice_in_step();

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261113180000', 'cancel_notice_one_value')
ON CONFLICT DO NOTHING;

COMMIT;
