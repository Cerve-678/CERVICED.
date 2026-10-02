-- DRAFT — NOT YET APPLIED, and DO NOT APPLY until providers have onboarded.
-- Rename to a real version number ABOVE the live max at apply time; claim the
-- migration lock first.
--
-- HARD GATE: a provider cannot be live/bookable until Stripe says they can be
-- paid (charges_enabled = true, i.e. KYC complete). This is the "can't be
-- paid -> can't be bookable" rule.
--
-- ⚠️ ROLLOUT ORDER MATTERS. The moment this applies, every provider whose
-- stripe_charges_enabled is still false goes dark (same as the deposit-mode
-- gate did to the one unconfigured provider on 2026-09-03). Apply this ONLY
-- after your live providers have completed Connect onboarding — otherwise you
-- take the whole marketplace offline. Confirm the live count of providers
-- with stripe_charges_enabled = false BEFORE applying, exactly as the
-- deposit-mode gate migration did.
--
-- This re-declares check_and_set_provider_live with ONE added condition
-- (stripe_charges_enabled). Everything else is copied verbatim from
-- 20260903123949_go_live_requires_policies_and_payment.sql — CREATE OR
-- REPLACE means the whole body must be restated, and dropping any existing
-- condition here would silently un-gate it (the exact CREATE OR REPLACE
-- footgun called out in CLAUDE.md). Diff this against the live definition
-- (pg_get_functiondef) before applying, never against a possibly-stale file.

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
    AND COALESCE(
      p.booking_policies ->> 'depositMode' IN ('full_only', 'client_choice', 'deposit_required')
      OR p.booking_policies ->> 'depositRequired' = 'false'
      OR p.booking_policies ->> 'depositOnly' = 'true'
      OR p.booking_policies ->> 'depositRequired' = 'true',
      FALSE
    )
    -- NEW: Stripe Connect KYC complete. A provider who cannot be paid cannot
    -- be booked. Synced from Stripe by stripe-webhook; never client-set.
    AND p.stripe_charges_enabled = TRUE
  )
  WHERE p.id = p_provider_id;
END;
$function$;

-- Nudge every provider's go-live status once so anyone who has since become
-- charges_enabled is re-evaluated (and anyone not yet onboarded goes dark).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.providers LOOP
    PERFORM public.check_and_set_provider_live(r.id);
  END LOOP;
END $$;
