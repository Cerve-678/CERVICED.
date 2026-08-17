
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_no_overlap;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    provider_id WITH =,
    tsrange(effective_start, effective_end) WITH &&
  ) WHERE (status NOT IN ('cancelled', 'no_show') AND effective_end > '2026-08-03'::timestamp);
;
