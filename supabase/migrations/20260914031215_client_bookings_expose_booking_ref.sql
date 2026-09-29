-- The client half of the app has been quoting the wrong booking reference.
--
-- 20260827153834 replaced five divergent app-side truncations of the primary
-- key with a real `bookings.booking_ref` column -- backfilled, UNIQUE, NOT
-- NULL, trigger-generated -- precisely so the same appointment stops being
-- "34E82C04" to the client and "34E82C04E0" to the provider.
--
-- It never added the column to `client_bookings`, and that view lists its
-- columns explicitly rather than selecting b.*. So:
--
--   * the provider reads `bookings` with select("*"), gets booking_ref, and
--     displays CRV-4B2X9K7M;
--   * the client reads this view with select("*"), gets no booking_ref at
--     all, and formatBookingRef() falls back to the old id.slice(0, 8) --
--     displaying 34E82C04.
--
-- The fallback exists for rows written before that migration. Because the
-- migration backfilled and then set NOT NULL, no such row exists, so on the
-- client side the fallback is not a rare edge case: it is what every client
-- sees, on every booking, including on the receipt HTML they keep. The exact
-- bug the reference column was introduced to kill is still live for them.
--
-- Appended at the END of the select list on purpose. CREATE OR REPLACE VIEW
-- cannot drop or reorder columns, only add them at the tail -- the same
-- constraint 20260827154500's no_show_* columns are carried through for, and
-- reordering here fails outright with 42P16.

CREATE OR REPLACE VIEW public.client_bookings
WITH (security_invoker = true)
AS
SELECT b.id, b.user_id, b.provider_id, b.service_id, b.status,
       b.booking_date, b.booking_time, b.end_time, b.notes, b.booking_instructions,
       b.payment_type, b.base_price, b.add_ons_total, b.service_charge,
       b.deposit_amount, b.amount_paid, b.remaining_balance, b.payment_status,
       b.payment_method, b.payment_intent_id,
       b.is_group_booking, b.group_booking_id, b.group_booking_count,
       b.provider_name_snapshot, b.service_name_snapshot, b.service_category_snapshot,
       b.provider_logo_snapshot,
       CASE
         WHEN is_address_released(b.status, p.address_release_policy, b.address_released_at,
                                  b.booking_date, b.booking_time)
         THEN b.provider_address_snapshot
         ELSE NULL::text
       END AS provider_address_snapshot,
       b.provider_phone_snapshot,
       CASE
         WHEN is_address_released(b.status, p.address_release_policy, b.address_released_at,
                                  b.booking_date, b.booking_time)
         THEN b.provider_coordinates
         ELSE NULL::jsonb
       END AS provider_coordinates,
       b.customer_name, b.customer_email, b.customer_phone,
       b.confirmed_at, b.address_released_at,
       -- Was b.client_address. Same name so every reader is unaffected.
       ca.address AS client_address,
       b.occasion_type, b.style_request, b.reference_image_url,
       b.created_at, b.updated_at,
       ( SELECT COALESCE(jsonb_agg(to_jsonb(a.*) ORDER BY a.id), '[]'::jsonb)
           FROM booking_add_ons a WHERE a.booking_id = b.id ) AS add_ons,
       jsonb_build_object('logo_url', p.logo_url) AS provider,
       p.business_type AS provider_business_type,
       -- Appended by 20260827154500_no_show_disputes, which landed on this
       -- view before 20260827161000 ran. CREATE OR REPLACE VIEW cannot drop a
       -- column, so these must be carried through in their existing positions
       -- or the replace fails outright with 42P16.
       b.no_show_marked_at,
       b.no_show_disputed_at,
       b.no_show_dispute_reason,
       b.no_show_counted_at,
       -- The fix. Safe to expose: the reference is already shown to this
       -- client on their own booking detail screen and receipt, and the view
       -- is already scoped to their own rows.
       b.booking_ref
  FROM bookings b
  LEFT JOIN providers p ON p.id = b.provider_id
  LEFT JOIN public.booking_client_addresses ca ON ca.booking_id = b.id
 WHERE b.status <> 'on_hold'::text;
