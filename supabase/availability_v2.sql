-- CERVICED availability v2
-- One provider can have several working periods in a day (for example
-- 09:00–13:00 and 14:00–18:00) plus date-specific exceptions.  The legacy
-- provider_availability table remains supported for existing providers.

CREATE TABLE IF NOT EXISTS public.provider_availability_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (start_time < end_time),
  UNIQUE (provider_id, day_of_week, start_time)
);

CREATE INDEX IF NOT EXISTS idx_availability_windows_provider_day
  ON public.provider_availability_windows(provider_id, day_of_week, start_time);

CREATE TABLE IF NOT EXISTS public.provider_availability_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  availability_date DATE NOT NULL,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  start_time TIME,
  end_time TIME,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (is_closed = TRUE AND start_time IS NULL AND end_time IS NULL)
    OR (is_closed = FALSE AND start_time IS NOT NULL AND end_time IS NOT NULL AND start_time < end_time)
  ),
  UNIQUE (provider_id, availability_date, start_time)
);

CREATE INDEX IF NOT EXISTS idx_availability_overrides_provider_date
  ON public.provider_availability_overrides(provider_id, availability_date, start_time);

ALTER TABLE public.provider_availability_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_availability_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "availability_windows_public_read" ON public.provider_availability_windows;
CREATE POLICY "availability_windows_public_read" ON public.provider_availability_windows
  FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS "availability_windows_owner_write" ON public.provider_availability_windows;
CREATE POLICY "availability_windows_owner_write" ON public.provider_availability_windows
  FOR ALL USING (provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "availability_overrides_public_read" ON public.provider_availability_overrides;
CREATE POLICY "availability_overrides_public_read" ON public.provider_availability_overrides
  FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS "availability_overrides_owner_write" ON public.provider_availability_overrides;
CREATE POLICY "availability_overrides_owner_write" ON public.provider_availability_overrides
  FOR ALL USING (provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid()));

-- Backfill each legacy open day as the first working period. Existing providers
-- continue to work immediately; saving through the redesigned screen moves
-- them fully onto these tables.
INSERT INTO public.provider_availability_windows (provider_id, day_of_week, start_time, end_time)
SELECT provider_id, day_of_week, open_time, close_time
FROM public.provider_availability
WHERE is_closed = FALSE
ON CONFLICT (provider_id, day_of_week, start_time) DO NOTHING;

-- The existing go-live flag should also be set for providers using v2 windows.
CREATE OR REPLACE FUNCTION public.handle_availability_window_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.providers SET has_gone_live = TRUE
  WHERE id = NEW.provider_id AND has_gone_live = FALSE;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_availability_window_change ON public.provider_availability_windows;
CREATE TRIGGER on_availability_window_change
  AFTER INSERT OR UPDATE ON public.provider_availability_windows
  FOR EACH ROW EXECUTE FUNCTION public.handle_availability_window_change();

-- Server-side defence in depth. The mobile app uses the same rules to render
-- slots, but the database must reject a stale or manipulated direct insert.
CREATE OR REPLACE FUNCTION public.enforce_booking_bookability()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_window_days INTEGER;
  v_notice_hours INTEGER;
  v_has_override BOOLEAN;
  v_fits_window BOOLEAN;
  v_legacy_open TIME;
  v_legacy_close TIME;
  v_legacy_closed BOOLEAN;
BEGIN
  SELECT booking_window_days, min_booking_notice_hrs
    INTO v_window_days, v_notice_hours
    FROM public.providers WHERE id = NEW.provider_id;

  IF NEW.booking_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Booking date cannot be in the past';
  END IF;
  IF COALESCE(v_window_days, 60) > 0
     AND NEW.booking_date > CURRENT_DATE + COALESCE(v_window_days, 60) THEN
    RAISE EXCEPTION 'Booking is outside this provider''s booking window';
  END IF;
  IF COALESCE(v_notice_hours, 0) > 0
     AND (NEW.booking_date + NEW.booking_time) < now() + make_interval(hours => v_notice_hours) THEN
    RAISE EXCEPTION 'This appointment does not meet the provider''s minimum notice';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.provider_blocked_dates
    WHERE provider_id = NEW.provider_id AND blocked_date = NEW.booking_date
  ) THEN RAISE EXCEPTION 'Provider is unavailable on this date'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.provider_availability_overrides
     WHERE provider_id = NEW.provider_id AND availability_date = NEW.booking_date
  ) INTO v_has_override;
  IF v_has_override AND EXISTS (
    SELECT 1 FROM public.provider_availability_overrides
     WHERE provider_id = NEW.provider_id AND availability_date = NEW.booking_date AND is_closed
  ) THEN RAISE EXCEPTION 'Provider is unavailable on this date'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.provider_availability_overrides
     WHERE provider_id = NEW.provider_id AND availability_date = NEW.booking_date
       AND is_closed = FALSE AND NEW.booking_time >= start_time AND NEW.end_time <= end_time
  ) INTO v_fits_window;

  IF NOT v_has_override THEN
    SELECT EXISTS (
      SELECT 1 FROM public.provider_availability_windows
       WHERE provider_id = NEW.provider_id
         AND day_of_week = EXTRACT(DOW FROM NEW.booking_date)
         AND NEW.booking_time >= start_time AND NEW.end_time <= end_time
    ) INTO v_fits_window;

    -- Providers not yet migrated retain their original single daily period.
    IF NOT v_fits_window AND NOT EXISTS (
      SELECT 1 FROM public.provider_availability_windows WHERE provider_id = NEW.provider_id
    ) THEN
      SELECT open_time, close_time, is_closed INTO v_legacy_open, v_legacy_close, v_legacy_closed
      FROM public.provider_availability
      WHERE provider_id = NEW.provider_id AND day_of_week = EXTRACT(DOW FROM NEW.booking_date);
      v_fits_window := FOUND AND NOT COALESCE(v_legacy_closed, TRUE)
        AND NEW.booking_time >= v_legacy_open AND NEW.end_time <= v_legacy_close;
    END IF;
  END IF;
  IF NOT COALESCE(v_fits_window, FALSE) THEN
    RAISE EXCEPTION 'This appointment is outside the provider''s working hours';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.bookings b
     WHERE b.provider_id = NEW.provider_id AND b.booking_date = NEW.booking_date
       AND b.status IN ('pending', 'confirmed', 'in_progress')
       AND b.id IS DISTINCT FROM NEW.id
       AND NEW.booking_time < b.end_time AND NEW.end_time > b.booking_time
  ) THEN RAISE EXCEPTION 'That time is no longer available'; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS before_booking_enforce_bookability ON public.bookings;
CREATE TRIGGER before_booking_enforce_bookability
  BEFORE INSERT OR UPDATE OF booking_date, booking_time, end_time, provider_id ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_bookability();
