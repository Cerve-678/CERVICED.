-- client_bookings: expose the provider's business_type
--
-- Whose address is the appointment's location depends entirely on whether the
-- provider travels: a mobile provider comes to the CLIENT, so the venue is the
-- client's own address and the provider's location is a private base that is
-- never the destination. Every other business type is the reverse.
--
-- The app had no way to ask that question of a booking, so client screens
-- inferred it from `client_address IS NOT NULL` instead. That inference was
-- wrong in both directions:
--   * checkout stamped the client's saved default address onto EVERY booking
--     in the cart, so a salon booking looked mobile and rendered the client's
--     own home address as its location, hiding the salon's released address;
--   * a mobile booking with no client address yet looked like a salon booking
--     awaiting address release, and showed a countdown to an address that is
--     never going to be sent.
--
-- The checkout side is fixed in the app (BookingContext.createBookingsFromCart).
-- This exposes the real answer so existing rows render correctly too, rather
-- than needing their snapshots rewritten.
--
-- Read live off the joined providers row, not snapshotted: business_type is
-- locked after a provider's first save (InfoRegScreen / BusinessInfoScreen),
-- so it cannot drift out from under a booking. It is not private — clients
-- already read it directly off `providers` (getProviderAddressPolicy) and it
-- is shown on Search and Home.
--
-- Additive only: the column is appended, so CREATE OR REPLACE keeps the view's
-- grants and its security_invoker setting. Safe to re-run.

CREATE OR REPLACE VIEW public.client_bookings
WITH (security_invoker = true)
AS
SELECT
  b.id,
  b.user_id,
  b.provider_id,
  b.service_id,
  b.status,
  b.booking_date,
  b.booking_time,
  b.end_time,
  b.notes,
  b.booking_instructions,
  b.payment_type,
  b.base_price,
  b.add_ons_total,
  b.service_charge,
  b.deposit_amount,
  b.amount_paid,
  b.remaining_balance,
  b.payment_status,
  b.payment_method,
  b.payment_intent_id,
  b.is_group_booking,
  b.group_booking_id,
  b.group_booking_count,
  b.provider_name_snapshot,
  b.service_name_snapshot,
  b.service_category_snapshot,
  b.provider_logo_snapshot,
  CASE
    WHEN is_address_released(b.status, p.address_release_policy, b.address_released_at, b.booking_date, b.booking_time)
      THEN b.provider_address_snapshot
    ELSE NULL::text
  END AS provider_address_snapshot,
  b.provider_phone_snapshot,
  CASE
    WHEN is_address_released(b.status, p.address_release_policy, b.address_released_at, b.booking_date, b.booking_time)
      THEN b.provider_coordinates
    ELSE NULL::jsonb
  END AS provider_coordinates,
  b.customer_name,
  b.customer_email,
  b.customer_phone,
  b.confirmed_at,
  b.address_released_at,
  b.client_address,
  b.occasion_type,
  b.style_request,
  b.reference_image_url,
  b.created_at,
  b.updated_at,
  ( SELECT COALESCE(jsonb_agg(to_jsonb(a.*) ORDER BY a.id), '[]'::jsonb)
      FROM booking_add_ons a
     WHERE a.booking_id = b.id ) AS add_ons,
  jsonb_build_object('logo_url', p.logo_url) AS provider,
  -- Appended last: CREATE OR REPLACE cannot reorder or rename existing columns.
  p.business_type AS provider_business_type
FROM bookings b
LEFT JOIN providers p ON p.id = b.provider_id
WHERE b.status <> 'on_hold'::text;

-- Data cleanup, applied live 2026-08-23 alongside the view above.
--
-- Seven bookings had been stamped with the client's home address by the
-- cart-wide write this change removes: five from one 2026-08-20 checkout
-- across three providers, none of them mobile. The view change alone already
-- makes them display correctly (business_type, not client_address, now decides
-- whose address is the venue) — this is data minimisation: a client's home
-- address has no business sitting on a booking with a provider who never
-- travels to them.
UPDATE bookings b
SET client_address = NULL
FROM providers p
WHERE p.id = b.provider_id
  AND b.client_address IS NOT NULL
  AND p.business_type IS DISTINCT FROM 'mobile';
