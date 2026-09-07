-- Adds cancellation/booking policies and a deposit/payment choice as hard
-- requirements to go live, at the user's explicit direction — previously
-- these were "recommended" only (see goLiveStatus.ts's own prior header,
-- which deliberately warned against this exact change: "an unset deposit
-- mode/cancellation policy doesn't stop clients from booking, it just means
-- the app falls back to sensible defaults"). That tradeoff is being
-- reversed on purpose: a provider must now explicitly choose both before
-- clients can find or book them, same as schedule/services/address already
-- work. Confirmed live before writing this: 6 providers currently live, 0
-- missing policies, 1 missing a deposit-mode choice — that provider goes
-- dark the moment this applies, until they set one.
--
-- Mirrors resolveDepositMode() (src/utils/depositPolicy.ts) exactly: "set"
-- means depositMode is one of the three valid modes, OR the legacy boolean
-- pair explicitly answers the question (depositRequired = false, or
-- depositOnly/depositRequired = true). Compared as text, not cast to
-- boolean, so a malformed/unexpected JSON shape can't raise mid-query —
-- it just reads as "not set" like resolveDepositMode's own fallthrough.
CREATE OR REPLACE FUNCTION public.check_and_set_provider_live(p_provider_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.providers p
  SET has_gone_live = (
    EXISTS (
      SELECT 1 FROM public.provider_availability a
      WHERE a.provider_id = p_provider_id AND a.is_closed = FALSE
    )
    AND EXISTS (
      SELECT 1 FROM public.services s
      WHERE s.provider_id = p_provider_id
    )
    AND EXISTS (
      SELECT 1 FROM public.provider_private_details d
      WHERE d.provider_id = p_provider_id
        AND btrim(COALESCE(d.full_address, '')) <> ''
        AND d.latitude IS NOT NULL
        AND d.longitude IS NOT NULL
    )
    AND p.booking_policies ->> 'cancelNotice' IS NOT NULL
    -- COALESCE(..., FALSE) matters here, not just style: with every deposit
    -- field NULL, each `= 'x'`/`IN (...)` comparison is NULL (SQL's
    -- three-valued logic), and `NULL OR NULL OR NULL OR NULL` is NULL, not
    -- FALSE — assigning that straight into has_gone_live (NOT NULL) raised
    -- 23502 on the one provider with no deposit choice at all. Caught by
    -- actually running this against live data, not just reading the SQL.
    AND COALESCE(
      p.booking_policies ->> 'depositMode' IN ('full_only', 'client_choice', 'deposit_required')
      OR p.booking_policies ->> 'depositRequired' = 'false'
      OR p.booking_policies ->> 'depositOnly' = 'true'
      OR p.booking_policies ->> 'depositRequired' = 'true',
      FALSE
    )
  )
  WHERE p.id = p_provider_id;
END;
$function$;

-- booking_policies changes (PoliciesScreen/PaymentsScreen, both a plain
-- providers.update()) previously triggered no go-live re-check at all — a
-- provider who fixed the one thing now blocking them would stay dark until
-- some unrelated schedule/service/address change happened to re-fire the
-- check. Same pattern as handle_provider_address_change.
CREATE OR REPLACE FUNCTION public.handle_provider_policies_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.check_and_set_provider_live(NEW.id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_provider_policies_change ON public.providers;
CREATE TRIGGER on_provider_policies_change
  AFTER UPDATE OF booking_policies ON public.providers
  FOR EACH ROW
  WHEN (NEW.booking_policies IS DISTINCT FROM OLD.booking_policies)
  EXECUTE FUNCTION public.handle_provider_policies_change();
