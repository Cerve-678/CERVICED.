-- Fix: address auto-release on confirmation never fired
-- ─────────────────────────────────────────────────────────────────────────────
-- The auto_release_address() trigger guarded on NEW.status = 'upcoming', but the
-- bookings table only ever stores 'confirmed' (the app's 'upcoming' is a
-- display-only alias that maps to 'confirmed' on write). As a result
-- address_released_at was never set on confirmation, so clients with an
-- 'on_confirmation' provider never saw the address even though the provider UI
-- reported it as sent.
--
-- This migration (1) redefines the trigger to fire on the real 'confirmed'
-- transition, and (2) backfills bookings that were already confirmed while the
-- trigger was broken. Safe to run multiple times.

-- 1. Redefine the trigger function ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_release_address()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM 'confirmed' THEN
    UPDATE public.bookings
    SET address_released_at = NOW()
    WHERE id = NEW.id
      AND address_released_at IS NULL
      AND EXISTS (
        SELECT 1 FROM public.providers p
        WHERE p.id = NEW.provider_id
          AND p.address_release_policy = 'on_confirmation'
      );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_release_address ON public.bookings;
CREATE TRIGGER trg_auto_release_address
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.auto_release_address();

-- 2. Backfill already-confirmed bookings that never got released ───────────────
UPDATE public.bookings b
SET address_released_at = COALESCE(b.confirmed_at, b.updated_at, NOW())
FROM public.providers p
WHERE b.provider_id = p.id
  AND p.address_release_policy = 'on_confirmation'
  AND b.address_released_at IS NULL
  AND b.status IN ('confirmed', 'in_progress', 'completed');
