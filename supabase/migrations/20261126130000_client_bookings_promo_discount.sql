-- Let the client's receipt show a promo code's discount.
--
-- Since 20261113100000 a promo code is priced at checkout and base_price is
-- stored after the discount, with the amount in bookings.promo_discount. The
-- client reads bookings through client_bookings, which never exposed that
-- column, so a receipt could only show the discounted price with no word of
-- the code. This adds promo_discount as the view's last column; nothing else
-- changes. The definition is the live one (pg_get_viewdef, read 2026-11-26).

BEGIN;

DO $$
BEGIN
  IF md5(pg_get_viewdef('public.client_bookings'::regclass, true)) IS DISTINCT FROM 'e9b6a39daed474e64594b319d77ff544' THEN
    RAISE EXCEPTION 'public.client_bookings is not the version this migration was written against';
  END IF;
END $$;

CREATE OR REPLACE VIEW public.client_bookings WITH (security_invoker = true) AS
 SELECT b.id,
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
    venue.address AS provider_address_snapshot,
    b.provider_phone_snapshot,
    venue.coordinates AS provider_coordinates,
    b.customer_name,
    b.customer_email,
    b.customer_phone,
    b.confirmed_at,
    b.address_released_at,
    ca.address AS client_address,
    b.occasion_type,
    b.style_request,
    b.reference_image_url,
    b.created_at,
    b.updated_at,
    ( SELECT COALESCE(jsonb_agg(to_jsonb(a.*) ORDER BY a.id), '[]'::jsonb) AS "coalesce"
           FROM booking_add_ons a
          WHERE a.booking_id = b.id) AS add_ons,
    jsonb_build_object('logo_url', p.logo_url) AS provider,
    p.business_type AS provider_business_type,
    b.no_show_marked_at,
    b.no_show_disputed_at,
    b.no_show_dispute_reason,
    b.no_show_counted_at,
    b.booking_ref,
    b.refunded_amount,
    b.cancelled_by,
    b.policy_retained_amount,
    venue.directions AS provider_directions_snapshot,
    b.late_reschedule_from,
    b.created_at >= late_reschedule_rule_starts_at() AS late_reschedule_rule_applies,
    b.declined_at,
    b.created_at >= refund_request_window_starts_at() AS refund_request_window_applies,
    b.promo_discount
   FROM bookings b
     LEFT JOIN providers p ON p.id = b.provider_id
     LEFT JOIN booking_client_addresses ca ON ca.booking_id = b.id
     LEFT JOIN LATERAL client_booking_venue(b.id) venue(address, directions, coordinates) ON true
  WHERE b.status <> 'on_hold'::text;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261126130000', 'client_bookings_promo_discount')
ON CONFLICT DO NOTHING;

COMMIT;
