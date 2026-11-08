-- A provider's private venue (street address, arrival directions, exact map
-- point) is no longer readable by the client before the provider releases it.
--
-- Until now the three fields sat on public.bookings itself:
-- provider_address_snapshot, provider_directions_snapshot and
-- provider_coordinates were stamped the moment a booking row was created, and
-- RLS policy bookings_user_read lets a client SELECT every column of their own
-- rows. client_bookings blanked the fields until is_address_released(), but
-- that view is security_invoker, so it could only hide what the client could
-- already read. Verified live 2026-11-06/08: a hand-made API call (or the
-- realtime feed on bookings) returned the full address before release, even
-- for an unpaid on_hold checkout row. Anyone could start checkout with a home
-- studio provider and read their home address without paying.
--
-- The fix moves the venue off the client's row entirely, the same way the
-- client's own address already lives in booking_client_addresses:
--
--   1. public.booking_venue_details: one row per booking. RLS lets only the
--      booking's provider read it. No client policy, not in the realtime
--      publication, no write grants (only SECURITY DEFINER code writes it).
--   2. booking_released_venue(): the venue once is_address_released() is
--      true. service_role only (the confirmation email).
--   3. client_booking_venue(): the same, for the booking's own client or
--      provider. client_bookings joins it, so the view keeps its three
--      column names and the client app reads exactly what it did before.
--   4. stamp_booking_venue_details(), AFTER INSERT on bookings, replaces
--      stamp_booking_address_snapshot(). Same sources (private address,
--      falling back to the public area text; private directions; exact
--      coordinates). Mobile bookings get no row: a mobile provider travels to
--      the client, so their saved location is their private base, never the
--      appointment's location (it used to be stamped anyway).
--   5. claim_cart_booking_slots() stops writing the address and coordinates.
--      The hold insert already fired the trigger, and the app-sent values it
--      fell back to were only ever the public area.
--   6. Existing venues are copied across, then the three columns are dropped
--      from bookings, so no read, realtime event, or future function can leak
--      them again.
--
-- Rebuilt from the live definitions (2026-11-08) with md5 guards, so this
-- refuses to apply over a newer version of any of them.

BEGIN;

DO $$
BEGIN
  IF md5(pg_get_viewdef('public.client_bookings'::regclass)) <> '46b52e14b2e6dd1c015eab6acc86b875' THEN
    RAISE EXCEPTION 'client_bookings changed live since this migration was written. Rebuild it from the live definition.';
  END IF;
  IF md5(pg_get_functiondef('public.claim_cart_booking_slots(uuid,jsonb)'::regprocedure)) <> '5feeca6164893c28008e0e5635a491ef' THEN
    RAISE EXCEPTION 'claim_cart_booking_slots changed live since this migration was written. Rebuild it from the live definition.';
  END IF;
  IF md5(pg_get_functiondef('public.stamp_booking_address_snapshot()'::regprocedure)) <> '67801162680e4e024e288c9993a21264' THEN
    RAISE EXCEPTION 'stamp_booking_address_snapshot changed live since this migration was written. Rebuild it from the live definition.';
  END IF;
END $$;

