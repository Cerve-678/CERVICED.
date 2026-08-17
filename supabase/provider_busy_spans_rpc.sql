-- provider_busy_spans_rpc.sql
-- Safe to re-run.
--
-- PROBLEM
-- `bookings` grants SELECT only to the booking's own client
-- (bookings_user_read) and to the owning provider (bookings_provider_read).
-- There is no public-read policy — correctly, since that table holds client
-- identity and PII.
--
-- But the whole client-side availability layer
-- (AvailabilityService.getAvailableSlots / isSlotAvailable /
-- findNextAvailableDate / hasNearTermAvailabilityForServices) reads `bookings`
-- directly to decide which slots are already taken. From a client's session
-- those reads return ZERO rows for any provider the client isn't already
-- booked with — indistinguishable from "nothing is booked". So the slot picker
-- shows already-taken slots as free, and the client only discovers otherwise
-- when checkout is rejected.
--
-- This is a UX bug, not a double-booking hole: the bookings_no_overlap EXCLUDE
-- constraint and enforce_booking_bookability() both run server-side with full
-- visibility and reject a real conflict regardless of what the UI showed.
--
-- FIX
-- A SECURITY DEFINER function returning ONLY buffer-padded busy spans —
-- no booking id, no user_id, no service, no price, nothing identifying.
-- It answers exactly one question ("when is this provider unavailable?"),
-- which is the same thing the slot picker already reveals by omission.
--
-- Deliberately NOT a widened RLS policy on `bookings`: that would expose
-- every column of a table holding client PII in order to fix a
-- when-is-this-provider-busy question.

CREATE OR REPLACE FUNCTION public.get_provider_busy_spans(
  p_provider_id UUID,
  p_from_date   DATE,
  p_to_date     DATE
)
RETURNS TABLE (
  booking_date DATE,
  busy_start   TIME,
  busy_end     TIME
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT
    b.booking_date,
    -- Clamped to the booking's own calendar day. A buffer can push
    -- effective_start before midnight or effective_end past it; extracting
    -- ::time from those would wrap (e.g. 23:50 → 01:05) and produce an
    -- inverted span that silently blocks nothing, since callers compare
    -- start < end within one day. Clamping keeps the span well-formed; the
    -- few buffer minutes that spill into the neighbouring day are not
    -- represented, which the DB-level bookings_no_overlap constraint (which
    -- compares real timestamps, not times) still catches on write.
    --
    -- COALESCE also falls back to raw times for any row predating the
    -- effective_start/effective_end backfill (prevent_overlapping_bookings.sql).
    GREATEST(
      COALESCE(b.effective_start, b.booking_date + b.booking_time),
      b.booking_date::timestamp
    )::time AS busy_start,
    LEAST(
      COALESCE(
        b.effective_end,
        b.booking_date + COALESCE(b.end_time, b.booking_time + INTERVAL '1 hour')
      ),
      b.booking_date::timestamp + INTERVAL '1 day' - INTERVAL '1 second'
    )::time AS busy_end
  FROM public.bookings b
  WHERE b.provider_id = p_provider_id
    AND b.booking_date BETWEEN p_from_date AND p_to_date
    -- Same set the app's own conflict checks use: anything not cancelled or
    -- no-showed still occupies the slot. 'on_hold' included so a cart hold
    -- mid-checkout isn't offered to someone else.
    AND b.status IN ('pending', 'confirmed', 'in_progress', 'on_hold')
    -- Never expose a provider who isn't publicly listed — EXCEPT to that
    -- provider themself. Without the owner branch, a provider who hasn't
    -- gone live yet would get an empty result for their OWN schedule, so
    -- their profile card and the reschedule slot picker would show a fully
    -- open diary while real bookings sat in it. The owner branch grants
    -- nothing a provider can't already read directly via
    -- bookings_provider_read; it only stops the has_gone_live filter from
    -- hiding their own data from them.
    AND EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = b.provider_id
        AND (
          (p.has_gone_live = TRUE AND p.is_active = TRUE)
          OR p.user_id = auth.uid()
        )
    )
  -- Ordered by the underlying columns, never the output aliases: a bare
  -- `busy_start` here is ambiguous against this function's own RETURNS TABLE
  -- column of the same name (the 42702 that broke claim_cart_booking_slots).
  ORDER BY b.booking_date, b.effective_start, b.booking_time;
$$;

REVOKE ALL ON FUNCTION public.get_provider_busy_spans(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_provider_busy_spans(UUID, DATE, DATE) TO authenticated, anon;

COMMENT ON FUNCTION public.get_provider_busy_spans(UUID, DATE, DATE) IS
  'Buffer-padded busy spans for a live provider over a date range. Returns no '
  'booking identities — exists so clients can see which slots are taken '
  'without granting SELECT on bookings (which holds client PII).';
