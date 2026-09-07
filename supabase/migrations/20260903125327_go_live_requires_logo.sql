-- Adds a logo as a fourth hard go-live requirement, alongside
-- schedule/services/address (original three) and policies/payment (added
-- earlier today) — user's explicit direction, same session. Confirmed live
-- before writing this: all 5 currently-live providers already have a logo,
-- so this has zero immediate impact on who's published.
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
    AND btrim(COALESCE(p.logo_url, '')) <> ''
  )
  WHERE p.id = p_provider_id;
END;
$function$;

-- logo_url is a plain column on providers itself (no side table), so —
-- same reasoning as booking_policies above — nothing previously re-checked
-- go-live status when it changed.
CREATE OR REPLACE FUNCTION public.handle_provider_logo_change()
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

DROP TRIGGER IF EXISTS on_provider_logo_change ON public.providers;
CREATE TRIGGER on_provider_logo_change
  AFTER UPDATE OF logo_url ON public.providers
  FOR EACH ROW
  WHEN (NEW.logo_url IS DISTINCT FROM OLD.logo_url)
  EXECUTE FUNCTION public.handle_provider_logo_change();
