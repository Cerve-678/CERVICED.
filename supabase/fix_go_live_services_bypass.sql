-- ============================================================
-- CERVICED — Fix: a provider can go live with zero services
-- Run this in the Supabase SQL editor. Safe to re-run.
--
-- Root cause: require_services_for_go_live.sql added
-- check_and_set_provider_live(provider_id), which correctly requires BOTH
-- an open schedule day AND at least one service before setting
-- has_gone_live = TRUE. But availability_v2.sql's trigger on
-- provider_availability_windows (handle_availability_window_change) sets
-- has_gone_live = TRUE unconditionally, with no services check at all.
--
-- ProviderScheduleScreen.tsx's handleSaveHours() writes to BOTH the legacy
-- provider_availability table (which correctly triggers
-- check_and_set_provider_live) AND provider_availability_windows (the v2
-- table the app actually reads availability from) in the same save. The v2
-- write's unconditional trigger fires right after and overrides whatever the
-- correctly-gated check just decided — so saving a schedule alone is enough
-- to go live, services or not.
--
-- Fix: route the v2 trigger through the same gated check instead of setting
-- the flag directly, so both write paths enforce the same requirement.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_availability_window_change()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.check_and_set_provider_live(NEW.provider_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
