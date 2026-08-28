-- The client picks their area, instead of the database guessing it.
--
-- 20260827161000 introduced bookings.client_area so a mobile provider can
-- judge travel distance BEFORE accepting, while the street address stays
-- gated until they do. It derived that area from the address with
-- coarse_area_from_address(), which reads the UK outward code and returns
-- NULL rather than guessing when there is no postcode to read.
--
-- That derivation is correct and stays. The problem is what it has to work
-- with: checkout only requires the address to be non-empty -- nothing asks for
-- a postcode -- so of the five addresses live when this was written, FOUR
-- contained no postcode at all and produced a NULL area. The feature's whole
-- purpose silently did not hold for most bookings.
--
-- So the area becomes something the client states, not something inferred:
-- Account > Your Address now has its own area picker (AreaPicker.tsx), built
-- on the same CITY_AREAS data the provider's own location picker uses, so both
-- hats' coarse locations read identically.
--
-- TWO SHAPES, ONE COLUMN, DELIBERATELY. bookings.client_area now holds either
-- an outward postcode district ("SE15", derived) or a named area
-- ("Camden, London", chosen). Both answer the only question the column exists
-- to answer -- roughly where is this -- and a provider reads either one the
-- same way. Splitting them into two columns would mean every reader handling
-- "the other kind", which is how a field ends up displayed in one place and
-- forgotten in three.
--
-- Safe to re-run.

-- --------------------------------------------------------------------------
-- 1. Where the client's choice lives
-- --------------------------------------------------------------------------
-- On `users`, beside client_address, because it is account-level: the client
-- states it once and every future booking inherits it, exactly as the saved
-- address already works.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS client_area TEXT;

COMMENT ON COLUMN public.users.client_area IS
  'The coarse area a client says they are in ("Camden, London"), chosen in '
  'Account > Your Address. Stamped onto bookings.client_area at checkout so a '
  'mobile provider can judge travel before accepting. Not derived from '
  'client_address -- most addresses people type carry no postcode to derive '
  'from. See migration 20260827162000.';

-- --------------------------------------------------------------------------
-- 2. A chosen area must not be overwritten by a derived one
-- --------------------------------------------------------------------------
-- relocate_booking_client_address() fires AFTER INSERT/UPDATE OF
-- client_address and rewrites client_area unconditionally. Once checkout
-- starts stamping the client's own choice onto the row, that unconditional
-- write would clobber it with a NULL on every address that has no postcode --
-- which is precisely the majority case this migration exists to fix.
--
-- COALESCE, so the client's stated area wins and the derivation stays as the
-- fallback for any booking that carries no chosen area.
--
-- Reproduced from the live definition (pg_get_functiondef, 2026-08-27) with
-- that one clause changed. LANGUAGE, SECURITY DEFINER and the two-element
-- search_path are carried through verbatim -- a faithful-looking reproduction
-- that quietly drops a security attribute is a known failure mode in this
-- repo, not a hypothetical one.

CREATE OR REPLACE FUNCTION public.relocate_booking_client_address()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.booking_client_addresses (booking_id, address)
  VALUES (NEW.id, NEW.client_address)
  ON CONFLICT (booking_id) DO UPDATE
    SET address = EXCLUDED.address, updated_at = NOW();

  -- Both in one statement: the coarse half is written as the full half is
  -- taken away, so there is no instant where the provider can see neither.
  --
  -- COALESCE and not a plain assignment: NEW.client_area is whatever the
  -- inserting statement already put on the row -- the client's own choice,
  -- when checkout supplied one. Deriving over the top of it would replace a
  -- stated fact with an inferred one, and usually with NULL.
  UPDATE public.bookings
     SET client_address = NULL,
         client_area = COALESCE(
           NULLIF(btrim(NEW.client_area), ''),
           public.coarse_area_from_address(NEW.client_address)
         )
   WHERE id = NEW.id;

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.relocate_booking_client_address() FROM PUBLIC, anon, authenticated;

-- --------------------------------------------------------------------------
-- 3. Say what the column actually holds now
-- --------------------------------------------------------------------------

COMMENT ON COLUMN public.bookings.client_area IS
  'Coarse area of the client, readable by the provider from the moment the '
  'request arrives so they can judge travel distance before accepting. Two '
  'shapes on purpose: a named area the client chose ("Camden, London"), or a '
  'UK outward postcode district derived from their address ("SE15") when they '
  'chose none. The full address is in booking_client_addresses and is gated '
  'until the provider accepts. See migrations 20260827161000, 20260827162000.';
