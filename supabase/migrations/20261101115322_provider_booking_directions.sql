-- Private provider arrival instructions. They are intentionally kept alongside
-- the full address, never on providers (which clients can browse).
ALTER TABLE public.provider_private_details
  ADD COLUMN IF NOT EXISTS how_to_get_there text;

ALTER TABLE public.provider_private_details
  DROP CONSTRAINT IF EXISTS provider_private_details_how_to_get_there_length;
ALTER TABLE public.provider_private_details
  ADD CONSTRAINT provider_private_details_how_to_get_there_length
  CHECK (how_to_get_there IS NULL OR char_length(how_to_get_there) <= 500);

-- Snapshot instructions so a provider changing their arrival details later
-- does not alter the confirmation for an already-booked appointment.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS provider_directions_snapshot text;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_provider_directions_snapshot_length;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_provider_directions_snapshot_length
  CHECK (provider_directions_snapshot IS NULL OR char_length(provider_directions_snapshot) <= 500);

-- This trigger already snapshots the private venue address. Extend that same
-- controlled path; clients never read provider_private_details directly.
CREATE OR REPLACE FUNCTION public.stamp_booking_address_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_full_address text;
  v_location_text text;
  v_directions text;
BEGIN
  SELECT d.full_address, d.how_to_get_there
    INTO v_full_address, v_directions
  FROM public.provider_private_details d
  WHERE d.provider_id = NEW.provider_id;

  SELECT p.location_text INTO v_location_text
  FROM public.providers p
  WHERE p.id = NEW.provider_id;

  NEW.provider_address_snapshot := COALESCE(
    NULLIF(btrim(v_full_address), ''),
    NULLIF(btrim(v_location_text), ''),
    NEW.provider_address_snapshot
  );
  NEW.provider_directions_snapshot := COALESCE(
    NULLIF(btrim(v_directions), ''),
    NEW.provider_directions_snapshot
  );
  RETURN NEW;
END;
$$;

-- Preserve client_bookings as a security-invoker view. Directions use the
-- exact address-release predicate, so they cannot leak before the venue does.
CREATE OR REPLACE VIEW public.client_bookings WITH (security_invoker = true) AS
SELECT b.id, b.user_id, b.provider_id, b.service_id, b.status,
  b.booking_date, b.booking_time, b.end_time, b.notes, b.booking_instructions,
  b.payment_type, b.base_price, b.add_ons_total, b.service_charge,
  b.deposit_amount, b.amount_paid, b.remaining_balance, b.payment_status,
  b.payment_method, b.payment_intent_id, b.is_group_booking, b.group_booking_id,
  b.group_booking_count, b.provider_name_snapshot, b.service_name_snapshot,
  b.service_category_snapshot, b.provider_logo_snapshot,
  CASE WHEN is_address_released(b.status, p.address_release_policy, b.address_released_at, b.booking_date, b.booking_time)
    THEN b.provider_address_snapshot ELSE NULL::text END AS provider_address_snapshot,
  b.provider_phone_snapshot,
  CASE WHEN is_address_released(b.status, p.address_release_policy, b.address_released_at, b.booking_date, b.booking_time)
    THEN b.provider_coordinates ELSE NULL::jsonb END AS provider_coordinates,
  b.customer_name, b.customer_email, b.customer_phone, b.confirmed_at,
  b.address_released_at, ca.address AS client_address, b.occasion_type,
  b.style_request, b.reference_image_url, b.created_at, b.updated_at,
  (SELECT COALESCE(jsonb_agg(to_jsonb(a.*) ORDER BY a.id), '[]'::jsonb)
    FROM public.booking_add_ons a WHERE a.booking_id = b.id) AS add_ons,
  jsonb_build_object('logo_url', p.logo_url) AS provider,
  p.business_type AS provider_business_type, b.no_show_marked_at,
  b.no_show_disputed_at, b.no_show_dispute_reason, b.no_show_counted_at,
  b.booking_ref, b.refunded_amount, b.cancelled_by, b.policy_retained_amount,
  CASE WHEN is_address_released(b.status, p.address_release_policy, b.address_released_at, b.booking_date, b.booking_time)
    THEN b.provider_directions_snapshot ELSE NULL::text END AS provider_directions_snapshot
FROM public.bookings b
LEFT JOIN public.providers p ON p.id = b.provider_id
LEFT JOIN public.booking_client_addresses ca ON ca.booking_id = b.id
WHERE b.status <> 'on_hold'::text;
