-- Makes has_gone_live bidirectional: a provider who closes their last open
-- day or deletes their last service is un-published, not left live with
-- nothing bookable (PRE-LAUNCH-TODO.md item 11a). Same 3-condition gate,
-- now re-derived both ways instead of only ever flipping false->true.
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
  )
  WHERE p.id = p_provider_id;
END;
$function$;

-- Previously skipped the check entirely when a day was being CLOSED
-- (`IF NEW.is_closed = FALSE THEN`), which is exactly the direction that
-- needs to re-check now that the gate is bidirectional.
CREATE OR REPLACE FUNCTION public.handle_provider_availability_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.check_and_set_provider_live(NEW.provider_id);
  RETURN NEW;
END;
$function$;

-- services previously had only an AFTER INSERT trigger, so deleting the
-- last service triggered nothing at all.
CREATE OR REPLACE FUNCTION public.handle_provider_service_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.check_and_set_provider_live(OLD.provider_id);
  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS on_provider_service_delete ON public.services;
CREATE TRIGGER on_provider_service_delete
  AFTER DELETE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.handle_provider_service_delete();
