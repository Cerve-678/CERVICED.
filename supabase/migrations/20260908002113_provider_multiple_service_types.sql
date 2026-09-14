-- Provider service types: one provider, several of them.
--
-- Until now a provider had exactly ONE macro service type
-- (providers.service_category), so a business doing lashes AND brows could
-- list both on their profile but only ever appeared under one of them in a
-- category filter, and their profile headline named only one. Their own
-- free-text groupings (services.category_name) sit BELOW the macro type and
-- are unchanged by this — they stay the provider's own vocabulary.
--
-- Two columns carry it:
--   providers.service_categories — the declared set, locked at sign-up
--   services.service_category    — which of those set members one service is
--
-- Both are backfilled so every existing row keeps exactly the behaviour it
-- has today: a provider's set becomes their single current type, and every
-- service they've already written is stamped with it. A provider with one
-- type shows no service-type switch in the app, so nothing they see changes.

-- ── 1. The declared set on the provider ────────────────────────────────────

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS service_categories text[] NOT NULL DEFAULT '{}';

-- Backfill before the CHECK below, which requires a non-empty set.
UPDATE providers
   SET service_categories = ARRAY[service_category]
 WHERE cardinality(service_categories) = 0
   AND service_category IS NOT NULL;

-- Same vocabulary as providers_service_category_check, applied per element.
-- Non-empty is enforced too: an empty set would render a provider with no
-- bookable type at all, which no screen has a sensible way to show.
ALTER TABLE providers
  DROP CONSTRAINT IF EXISTS providers_service_categories_check;
ALTER TABLE providers
  ADD CONSTRAINT providers_service_categories_check CHECK (
    cardinality(service_categories) > 0
    AND service_categories <@ ARRAY[
      'HAIR','NAILS','LASHES','BROWS','MUA','AESTHETICS','MALE','KIDS','OTHER'
    ]::text[]
  ) NOT VALID;

-- NOT VALID above, validated separately: an unclaimed/scraped provider row
-- predating service_category could still hold an empty set, and a failed
-- table-wide validation would abort the whole migration rather than tell us
-- which row is wrong. Validate explicitly so a genuine offender surfaces as
-- its own error.
ALTER TABLE providers VALIDATE CONSTRAINT providers_service_categories_check;

-- Filters ask "does this provider offer BROWS?" — an overlap/containment
-- test over the array, which needs GIN to avoid a seq scan on browse.
CREATE INDEX IF NOT EXISTS providers_service_categories_gin
  ON providers USING GIN (service_categories);

-- ── 2. Which type a single service belongs to ──────────────────────────────

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS service_category text;

UPDATE services s
   SET service_category = p.service_category
  FROM providers p
 WHERE p.id = s.provider_id
   AND s.service_category IS NULL;

ALTER TABLE services
  DROP CONSTRAINT IF EXISTS services_service_category_check;
ALTER TABLE services
  ADD CONSTRAINT services_service_category_check CHECK (
    service_category IS NULL
    OR service_category = ANY (ARRAY[
      'HAIR','NAILS','LASHES','BROWS','MUA','AESTHETICS','MALE','KIDS','OTHER'
    ])
  );

-- Deliberately nullable rather than NOT NULL. A stale app build that predates
-- this column is a caller no app-side fix reaches (the same lesson as the
-- 'Health info:' note prefix), so an insert that omits it must not fail — the
-- trigger below fills it instead.
CREATE INDEX IF NOT EXISTS services_service_category_idx
  ON services (provider_id, service_category)
  WHERE is_active;

-- ── 3. Keep the three columns consistent without trusting every writer ─────

-- providers.service_category is KEPT as the primary/headline type so that
-- every existing reader (filters, snapshots, portfolio stamping) keeps
-- working untouched. It is defined as the first entry of the set; this
-- trigger makes that true by construction rather than by convention, in both
-- directions, so a writer that knows about only one of the two columns can
-- never desync them.
CREATE OR REPLACE FUNCTION sync_provider_service_categories()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF cardinality(COALESCE(NEW.service_categories, '{}')) = 0 THEN
    -- Writer set only the single column (or neither): derive the set from it.
    IF NEW.service_category IS NOT NULL THEN
      NEW.service_categories := ARRAY[NEW.service_category];
    END IF;
  ELSIF NEW.service_category IS DISTINCT FROM NEW.service_categories[1] THEN
    -- Writer changed the set: the headline follows its first entry. When the
    -- headline itself was the only thing changed and it still appears in the
    -- set, promote it to the front instead of overwriting the caller.
    IF NEW.service_category IS NOT NULL
       AND NEW.service_category <> COALESCE(OLD.service_category, '')
       AND NEW.service_category = ANY (NEW.service_categories) THEN
      NEW.service_categories :=
        ARRAY[NEW.service_category]
        || array_remove(NEW.service_categories, NEW.service_category);
    ELSE
      NEW.service_category := NEW.service_categories[1];
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_provider_service_categories ON providers;
CREATE TRIGGER trg_sync_provider_service_categories
  BEFORE INSERT OR UPDATE OF service_category, service_categories ON providers
  FOR EACH ROW EXECUTE FUNCTION sync_provider_service_categories();

-- A service with no type stated belongs to its provider's headline type —
-- which is exactly what every service meant before this migration existed.
-- This is what makes the column safe to leave nullable for stale callers.
CREATE OR REPLACE FUNCTION default_service_category_from_provider()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.service_category IS NULL THEN
    SELECT p.service_category INTO NEW.service_category
      FROM providers p
     WHERE p.id = NEW.provider_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_default_service_category ON services;
CREATE TRIGGER trg_default_service_category
  BEFORE INSERT ON services
  FOR EACH ROW EXECUTE FUNCTION default_service_category_from_provider();

COMMENT ON COLUMN providers.service_categories IS
  'Every macro service type this provider offers, locked at sign-up. First entry mirrors service_category (the headline/primary), kept in sync by trg_sync_provider_service_categories. Category filters match ANY entry.';

COMMENT ON COLUMN services.service_category IS
  'Which of the provider''s service_categories this service belongs to. Sits ABOVE the provider''s own free-text category_name grouping. NULL only transiently — trg_default_service_category stamps the provider headline for callers that omit it.';
