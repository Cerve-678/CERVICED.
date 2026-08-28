-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260802152337
-- Remote name: prevent_overlapping_bookings_steps_0_2
-- Do not edit this recovery archive; create a new tracked migration for changes.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS effective_start TIMESTAMP;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS effective_end   TIMESTAMP;

CREATE OR REPLACE FUNCTION public.compute_booking_effective_range()
RETURNS TRIGGER AS $$
DECLARE
  v_provider_buffer INT;
  v_buffer_before INT := 0;
  v_buffer_after INT;
  v_end_time TIME;
BEGIN
  SELECT COALESCE(buffer_mins, 0) INTO v_provider_buffer
  FROM public.providers WHERE id = NEW.provider_id;
  v_provider_buffer := COALESCE(v_provider_buffer, 0);
  v_buffer_after := v_provider_buffer;

  IF NEW.service_id IS NOT NULL THEN
    SELECT buffer_before_mins, buffer_after_mins
    INTO v_buffer_before, v_buffer_after
    FROM public.services WHERE id = NEW.service_id;
    v_buffer_before := COALESCE(v_buffer_before, 0);
    v_buffer_after := COALESCE(v_buffer_after, v_provider_buffer);
  END IF;

  v_end_time := COALESCE(NEW.end_time, NEW.booking_time + INTERVAL '60 minutes');

  NEW.effective_start := (NEW.booking_date + NEW.booking_time) - (v_buffer_before || ' minutes')::interval;
  NEW.effective_end   := (NEW.booking_date + v_end_time) + (v_buffer_after || ' minutes')::interval;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_compute_booking_effective_range ON public.bookings;
CREATE TRIGGER trg_compute_booking_effective_range
  BEFORE INSERT OR UPDATE OF booking_date, booking_time, end_time, service_id, provider_id
  ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.compute_booking_effective_range();
