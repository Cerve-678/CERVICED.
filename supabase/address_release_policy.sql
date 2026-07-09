-- Migration: address release policy
-- Adds business type, private full address, and release policy to providers.
-- Adds address_released_at tracking to bookings.

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS business_type TEXT
    CHECK (business_type IN ('salon','studio','home_based','mobile')),
  ADD COLUMN IF NOT EXISTS full_address TEXT,
  ADD COLUMN IF NOT EXISTS address_release_policy TEXT
    DEFAULT 'on_confirmation'
    CHECK (address_release_policy IN (
      'always','on_confirmation','day_before',
      'two_days_before','three_days_before','five_days_before','week_before',
      'manual'
    ));

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS address_released_at TIMESTAMPTZ;

-- Automatically release address when booking status moves to 'upcoming'
-- (handles the on_confirmation policy at the DB level as a safety net)
CREATE OR REPLACE FUNCTION public.auto_release_address()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'upcoming' AND OLD.status = 'pending' THEN
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
