-- A client's home address is not visible until the provider accepts.
--
-- THE ASYMMETRY THIS CLOSES
--
-- A provider working from a salon, studio or home has their street address
-- protected by a whole policy engine: address_release_policy has eight
-- settings, is_address_released() enforces them, and the client_bookings view
-- hands the client a NULL until the policy unlocks. The app is explicitly not
-- the enforcement point -- the database is.
--
-- The client's own address had none of that. For a mobile provider the
-- appointment happens at the client's home, so CartScreen makes the address
-- mandatory at checkout and it lands on bookings.client_address the moment the
-- request is created. Providers read `bookings` directly, so it was legible
-- immediately: before accepting, and still after declining. A provider could
-- collect ten requests, decline all ten, and keep ten home addresses.
--
-- WHY A SEPARATE TABLE RATHER THAN A MASKED COLUMN
--
-- RLS is row-level. It decides which ROWS you may read, never which columns of
-- a row you may read. Clients are already insulated because they read the
-- client_bookings view rather than the table -- but providers read `bookings`
-- itself (getProviderBookings does select("*")), and no row-level rule can
-- hand them the booking while withholding one field of it.
--
-- Giving providers a view of their own would work, but only if their direct
-- table access were also removed -- otherwise the view is a politeness, not a
-- boundary. That means rewriting every provider read path in the app, which is
-- core plumbing and a far larger blast radius than this needs.
--
-- Moving the address to its own row makes row-level the right granularity:
-- "may this provider read THIS address row" is now exactly the question RLS
-- was built to answer, and it is answered by the database for every caller,
-- through any client, forever.
--
-- WHY WRITERS ARE NOT TOUCHED
--
-- The address is written from three places: claim_cart_booking_slots() during
-- checkout, a plain insert when no hold was claimed, and
-- set_booking_client_address() when the client sends it through Messages.
-- Rewriting all three multiplies the chance one is missed, and a missed writer
-- fails silently -- the provider simply never receives an address, on the day.
--
-- So they all keep writing bookings.client_address exactly as they do now, and
-- a trigger relocates the value and blanks the column. There is one path into
-- the protected table and it cannot be bypassed by a writer nobody updated.
-- The column stays in the schema, permanently NULL, as the funnel.
--
-- AUTO-ACCEPT PROVIDERS ARE UNAFFECTED, for free. A booking made under
-- auto_accept is created already 'confirmed' (BookingContext: auto_accept ?
-- UPCOMING : PENDING, and UPCOMING is 'confirmed' in the DB), so the release
-- test below passes on the first read and that provider never perceives a
-- gate. No special case is needed, and none is written.
--
-- Safe to re-run.

-- ── 1. The protected row ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.booking_client_addresses (
  booking_id UUID PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  address    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.booking_client_addresses IS
  'Where a mobile appointment happens: the CLIENT''s address, not the '
  'provider''s. Separate from bookings so RLS can gate it per row -- the '
  'provider may not read it until they have accepted the booking.';

ALTER TABLE public.booking_client_addresses ENABLE ROW LEVEL SECURITY;

-- The client owns it outright. It is their address; there is no state in which
-- they should be unable to see or change what they gave.
DROP POLICY IF EXISTS bca_client_all ON public.booking_client_addresses;
CREATE POLICY bca_client_all ON public.booking_client_addresses
  FOR ALL
  USING (
    booking_id IN (SELECT id FROM public.bookings WHERE user_id = auth.uid())
  )
  WITH CHECK (
    booking_id IN (SELECT id FROM public.bookings WHERE user_id = auth.uid())
  );

-- The provider may READ it, and only once they have accepted. Never write:
-- the client's own address is not the provider's to edit.
--
-- 'in_progress' and 'completed' are included because a booking that has
-- started or finished was necessarily accepted, and a provider still needs the
-- address while they are there and afterwards for their own records. Anything
-- that never reached acceptance -- pending, cancelled, no_show -- reads NULL.
DROP POLICY IF EXISTS bca_provider_read_after_accept ON public.booking_client_addresses;
CREATE POLICY bca_provider_read_after_accept ON public.booking_client_addresses
  FOR SELECT
  USING (
    booking_id IN (
      SELECT b.id
        FROM public.bookings b
        JOIN public.providers p ON p.id = b.provider_id
       WHERE p.user_id = auth.uid()
         AND b.status IN ('confirmed', 'in_progress', 'completed')
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.booking_client_addresses TO authenticated;
REVOKE ALL ON public.booking_client_addresses FROM anon;

-- ── 2. The funnel ───────────────────────────────────────────────────────────
--
-- AFTER, not BEFORE. On INSERT the booking row does not exist yet when a
-- BEFORE trigger runs, so the foreign key above would reject the address row.
-- Being AFTER means the column cannot be blanked by assigning to NEW, so the
-- blanking is a second UPDATE -- which would re-fire this trigger, except the
-- WHEN clause only fires on a NON-NULL value and that UPDATE writes NULL.

CREATE OR REPLACE FUNCTION public.relocate_booking_client_address()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.booking_client_addresses (booking_id, address)
  VALUES (NEW.id, NEW.client_address)
  ON CONFLICT (booking_id) DO UPDATE
    SET address = EXCLUDED.address, updated_at = NOW();

  UPDATE public.bookings SET client_address = NULL WHERE id = NEW.id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS on_booking_client_address_written ON public.bookings;
CREATE TRIGGER on_booking_client_address_written
  AFTER INSERT OR UPDATE OF client_address ON public.bookings
  FOR EACH ROW
  WHEN (NEW.client_address IS NOT NULL)
  EXECUTE FUNCTION public.relocate_booking_client_address();

REVOKE ALL ON FUNCTION public.relocate_booking_client_address() FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN public.bookings.client_address IS
  'WRITE-ONLY FUNNEL, always NULL at rest. Writers still target this column; '
  'on_booking_client_address_written relocates the value into '
  'booking_client_addresses (RLS-gated) and blanks it. Never read this column '
  '-- it has no data. See migration 20260827130000.';

-- ── 3. Move what is already there ───────────────────────────────────────────

INSERT INTO public.booking_client_addresses (booking_id, address)
SELECT id, btrim(client_address)
  FROM public.bookings
 WHERE client_address IS NOT NULL
   AND btrim(client_address) <> ''
ON CONFLICT (booking_id) DO NOTHING;

UPDATE public.bookings SET client_address = NULL WHERE client_address IS NOT NULL;

-- ── 4. The client keeps seeing their own ────────────────────────────────────
--
-- client_bookings is how the client reads their bookings at all, so the column
-- has to keep appearing there or their own address vanishes from their own
-- booking. Sourced from the protected table now; the base column is NULL.
--
-- Column list and ordering are otherwise identical to 20260823174842. The
-- provider-address masking, the on_hold exclusion and provider_business_type
-- are all carried through unchanged.

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
       p.business_type AS provider_business_type
  FROM bookings b
  LEFT JOIN providers p ON p.id = b.provider_id
  LEFT JOIN public.booking_client_addresses ca ON ca.booking_id = b.id
 WHERE b.status <> 'on_hold'::text;

GRANT SELECT ON public.client_bookings TO authenticated;
