-- ============================================================
-- CERVICED — Close the buffer/duration overlap booking race
-- Run this in the Supabase SQL editor. Safe to re-run (Steps 0-3, 5).
--
-- Root cause: bookings_no_double_book_idx (prevent_double_booking.sql) is a
-- UNIQUE index on (provider_id, booking_date, booking_time) — it stops two
-- bookings landing on the EXACT same start time, but createBooking()'s
-- buffer/duration overlap check (src/services/databaseService.ts) is a
-- plain SELECT-then-INSERT with no lock. Two concurrent requests for
-- DIFFERENT start times that still overlap once duration + buffer is
-- applied (e.g. a 90-minute booking at 2:00pm and a fresh request for
-- 2:30pm) can both pass the app-side check and both insert successfully —
-- a genuine double-booking the unique index doesn't catch.
--
-- Fix: snapshot each booking's buffer-padded [effective_start, effective_end)
-- span onto the row itself (via trigger, since buffer lives on services/
-- providers, not on bookings), then enforce non-overlap with a GiST EXCLUDE
-- constraint — atomic at the database level, immune to app-side race
-- conditions regardless of which code path writes the row (fresh booking,
-- client reschedule confirm, provider-initiated reschedule all go through
-- an INSERT or UPDATE on this table, so all three are covered by one fix
-- instead of needing the overlap check duplicated in each).
-- ============================================================

-- Step 0: needed for the EXCLUDE constraint's equality operator class on a
-- UUID column (provider_id) alongside the timestamp range's overlap
-- operator — GiST can't mix "=" and "&&" across different column types
-- without it.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Step 1: columns to hold the computed, buffer-padded span.
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS effective_start TIMESTAMP;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS effective_end   TIMESTAMP;

-- Step 2: trigger to (re)compute the span whenever scheduling-relevant
-- columns change, looking up each service's own buffer override (falling
-- back to the provider's buffer_mins) — the same rule createBooking() and
-- AvailabilityService already apply in the app (NULL on the service means
-- "no override": buffer_before -> 0, buffer_after -> provider's buffer_mins).
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
-- SECURITY DEFINER: providers_public_read/services_public_read only expose
-- is_active rows. Without this, a provider/service that goes inactive at
-- exactly the wrong moment makes the SELECT ... INTO above match nothing,
-- and the COALESCE(..., 0) fallbacks would silently treat that as "no
-- buffer" — quietly narrowing the exact protection this migration adds,
-- instead of failing loudly. Running as the function owner means the
-- lookup always sees the real row regardless of the calling role's RLS.

DROP TRIGGER IF EXISTS trg_compute_booking_effective_range ON public.bookings;
CREATE TRIGGER trg_compute_booking_effective_range
  BEFORE INSERT OR UPDATE OF booking_date, booking_time, end_time, service_id, provider_id
  ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.compute_booking_effective_range();

-- Step 3: backfill existing rows — the trigger above only fires on future
-- INSERT/UPDATE. This no-op assignment (booking_date unchanged) still
-- fires "UPDATE OF booking_date", populating effective_start/effective_end
-- for every row already in the table. Confirmed safe: every notification
-- trigger on this table is scoped to `AFTER UPDATE OF status`, so this
-- does not touch status and will not fire any client/provider notification.
UPDATE public.bookings SET booking_date = booking_date;

-- Step 4: diagnostic — list any ACTIVE bookings that already overlap once
-- buffer is applied (possible if the race this migration closes has
-- already been hit in production). If this returns any rows, resolve them
-- manually (contact the client/provider, cancel or reschedule one side)
-- before running Step 5 — do NOT auto-cancel one side the way
-- prevent_double_booking.sql does for exact-duplicate slots. These are
-- genuinely different, real appointments; picking which one "loses" is a
-- business call, not something to script.
SELECT a.id AS booking_a, b.id AS booking_b, a.provider_id,
       a.booking_date AS date_a, a.booking_time AS time_a, a.end_time AS end_a,
       b.booking_date AS date_b, b.booking_time AS time_b, b.end_time AS end_b
FROM public.bookings a
JOIN public.bookings b
  ON a.provider_id = b.provider_id
 AND a.id < b.id
 AND a.status NOT IN ('cancelled', 'no_show')
 AND b.status NOT IN ('cancelled', 'no_show')
 AND tsrange(a.effective_start, a.effective_end) && tsrange(b.effective_start, b.effective_end);

-- Step 5: the actual guard. Run this only once Step 4 returns zero rows —
-- otherwise it will fail with "conflicting key value violates exclusion
-- constraint", which is the correct, safe outcome (see Step 4's note).
--
-- DEPLOYED 2026-08-03 with a future-only scope, not the unscoped version
-- below as originally written. 7 pre-existing overlaps (see PRE-LAUNCH-TODO.md
-- §2) were all fully in the past; rather than requiring a human business
-- decision on 7 already-completed bookings before protecting any future
-- ones, the constraint grandfathers anything ending before the cutoff.
-- `now()` isn't allowed in an EXCLUDE constraint's WHERE predicate (must be
-- IMMUTABLE), so the cutoff is a fixed literal timestamp rather than a
-- rolling window — it protects everything from deploy date forward, it does
-- not mean "N days before whenever this is queried."
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_no_overlap;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    provider_id WITH =,
    tsrange(effective_start, effective_end) WITH &&
  ) WHERE (status NOT IN ('cancelled', 'no_show') AND effective_end > '2026-08-03'::timestamp);

-- Violations surface to the app as Postgres error code 23P01
-- (exclusion_violation) — handled in BookingContext.tsx's createBookingsFromCart
-- itemError catch alongside the existing 23505 (exact-slot) case, and
-- should be handled the same way anywhere else a booking's date/time/
-- service/provider can be written (reschedule confirm, provider reschedule).
