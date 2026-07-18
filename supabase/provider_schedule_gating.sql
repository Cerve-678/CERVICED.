-- ============================================================
-- CERVICED — Provider Schedule Gating
-- Run this in the Supabase SQL editor AFTER phase1_schema.sql.
-- Safe to re-run.
--
-- Problem: a provider who finishes registration but never sets a
-- schedule (zero open rows in provider_availability) still shows up
-- in client search/browse and on their own profile page looking
-- fully bookable. The only place that ever caught this was deep
-- inside the app's slot-generation logic, which silently returned
-- zero time slots with no explanation anywhere in the UI.
--
-- Fix: providers.has_gone_live tracks whether a provider has EVER
-- published at least one open day. It is a ONE-WAY flag — once true,
-- it stays true. A provider mid-edit toggling days off while setting
-- up new hours must never flicker in and out of client search.
-- ============================================================

-- ───────────────────────────────────────────────────────────
-- STEP 1: Add the flag
-- ───────────────────────────────────────────────────────────

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS has_gone_live BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_providers_has_gone_live
  ON public.providers(has_gone_live);

-- ───────────────────────────────────────────────────────────
-- STEP 2: Backfill — providers that already have a published
-- schedule shouldn't suddenly disappear from search.
-- ───────────────────────────────────────────────────────────

UPDATE public.providers p
SET has_gone_live = TRUE
WHERE has_gone_live = FALSE
  AND EXISTS (
    SELECT 1 FROM public.provider_availability a
    WHERE a.provider_id = p.id
      AND a.is_closed = FALSE
  );

-- ───────────────────────────────────────────────────────────
-- STEP 3: Trigger — flips has_gone_live to TRUE the first time a
-- provider publishes an open day. Never flips it back to FALSE.
-- ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_provider_availability_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_closed = FALSE THEN
    UPDATE public.providers
    SET has_gone_live = TRUE
    WHERE id = NEW.provider_id
      AND has_gone_live = FALSE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_provider_availability_upsert ON public.provider_availability;
CREATE TRIGGER on_provider_availability_upsert
  AFTER INSERT OR UPDATE ON public.provider_availability
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_provider_availability_change();
