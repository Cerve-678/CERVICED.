-- Address release — enforce at the data layer, not in the client UI
-- ─────────────────────────────────────────────────────────────────────────────
-- Previously the client fetched every booking column (SELECT *) plus the
-- provider's full_address, and the booking-details screen merely *hid* the
-- address until the release policy allowed it. The secret had already left the
-- server — the screen was acting as the policy engine.
--
-- This migration moves the boundary into the database:
--   1. is_address_released()  — the release policy expressed once, in SQL.
--   2. client_bookings view   — what the CLIENT reads. The provider address /
--      coordinates come back NULL until is_address_released() is true, so the
--      address is never transmitted to a client that shouldn't see it yet.
--
-- The provider's own reads (getProviderBookings) go straight to the base table
-- and are unaffected — a provider always sees their own address.
--
-- Pair this with:
--   • fix_address_release_on_confirm.sql — stamps address_released_at on confirm
--   • the client no longer selecting providers.full_address (see databaseService)
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- NOTE: the column list below mirrors public.bookings as the app consumes it;
-- if you add booking columns the client needs, add them here too.

-- 1. Release policy, expressed once ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_address_released(
  p_status       TEXT,
  p_policy       TEXT,
  p_released_at  TIMESTAMPTZ,
  p_booking_date DATE,
  p_booking_time TIME
) RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT CASE
    -- A concrete release timestamp (manual release, or the on_confirmation
    -- trigger) always wins.
    WHEN p_released_at IS NOT NULL THEN TRUE
    WHEN p_policy = 'always' THEN TRUE
    WHEN p_policy = 'on_confirmation'
      THEN p_status IN ('confirmed', 'in_progress', 'completed')
    -- Time-based: released once we are within N hours of the appointment.
    -- Wall-clock time is interpreted as UTC (the app has no per-provider tz yet).
    WHEN p_policy IN ('day_before','two_days_before','three_days_before','five_days_before','week_before')
      THEN now() >= ((p_booking_date + p_booking_time) AT TIME ZONE 'UTC') - (
        CASE p_policy
          WHEN 'day_before'        THEN INTERVAL '24 hours'
          WHEN 'two_days_before'   THEN INTERVAL '48 hours'
          WHEN 'three_days_before' THEN INTERVAL '72 hours'
          WHEN 'five_days_before'  THEN INTERVAL '120 hours'
          WHEN 'week_before'       THEN INTERVAL '168 hours'
        END
      )
    -- 'manual', NULL, or unknown → only the explicit timestamp (handled above).
    ELSE FALSE
  END;
$$;

-- 2. Client-facing view with the address gated ────────────────────────────────
-- security_invoker = true → the caller's RLS on public.bookings still applies,
-- so a user only ever sees their own rows; the view just masks the address
-- columns on top of that.
CREATE OR REPLACE VIEW public.client_bookings
WITH (security_invoker = true) AS
SELECT
  b.id, b.user_id, b.provider_id, b.service_id, b.status,
  b.booking_date, b.booking_time, b.end_time, b.notes, b.booking_instructions,
  b.payment_type, b.base_price, b.add_ons_total, b.service_charge, b.deposit_amount,
  b.amount_paid, b.remaining_balance, b.payment_status, b.payment_method, b.payment_intent_id,
  b.is_group_booking, b.group_booking_id, b.group_booking_count,
  b.provider_name_snapshot, b.service_name_snapshot, b.service_category_snapshot, b.provider_logo_snapshot,
  CASE WHEN public.is_address_released(b.status, p.address_release_policy, b.address_released_at, b.booking_date, b.booking_time)
       THEN b.provider_address_snapshot ELSE NULL END AS provider_address_snapshot,
  b.provider_phone_snapshot,
  CASE WHEN public.is_address_released(b.status, p.address_release_policy, b.address_released_at, b.booking_date, b.booking_time)
       THEN b.provider_coordinates ELSE NULL END AS provider_coordinates,
  b.customer_name, b.customer_email, b.customer_phone,
  b.confirmed_at, b.address_released_at, b.client_address,
  b.occasion_type, b.style_request, b.reference_image_url,
  b.created_at, b.updated_at,
  -- add-ons and provider logo embedded as columns so the client needs no
  -- PostgREST relationship wiring against the view.
  (SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.id), '[]'::jsonb)
     FROM public.booking_add_ons a WHERE a.booking_id = b.id) AS add_ons,
  jsonb_build_object('logo_url', p.logo_url) AS provider
FROM public.bookings b
LEFT JOIN public.providers p ON p.id = b.provider_id;

GRANT SELECT ON public.client_bookings TO authenticated;
