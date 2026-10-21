-- Beauty Maintenance, stage 1 of Concept A ("Picked for you" + "Add your own").
--
-- 1. Five new service types: pedicure, lash lift, brow lamination, brow tint,
--    and waxing. Waxing is filed under AESTHETICS because providers have no
--    waxing category (OTHER is retired); a future BODY category would move it.
-- 2. maintenance_items.note: the client's private "note to self". Owner-only
--    like the rest of the table; never shown to a provider.
-- 3. Clients may now set last_done_on when they add an item, so a repeating
--    reminder counts from their last visit instead of from today.
--
-- Depends on 20261018180000_beauty_maintenance.sql. Safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Service types — the WHOLE table, restated in order.
-- ─────────────────────────────────────────────────────────────────────────────
-- The completion trigger takes the first type in a category whose keyword is
-- in the booked service's name, ordered by sort_order. New types that must win
-- a tie sit ahead of the old ones ("Gel pedicure" → pedicure, "Facial wax" →
-- waxing), so existing rows are renumbered too. Same order as
-- MAINTENANCE_SERVICE_TYPES in src/constants/maintenanceServiceTypes.ts
-- (parity-tested against this file).

INSERT INTO public.maintenance_service_types (key, search_category, default_weeks, keywords, sort_order) VALUES
  ('relaxer_touch_up',  'HAIR',       8,  ARRAY['relax']::text[], 1),
  ('root_colour',       'HAIR',       6,  ARRAY['root', 'colour', 'color', 'highlight', 'balayage']::text[], 2),
  ('silk_press',        'HAIR',       2,  ARRAY['silk press']::text[], 3),
  ('wash_and_go',       'HAIR',       2,  ARRAY['wash & go', 'wash and go', 'wash n go']::text[], 4),
  ('deep_conditioning', 'HAIR',       4,  ARRAY['deep condition', 'conditioning']::text[], 5),
  ('loc_retwist',       'HAIR',       6,  ARRAY['retwist', 'loc maintenance']::text[], 6),
  ('trim',              'HAIR',       12, ARRAY['trim', 'cut']::text[], 7),
  ('hair_general',      'HAIR',       6,  ARRAY[]::text[], 8),
  ('pedicure',          'NAILS',      6,  ARRAY['pedi']::text[], 9),
  ('gel_nails',         'NAILS',      3,  ARRAY['gel', 'biab', 'builder']::text[], 10),
  ('acrylic_infill',    'NAILS',      3,  ARRAY['acrylic', 'infill', 'full set']::text[], 11),
  ('nails_general',     'NAILS',      3,  ARRAY[]::text[], 12),
  ('lash_infill',       'LASHES',     3,  ARRAY['infill', 'fill']::text[], 13),
  ('lash_lift',         'LASHES',     6,  ARRAY['lift']::text[], 14),
  ('lashes_general',    'LASHES',     3,  ARRAY[]::text[], 15),
  ('brow_lamination',   'BROWS',      6,  ARRAY['lamin']::text[], 16),
  ('brow_tint',         'BROWS',      4,  ARRAY['tint']::text[], 17),
  ('brows_general',     'BROWS',      4,  ARRAY[]::text[], 18),
  ('waxing',            'AESTHETICS', 4,  ARRAY['wax']::text[], 19),
  ('facial',            'AESTHETICS', 6,  ARRAY['facial', 'dermaplan']::text[], 20)
ON CONFLICT (key) DO UPDATE SET
  search_category = EXCLUDED.search_category,
  default_weeks   = EXCLUDED.default_weeks,
  keywords        = EXCLUDED.keywords,
  sort_order      = EXCLUDED.sort_order;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Note to self
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.maintenance_items
  ADD COLUMN IF NOT EXISTS note text;

ALTER TABLE public.maintenance_items
  DROP CONSTRAINT IF EXISTS maintenance_items_note_length;
ALTER TABLE public.maintenance_items
  ADD CONSTRAINT maintenance_items_note_length CHECK (note IS NULL OR char_length(note) <= 200);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Column grants
-- ─────────────────────────────────────────────────────────────────────────────
-- Additive to the grants in 20261018180000: origin, source booking and the
-- push counters stay server-owned.

GRANT INSERT (last_done_on, note) ON public.maintenance_items TO authenticated;
GRANT UPDATE (note) ON public.maintenance_items TO authenticated;
