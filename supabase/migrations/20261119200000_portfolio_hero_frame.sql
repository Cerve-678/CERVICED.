-- How a portfolio photo sits in a page style's hero.
--
-- Branding → Your Photos lets the provider move and zoom each photo their hero
-- shows (Editorial, Snapshot, Hush, Bow, Posy, Retreat, Portfolio, Pinboard).
-- The frame lives on the photo, not the style, so one framing serves every
-- style: x and y are fractions of how far the photo can move in that slot
-- (-1 to 1, 0 centred), zoom is 1 (just covers the slot) to 3. NULL means
-- centred and unzoomed, which is how every hero drew before this.
--
-- Additive and nullable: app builds already on phones never read or write it.
-- Writes go through the existing RLS policy portfolio_owner_all (the
-- provider's own rows only); clients read it under portfolio_public_read,
-- like every other column of a live provider's portfolio.

BEGIN;

ALTER TABLE public.portfolio_items
  ADD COLUMN IF NOT EXISTS hero_frame jsonb;

ALTER TABLE public.portfolio_items
  DROP CONSTRAINT IF EXISTS portfolio_items_hero_frame_check;

ALTER TABLE public.portfolio_items
  ADD CONSTRAINT portfolio_items_hero_frame_check CHECK (
    hero_frame IS NULL OR (
      jsonb_typeof(hero_frame) = 'object'
      AND jsonb_typeof(hero_frame -> 'zoom') = 'number'
      AND jsonb_typeof(hero_frame -> 'x') = 'number'
      AND jsonb_typeof(hero_frame -> 'y') = 'number'
      AND (hero_frame ->> 'zoom')::numeric BETWEEN 1 AND 3
      AND (hero_frame ->> 'x')::numeric BETWEEN -1 AND 1
      AND (hero_frame ->> 'y')::numeric BETWEEN -1 AND 1
      -- Nothing but those three keys.
      AND (hero_frame - 'zoom' - 'x' - 'y') = '{}'::jsonb
    )
  );

COMMENT ON COLUMN public.portfolio_items.hero_frame IS
  'How this photo sits in a page style hero: {zoom 1..3, x -1..1, y -1..1}. NULL = centred, unzoomed.';

COMMIT;
