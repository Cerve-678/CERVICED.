-- Migration: require at least one service, not just an open schedule day,
-- before a provider goes live.
-- Run this in the Supabase SQL editor AFTER provider_schedule_gating.sql.
-- Safe to re-run.
--
-- Previously has_gone_live flipped TRUE the moment a provider published one
-- open availability day, with no awareness of whether they'd added any
-- services. A provider could set a schedule, skip services entirely, and
-- immediately appear to clients with an empty, unbookable-in-practice
-- profile. Owner's decision (2026-07-15): a provider "shouldn't exist on
-- the app yet" until they're actually ready — schedule AND services both
-- required.
--
-- has_gone_live remains a ONE-WAY flag — this migration only tightens the
-- condition for the FIRST flip to TRUE. It never un-flips an
-- already-live provider, even if they later remove all services or close
-- every day (same one-way design as provider_schedule_gating.sql).

-- ───────────────────────────────────────────────────────────
-- STEP 1: Shared check — flips has_gone_live TRUE only when both an open
-- schedule day AND at least one service exist for the provider.
-- ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.check_and_set_provider_live(p_provider_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.providers p
  SET has_gone_live = TRUE
  WHERE p.id = p_provider_id
    AND p.has_gone_live = FALSE
    AND EXISTS (
      SELECT 1 FROM public.provider_availability a
      WHERE a.provider_id = p_provider_id AND a.is_closed = FALSE
    )
    AND EXISTS (
      SELECT 1 FROM public.services s
      WHERE s.provider_id = p_provider_id
    );
END;
$$;

-- ───────────────────────────────────────────────────────────
-- STEP 2: Re-point the existing availability trigger function at the
-- shared check (same trigger, same name — CREATE OR REPLACE updates the
-- body in place, no need to touch the trigger itself).
-- ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_provider_availability_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_closed = FALSE THEN
    PERFORM public.check_and_set_provider_live(NEW.provider_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ───────────────────────────────────────────────────────────
-- STEP 3: New trigger — adding a service can also be the "last piece"
-- that completes go-live, if the schedule was set first.
-- ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_provider_service_insert()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.check_and_set_provider_live(NEW.provider_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_provider_service_insert ON public.services;
CREATE TRIGGER on_provider_service_insert
  AFTER INSERT ON public.services
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_provider_service_insert();