-- 1. The private venue, one row per booking ─────────────────────────────────
CREATE TABLE public.booking_venue_details (
  booking_id  uuid PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  address     text,
  directions  text CONSTRAINT booking_venue_details_directions_length
                CHECK (directions IS NULL OR char_length(directions) <= 500),
  -- { lat, lng }, the shape the app's booking mapper already reads.
  coordinates jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.booking_venue_details IS
  'Provider''s private venue for one booking (address, arrival directions, exact map point). Clients never read this table: they get it through client_bookings / client_booking_venue() once is_address_released() is true.';

ALTER TABLE public.booking_venue_details ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.booking_venue_details FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.booking_venue_details TO authenticated;

-- The provider's own venue, on their own bookings. Nothing for clients.
CREATE POLICY booking_venue_details_provider_read ON public.booking_venue_details
  FOR SELECT TO authenticated
  USING (booking_id IN (
    SELECT b.id
      FROM public.bookings b
      JOIN public.providers p ON p.id = b.provider_id
     WHERE p.user_id = auth.uid()
  ));

-- 2. Copy the venues bookings already carry ─────────────────────────────────
-- Mobile bookings are left behind on purpose: theirs is the provider's
-- private base, which was never the appointment's location.
INSERT INTO public.booking_venue_details (booking_id, address, directions, coordinates)
SELECT b.id, b.provider_address_snapshot, b.provider_directions_snapshot, b.provider_coordinates
  FROM public.bookings b
  LEFT JOIN public.providers p ON p.id = b.provider_id
 WHERE p.business_type IS DISTINCT FROM 'mobile'
   AND (b.provider_address_snapshot IS NOT NULL
        OR b.provider_directions_snapshot IS NOT NULL
        OR b.provider_coordinates IS NOT NULL);

-- 3. The venue once released ────────────────────────────────────────────────
CREATE FUNCTION public.booking_released_venue(p_booking_id uuid)
RETURNS TABLE (address text, directions text, coordinates jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT v.address, v.directions, v.coordinates
    FROM public.bookings b
    JOIN public.booking_venue_details v ON v.booking_id = b.id
    LEFT JOIN public.providers p ON p.id = b.provider_id
   WHERE b.id = p_booking_id
     AND public.is_address_released(b.status, p.address_release_policy, b.address_released_at,
                                    b.booking_date, b.booking_time);
$$;

REVOKE ALL ON FUNCTION public.booking_released_venue(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.booking_released_venue(uuid) TO service_role;

-- 4. ...and only to the booking's own client or provider ────────────────────
CREATE FUNCTION public.client_booking_venue(p_booking_id uuid)
RETURNS TABLE (address text, directions text, coordinates jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT r.address, r.directions, r.coordinates
    FROM public.booking_released_venue(p_booking_id) r
   WHERE EXISTS (
     SELECT 1
       FROM public.bookings b
       LEFT JOIN public.providers p ON p.id = b.provider_id
      WHERE b.id = p_booking_id
        AND (b.user_id = auth.uid() OR p.user_id = auth.uid())
   );
$$;

REVOKE ALL ON FUNCTION public.client_booking_venue(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_booking_venue(uuid) TO authenticated;

-- 5. client_bookings reads the venue through client_booking_venue() ─────────
-- Live definition, every column kept in order; only the three venue
-- expressions and the FROM clause change.
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
          WHERE (a.booking_id = b.id)) AS add_ons,
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
    (b.created_at >= late_reschedule_rule_starts_at()) AS late_reschedule_rule_applies
   FROM bookings b
     LEFT JOIN providers p ON p.id = b.provider_id
     LEFT JOIN booking_client_addresses ca ON ca.booking_id = b.id
     -- Released only, and only to the booking's own client or provider:
     -- see client_booking_venue().
     LEFT JOIN LATERAL public.client_booking_venue(b.id) venue ON true
  WHERE (b.status <> 'on_hold'::text);

-- 6. Stamp the venue into its own table when a booking is created ───────────
CREATE FUNCTION public.stamp_booking_venue_details()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_full_address  text;
  v_directions    text;
  v_latitude      numeric;
  v_longitude     numeric;
  v_location_text text;
  v_business_type text;
  v_address       text;
  v_coordinates   jsonb;
BEGIN
  SELECT p.location_text, p.business_type
    INTO v_location_text, v_business_type
    FROM public.providers p
   WHERE p.id = NEW.provider_id;

  -- A mobile provider travels to the client: no venue to record.
  IF v_business_type = 'mobile' THEN
    RETURN NULL;
  END IF;

  SELECT d.full_address, d.how_to_get_there, d.latitude, d.longitude
    INTO v_full_address, v_directions, v_latitude, v_longitude
    FROM public.provider_private_details d
   WHERE d.provider_id = NEW.provider_id;

  v_address := COALESCE(NULLIF(btrim(v_full_address), ''), NULLIF(btrim(v_location_text), ''));
  v_directions := NULLIF(btrim(v_directions), '');
  IF v_latitude IS NOT NULL AND v_longitude IS NOT NULL THEN
    v_coordinates := jsonb_build_object('lat', v_latitude, 'lng', v_longitude);
  END IF;

  IF v_address IS NOT NULL OR v_directions IS NOT NULL OR v_coordinates IS NOT NULL THEN
    INSERT INTO public.booking_venue_details (booking_id, address, directions, coordinates)
    VALUES (NEW.id, v_address, v_directions, v_coordinates)
    ON CONFLICT (booking_id) DO NOTHING;
  END IF;

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.stamp_booking_venue_details() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_stamp_booking_address_snapshot ON public.bookings;
CREATE TRIGGER trg_stamp_booking_venue_details
  AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.stamp_booking_venue_details();

DROP FUNCTION public.stamp_booking_address_snapshot();

-- 7. The claim stops writing the venue ──────────────────────────────────────
-- Live definition with only the private-details lookup and the two venue
-- assignments removed. CREATE OR REPLACE keeps its grants.
CREATE OR REPLACE FUNCTION public.claim_cart_booking_slots(p_hold_batch_id uuid, p_items jsonb)
 RETURNS TABLE(provider_id uuid, booking_date date, booking_time time without time zone, booking_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item JSONB;
  v_provider_id UUID;
  v_booking_date DATE;
  v_booking_time TIME;
  v_claimed_id UUID;
  v_auto_accept BOOLEAN;
  v_provider_user_id UUID;
  v_claimed_status TEXT;
  v_provider_name TEXT;
  v_service_name TEXT;
  v_customer_name TEXT;
  v_is_emergency BOOLEAN;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_provider_id := (v_item->>'provider_id')::UUID;
    v_booking_date := (v_item->>'booking_date')::DATE;
    v_booking_time := (v_item->>'booking_time')::TIME;

    SELECT COALESCE(auto_accept_bookings, FALSE), user_id INTO v_auto_accept, v_provider_user_id
      FROM public.providers WHERE id = v_provider_id;

    IF v_provider_user_id IS NOT NULL AND v_provider_user_id = auth.uid() THEN
      RAISE EXCEPTION 'You can''t book your own provider profile.';
    END IF;

    UPDATE public.bookings SET
      -- An emergency request is a deliberate ask for something the provider's
      -- own rules exclude, so it always waits for a real answer — auto-accept
      -- must never commit them to it silently. Read off the held row, not off
      -- p_items: is_emergency_request is stamped at hold time and the client
      -- payload has no authority over it.
      status = CASE WHEN v_auto_accept AND NOT COALESCE(public.bookings.is_emergency_request, FALSE)
                    THEN 'confirmed' ELSE 'pending' END,
      hold_expires_at = NULL,
      hold_batch_id = NULL,
      service_id = NULLIF(v_item->>'service_id', '')::UUID,
      end_time = (v_item->>'end_time')::TIME,
      notes = v_item->>'notes',
      booking_instructions = NULL,
      payment_type = v_item->>'payment_type',
      base_price = (v_item->>'base_price')::NUMERIC,
      add_ons_total = (v_item->>'add_ons_total')::NUMERIC,
      service_charge = (v_item->>'service_charge')::NUMERIC,
      deposit_amount = (v_item->>'deposit_amount')::NUMERIC,
      amount_paid = (v_item->>'amount_paid')::NUMERIC,
      remaining_balance = (v_item->>'remaining_balance')::NUMERIC,
      payment_status = v_item->>'payment_status',
      payment_method = v_item->>'payment_method',
      payment_intent_id = v_item->>'payment_intent_id',
      is_group_booking = COALESCE((v_item->>'is_group_booking')::BOOLEAN, FALSE),
      group_booking_id = NULLIF(v_item->>'group_booking_id', '')::UUID,
      group_booking_count = COALESCE((v_item->>'group_booking_count')::INTEGER, 1),
      provider_name_snapshot = v_item->>'provider_name_snapshot',
      service_name_snapshot = v_item->>'service_name_snapshot',
      service_category_snapshot = v_item->>'service_category_snapshot',
      provider_logo_snapshot = v_item->>'provider_logo_snapshot',
      provider_phone_snapshot = v_item->>'provider_phone_snapshot',
      customer_name = v_item->>'customer_name',
      customer_email = v_item->>'customer_email',
      customer_phone = v_item->>'customer_phone',
      client_address = v_item->>'client_address',
      confirmed_at = CASE WHEN v_auto_accept AND NOT COALESCE(public.bookings.is_emergency_request, FALSE)
                          THEN NOW() ELSE NULL END,
      policy_snapshot = v_item->'policy_snapshot'
    WHERE public.bookings.hold_batch_id = p_hold_batch_id
      AND public.bookings.provider_id = v_provider_id
      AND public.bookings.booking_date = v_booking_date
      AND public.bookings.booking_time = v_booking_time
      AND public.bookings.status = 'on_hold'
      AND public.bookings.hold_expires_at > NOW()
      AND public.bookings.user_id = auth.uid()
    RETURNING id, status, provider_name_snapshot, service_name_snapshot, customer_name,
              COALESCE(is_emergency_request, FALSE)
      INTO v_claimed_id, v_claimed_status, v_provider_name, v_service_name, v_customer_name,
           v_is_emergency;

    IF v_claimed_id IS NOT NULL THEN
      IF v_claimed_status = 'confirmed' THEN
        INSERT INTO public.notifications
          (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
        VALUES (
          auth.uid(), 'booking_confirmed', 'Booking Confirmed! 🎉',
          'Your appointment with ' || v_provider_name || ' is confirmed for ' ||
            TO_CHAR(v_booking_date, 'DD Mon YYYY') ||
            ' at ' || public.format_notification_time(v_booking_time) || '.',
          'high', TRUE, v_claimed_id, v_provider_id, 'client'
        );

        IF v_provider_user_id IS NOT NULL THEN
          INSERT INTO public.notifications
            (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
          VALUES (
            v_provider_user_id, 'booking_confirmed', 'New Booking',
            COALESCE(v_customer_name, 'A client') || ' booked ' || v_service_name ||
              ' for ' || public.format_notification_date(v_booking_date) ||
              ' at ' || public.format_notification_time(v_booking_time) ||
              '. Check their client profile for anything important.',
            'high', FALSE, v_claimed_id, v_provider_id, 'provider'
          );
        END IF;
      ELSE
        -- Same split finalize_checkout() makes: a request the provider has to
        -- answer BECAUSE it breaks their own rules should not read as an
        -- ordinary "awaiting confirmation" — on either side.
        INSERT INTO public.notifications
          (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
        VALUES (
          auth.uid(), 'booking_pending', 'Booking Request Sent',
          'Your request with ' || v_provider_name ||
            ' for ' || TO_CHAR(v_booking_date, 'DD Mon YYYY') ||
            ' at ' || public.format_notification_time(v_booking_time) ||
            CASE WHEN v_is_emergency
                 THEN ' is outside their usual availability and is awaiting their decision.'
                 ELSE ' is awaiting confirmation.' END,
          'high', TRUE, v_claimed_id, v_provider_id, 'client'
        );

        IF v_provider_user_id IS NOT NULL THEN
          INSERT INTO public.notifications
            (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
          VALUES (
            v_provider_user_id, 'booking_pending',
            CASE WHEN v_is_emergency THEN public.booking_request_title(v_claimed_id, 'Booking Request — Outside Your Hours')
                 ELSE public.booking_request_title(v_claimed_id, 'New Booking Request') END,
            COALESCE(v_customer_name, 'A client') || ' requested ' || v_service_name ||
              ' for ' || public.format_notification_date(v_booking_date) ||
              ' at ' || public.format_notification_time(v_booking_time) ||
              CASE WHEN v_is_emergency
                   THEN ', outside your usual availability. Check their client profile, then confirm or decline.' || public.booking_request_answer_note(v_claimed_id)
                   ELSE '. Check their client profile, then confirm or decline.' || public.booking_request_answer_note(v_claimed_id) END,
            'high', TRUE, v_claimed_id, v_provider_id, 'provider'
          );
        END IF;
      END IF;

      provider_id := v_provider_id;
      booking_date := v_booking_date;
      booking_time := v_booking_time;
      booking_id := v_claimed_id;
      RETURN NEXT;
      v_claimed_id := NULL;
      v_is_emergency := NULL;
    END IF;
  END LOOP;
END;
$function$;

-- 8. Nothing on bookings carries the venue any more ─────────────────────────
ALTER TABLE public.bookings
  DROP COLUMN provider_address_snapshot,
  DROP COLUMN provider_directions_snapshot,
  DROP COLUMN provider_coordinates;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261108100000', 'booking_venue_details_private')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- VERIFY
--   as a client: select provider_address_snapshot from bookings  → column does not exist
--   as a client: select * from booking_venue_details             → 0 rows
--   as a client: client_bookings shows the address only once released
--   as the provider: booking_venue_details returns their own bookings' venues
--   a new salon booking gets one booking_venue_details row; a mobile one gets none
