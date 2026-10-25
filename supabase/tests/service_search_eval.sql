-- supabase/tests/service_search_eval.sql
--
-- Relevance check for search_services_ranked against the LIVE catalogue: each
-- row is something a client might type and a service they'd expect to see in
-- the top k. Read-only (SELECT only). Run it after any change to the search
-- functions, and add a row whenever a real search is found to miss:
--
--   supabase db query --linked -f supabase/tests/service_search_eval.sql
--
-- To evaluate an UNAPPLIED version of the functions, run
-- scripts/search-eval.sh instead: it loads the migration file as
-- session-only pg_temp functions first, so production is never touched.
--
-- Expectations name real live services, so a row can start failing because a
-- provider renamed or removed a service; check that before blaming the search.

WITH cases(q, expect, k) AS (VALUES
  -- plain words
  ('french tips', 'Classic French', 3),
  ('acrylics', 'Acrylic Full Set', 3),
  ('manicure', 'Classic Manicure', 3),
  ('botox', 'Anti-Wrinkle (1 area)', 3),
  ('lip filler', 'Lip Filler (1ml)', 3),
  ('knotless', 'Knotless Braids', 3),
  ('balayage', 'Miss Platinum', 3),
  ('bob', 'Classic Bob Cut', 3),
  ('blow dry', 'My ex Blowout', 3),
  ('facial', 'HydraFacial', 5),
  ('bridal makeup', 'Bridal Makeup', 1),
  ('smoky makeup', 'Smokey Makeup', 3),
  ('smokey eye', 'Smokey Makeup', 3),
  ('wig install', 'Lace Frontal 13x6', 5),
  ('nail art', '3D Nail Art (per nail)', 3),
  ('biab', 'BIAB Overlay', 1),
  ('builder gel', 'BIAB Overlay', 3),
  ('gel nails', 'BIAB Overlay', 5),
  ('lash extensions', 'Volume spikes', 3),
  ('eyelash extensions', 'Volume spikes', 3),
  ('eyelashes', 'Volume spikes', 3),
  ('pedicure', 'Hands & Feet Combo', 5),
  ('toes', 'Feet ONLY - Full set Acrylic', 3),
  ('massage', 'Facial Lymphatic Drainage Massage', 3),
  ('anti wrinkle', 'Anti-Wrinkle (1 area)', 1),
  ('wrinkles', 'Anti-Wrinkle (1 area)', 3),
  ('dermaplaning', 'Dermaplaning', 1),
  ('peach fuzz removal', 'Dermaplaning', 3),
  ('skin booster', 'Hydration Therapy', 3),
  ('fat dissolving', 'Fat Dissolving Injections', 1),
  ('pixie cut', 'Pixi Cut', 3),
  ('butterfly haircut', 'Butterfly cut', 3),
  ('layers', 'Layered', 3),
  ('highlights', 'Full Head Highlights', 1),
  ('money piece', 'Full Head Highlights', 3),
  ('red hair', 'Rich Red', 3),
  ('platinum blonde', 'Miss Platinum', 3),
  ('stiletto nails', 'Freestyle Stilettos', 3),
  ('soft glam', 'Soft Glam', 3),
  ('wedding makeup', 'Bridal Makeup', 3),
  ('makeup for my wedding', 'Bridal Makeup', 3),
  ('photoshoot makeup', 'Ms Editorial Glam', 5),
  ('boho braids', 'Boho Braids', 1),
  ('twists', 'Barrel twist', 3),
  ('mens hair', 'Barrel twist', 5),
  ('ponytail', 'Frontal Ponytail', 1),
  ('tape in extensions', 'Tap ins', 3),
  ('micro rings', 'Micro/Nano Rings', 1),
  ('glazed donut skin', 'Hydration Therapy', 3),
  ('russian lips', 'Lip Filler (1ml)', 3),
  ('mani pedi', 'Hands & Feet Combo', 5),
  ('consultation', 'Skin Consultation', 5),
  -- misspelt
  ('frsnch tip', 'Classic French', 3),
  ('acrilic', 'Acrylic Full Set', 3),
  ('manicrue', 'Classic Manicure', 3),
  ('balyage', 'Miss Platinum', 3),
  ('lahses', 'Volume spikes', 3),
  ('botxo', 'Anti-Wrinkle (1 area)', 3),
  ('bridel makeup', 'Bridal Makeup', 1),
  ('knotles braids', 'Knotless Braids', 1),
  ('dermaplanning', 'Dermaplaning', 1),
  ('filla', 'Lip Filler (1ml)', 5),
  ('lip filers', 'Lip Filler (1ml)', 3),
  ('hydrofacial', 'HydraFacial', 1),
  ('stilletos', 'Freestyle Stilettos', 3),
  ('brades', 'Knotless Braids', 3),
  ('smokie makeup', 'Smokey Makeup', 3),
  ('hilights', 'Full Head Highlights', 3),
  ('extentions', 'Tap ins', 5),
  ('pony tail', 'Frontal Ponytail', 3),
  ('blowdry', 'My ex Blowout', 3),
  ('nailart', '3D Nail Art (per nail)', 3),
  ('eye lashes', 'Volume spikes', 3),
  ('hair cut', 'Butterfly cut', 5),
  -- still typing
  ('fren', 'Classic French', 3),
  ('frenc', 'Classic French', 3),
  ('frsnc', 'Classic French', 3),
  ('balay', 'Miss Platinum', 3),
  ('derma', 'Dermaplaning', 3),
  ('acry', 'Acrylic Full Set', 3),
  ('manic', 'Classic Manicure', 3),
  ('knotl', 'Knotless Braids', 3),
  ('stil', 'Freestyle Stilettos', 3),
  ('hydra', 'HydraFacial', 3),
  -- nobody live offers these: expect NOTHING (k = 0), not a near-miss
  -- "correction" into something else
  ('brows', NULL, 0),
  ('threading', NULL, 0),
  ('spray tan', NULL, 0),
  ('waxing', NULL, 0),
  ('keratin', NULL, 0),
  ('perm', NULL, 0),
  ('tattoo', NULL, 0),
  ('xyzzy', NULL, 0)
),
results AS (
  SELECT c.q, c.expect, c.k, r.service_name, r.provider_name, r.corrected_query,
         row_number() OVER (PARTITION BY c.q ORDER BY r.rank DESC, r.service_name) AS pos
  FROM cases c
  LEFT JOIN LATERAL (SELECT * FROM search_services_ranked(c.q, NULL, '{}', 20)) r ON true
),
graded AS (
  SELECT c.q, c.expect, c.k,
         (SELECT CASE WHEN c.expect IS NULL
                      THEN CASE WHEN count(r.service_name) = 0 THEN 0 END
                      ELSE min(pos) FILTER (WHERE r.service_name = c.expect) END
          FROM results r WHERE r.q = c.q) AS found_at,
         (SELECT string_agg(r.service_name, ' | ' ORDER BY r.pos) FROM results r WHERE r.q = c.q AND r.pos <= 5) AS top5,
         (SELECT max(r.corrected_query) FROM results r WHERE r.q = c.q) AS read_as
  FROM cases c
)
SELECT
  CASE WHEN found_at <= k THEN 'pass' ELSE 'FAIL' END AS result,
  q, expect, k, found_at, read_as, top5
FROM graded
ORDER BY (found_at <= k) NULLS FIRST, q;
