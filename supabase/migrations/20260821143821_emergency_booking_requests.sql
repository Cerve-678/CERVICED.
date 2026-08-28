-- Emergency booking requests: let a CLIENT ask for a time the provider's own
-- scheduling rules would otherwise reject outright, when — and only when —
-- that provider has opted into receiving those requests.
--
-- BACKGROUND: 20260816174349_manual_booking_working_hours_bypass.sql and
-- 20260817152938_manual_booking_scheduling_policy_override.sql already gave
-- the PROVIDER a way past these same four checks for their own manual
-- "squeeze-in" bookings (the two cerviced.bypass_* transaction-local GUCs).
-- A client had no equivalent: getAvailableSlots simply never offered the
-- time, and enforce_booking_bookability() rejected it if they somehow got
-- one through. In practice providers DO take work outside their published
-- hours and on days they'd blocked out; the app had no way to express it,
-- so those bookings happened off-platform or not at all.
--
-- SHAPE: four independent per-provider opt-ins, one per check, each default
-- FALSE so nothing changes for any existing provider until they turn it on:
--
--   allow_out_of_hours_requests   'This appointment is outside the
--                                  provider''s working hours'
--   allow_blocked_date_requests   'Provider is unavailable on this date'
--                                  (provider_blocked_dates AND a one-off
--                                  is_closed availability override)
--   allow_short_notice_requests   'This appointment does not meet the
--                                  provider''s minimum notice'
--   allow_beyond_window_requests  'Booking is outside this provider''s
--                                  booking window'
--
-- STILL HARD FOR EVERYONE, NO OPT-IN: a past date, a same-day time that has
-- already elapsed, and a genuinely taken slot (bookings_no_overlap plus the
-- trigger's own overlap check). Same three exclusions the provider-side
-- override already respects — none of them is a policy preference.
--
-- BOUNDED, NOT OPEN-ENDED: allowing out-of-hours requests must not mean
-- "any client may ask for 4am". out_of_hours_extension_mins (default 120)
-- bounds how far past the provider's own working envelope — the earliest
-- start and latest end across their whole recurring week — a request may
-- reach. A provider with no recurring schedule at all has no envelope to
-- extend, so their out-of-hours requests are rejected rather than
-- unbounded. src/services/AvailabilityService.ts generates the client's
-- "by request" slots from this exact same envelope + extension, so the
-- picker never offers a time this trigger would then reject.
--
-- ALWAYS PENDING: bookings.is_emergency_request is checked by
-- finalize_checkout(), which will NOT auto-confirm one even for a provider
-- with auto_accept_bookings = true. The whole point is that the provider
-- accepts it deliberately, so an opted-in provider can never be silently
-- auto-committed to a 9pm Sunday.
--
-- ACKNOWLEDGEMENT: emergency_ack_at records that the client was shown, and
-- accepted, the "this is outside their normal availability — read their
-- policy first" confirmation. Mirrors safety_ack_at exactly, including
-- being enforced server-side in prepare_checkout so the client-side dialog
-- can't be skipped by calling the RPC with a hand-built payload.
--
-- APPLIED LIVE 2026-08-21 as five migration records (20260821143821 …
-- 20260821144027), one per file here — the MCP apply path takes one
-- statement batch at a time, and the filenames must match the recorded
-- versions or supabase/migrations/ stops being a true record of live.
--
-- Safe to re-run.

-- ── Part 1 of 5: the columns. ───────────────────────────────────────────
ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS allow_out_of_hours_requests  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_blocked_date_requests  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_short_notice_requests  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_beyond_window_requests boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS out_of_hours_extension_mins  integer NOT NULL DEFAULT 120;

DO $$
BEGIN
  ALTER TABLE public.providers
    ADD CONSTRAINT providers_out_of_hours_extension_mins_range
    CHECK (out_of_hours_extension_mins BETWEEN 0 AND 720);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.providers.allow_out_of_hours_requests IS
  'Client may REQUEST a time outside this provider''s working hours (bounded by out_of_hours_extension_mins). Always lands pending — never auto-confirmed.';
COMMENT ON COLUMN public.providers.allow_blocked_date_requests IS
  'Client may REQUEST a date this provider blocked out, or closed via a one-off availability override.';
COMMENT ON COLUMN public.providers.allow_short_notice_requests IS
  'Client may REQUEST a time inside this provider''s min_booking_notice_hrs.';
COMMENT ON COLUMN public.providers.allow_beyond_window_requests IS
  'Client may REQUEST a date beyond this provider''s booking_window_days.';
COMMENT ON COLUMN public.providers.out_of_hours_extension_mins IS
  'How far either side of the provider''s recurring weekly envelope an out-of-hours request may reach. 0 disables the extension entirely.';

-- ── 2. The booking's own flag ───────────────────────────────────────────
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS is_emergency_request boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS emergency_ack_at     timestamptz;

COMMENT ON COLUMN public.bookings.is_emergency_request IS
  'Client asked for a time this provider''s scheduling rules would normally reject, under one of the providers.allow_*_requests opt-ins. Never auto-confirmed.';
COMMENT ON COLUMN public.bookings.emergency_ack_at IS
  'When the client accepted the out-of-hours confirmation (having been pointed at the provider''s policy). Required by prepare_checkout whenever is_emergency_request is true.';

-- Provider-side reads of "what needs my attention" filter on this; a partial
-- index keeps that free rather than scanning every historical booking.
CREATE INDEX IF NOT EXISTS bookings_emergency_requests_idx
  ON public.bookings (provider_id, booking_date)
  WHERE is_emergency_request;
