# FUTURE SCALE — Planned & Pending Improvements

This file tracks features that are architecturally planned but not yet live.
Update it as work is completed or priorities shift.

---

## SEARCH ANALYTICS — Live at launch

Every client search is logged to the `search_events` table in Supabase.
Run these queries in the Supabase SQL Editor to pull insights.

**Supabase table to create (run once):**
```sql
CREATE TABLE IF NOT EXISTS search_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  query text NOT NULL,
  category_filter text,
  results_count integer,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX search_events_query_idx ON search_events (query);
CREATE INDEX search_events_created_idx ON search_events (created_at DESC);
ALTER TABLE search_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users can log their own searches"
  ON search_events FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "anon can log searches"
  ON search_events FOR INSERT TO anon
  WITH CHECK (user_id IS NULL);
```

**What to search for clients want the most (run weekly):**
```sql
SELECT query, COUNT(*) as search_count
FROM search_events
WHERE created_at > now() - interval '30 days'
GROUP BY query
ORDER BY search_count DESC
LIMIT 50;
```

**Zero-result searches — what clients want that no provider offers (most valuable):**
```sql
SELECT query, COUNT(*) as times_searched
FROM search_events
WHERE results_count = 0
  AND created_at > now() - interval '30 days'
GROUP BY query
ORDER BY times_searched DESC
LIMIT 30;
```

**Most searched by category:**
```sql
SELECT category_filter, query, COUNT(*) as count
FROM search_events
WHERE category_filter IS NOT NULL
  AND created_at > now() - interval '30 days'
GROUP BY category_filter, query
ORDER BY category_filter, count DESC;
```

**Search volume over time (are searches growing?):**
```sql
SELECT date_trunc('day', created_at) as day, COUNT(*) as searches
FROM search_events
GROUP BY day
ORDER BY day DESC
LIMIT 30;
```

---

## SEARCH & DISCOVERY ALGORITHM

### Status: Schema built, population pending

The full tag infrastructure was designed and implemented in the frontend and database types.
The Supabase migrations below must be run before any tag data flows through.

---

### Phase 1 — Supabase Migrations (MUST RUN BEFORE TAGS WORK)

Run these SQL blocks in order in the Supabase SQL Editor.

**Block 1 — Tag columns on `services`**
```sql
ALTER TABLE services ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
ALTER TABLE services ADD COLUMN IF NOT EXISTS technique_tags text[] DEFAULT '{}';
ALTER TABLE services ADD COLUMN IF NOT EXISTS outcome_tags text[] DEFAULT '{}';
ALTER TABLE services ADD COLUMN IF NOT EXISTS occasion_tags text[] DEFAULT '{}';
ALTER TABLE services ADD COLUMN IF NOT EXISTS trend_names text[] DEFAULT '{}';
ALTER TABLE services ADD COLUMN IF NOT EXISTS is_pregnancy_safe boolean DEFAULT false;
ALTER TABLE services ADD COLUMN IF NOT EXISTS patch_test_required boolean DEFAULT false;
ALTER TABLE services ADD COLUMN IF NOT EXISTS min_age integer DEFAULT NULL;
ALTER TABLE services ADD COLUMN IF NOT EXISTS contraindications text[] DEFAULT '{}';
ALTER TABLE services ADD COLUMN IF NOT EXISTS aftercare_notes text DEFAULT NULL;
ALTER TABLE services ADD COLUMN IF NOT EXISTS service_type text DEFAULT NULL;
```

**Block 2 — Tag columns on `providers`**
```sql
ALTER TABLE providers ADD COLUMN IF NOT EXISTS style_tags text[] DEFAULT '{}';
ALTER TABLE providers ADD COLUMN IF NOT EXISTS occasion_tags text[] DEFAULT '{}';
ALTER TABLE providers ADD COLUMN IF NOT EXISTS expertise_tags text[] DEFAULT '{}';
ALTER TABLE providers ADD COLUMN IF NOT EXISTS technique_tags text[] DEFAULT '{}';
ALTER TABLE providers ADD COLUMN IF NOT EXISTS inclusive_flags text[] DEFAULT '{}';
ALTER TABLE providers ADD COLUMN IF NOT EXISTS price_tier text DEFAULT NULL;
```

**Block 3 — Tag columns on `portfolio_items`**
```sql
ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS vibe_tags text[] DEFAULT '{}';
ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS occasion_tags text[] DEFAULT '{}';
ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS trend_names text[] DEFAULT '{}';
ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS hair_type_shown text DEFAULT NULL;
ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS skin_tone_shown text DEFAULT NULL;
```

**Block 4 — Intent fields on `bookings`**
```sql
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS occasion_type text DEFAULT NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS style_request text DEFAULT NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reference_image_url text DEFAULT NULL;
```

**Block 5 — Full-text search on `providers`**
```sql
ALTER TABLE providers ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION update_provider_search_vector()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.display_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.about_text, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW.style_tags, ' '), '')), 'B') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW.occasion_tags, ' '), '')), 'C') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW.expertise_tags, ' '), '')), 'C') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW.technique_tags, ' '), '')), 'C') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW.inclusive_flags, ' '), '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER providers_search_vector_update
  BEFORE INSERT OR UPDATE ON providers
  FOR EACH ROW EXECUTE FUNCTION update_provider_search_vector();

CREATE INDEX IF NOT EXISTS providers_search_vector_idx ON providers USING GIN(search_vector);

UPDATE providers SET updated_at = now();
```

**Block 6 — Full-text search on `services`**
```sql
ALTER TABLE services ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION update_service_search_vector()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW.tags, ' '), '')), 'B') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW.technique_tags, ' '), '')), 'C') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW.outcome_tags, ' '), '')), 'C') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW.trend_names, ' '), '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER services_search_vector_update
  BEFORE INSERT OR UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION update_service_search_vector();

CREATE INDEX IF NOT EXISTS services_search_vector_idx ON services USING GIN(search_vector);

UPDATE services SET is_active = is_active;
```

---

### Phase 2 — Provider Tag Population (ongoing, done by providers)

Once the migrations run, providers populate their tags through Edit Profile → Edit Service.
The service modal now shows:
- Style / Vibe chip grid
- Best For (Occasion) chip grid
- Techniques Used chip grid (category-specific)
- Results / Outcomes chip grid (category-specific)
- Trend Names (free entry + suggestions)
- Aesthetics Safety section (AESTHETICS category only): patch test, pregnancy safe, min age, contraindications
- Aftercare Notes

No manual backfill is needed — tags are populated organically as providers edit their services.

---

### Phase 3 — Wire tags into Search & Becca (future update)

What needs to be built next to make tags searchable:

**SearchScreen:**
- Pass search query to `getProviders()` server-side instead of loading all and filtering client-side
- Add `.ilike('display_name', ...)` + full-text `search_vector` query to `databaseService.getProviders()`
- Add provider `style_tags`, `expertise_tags`, `occasion_tags` to the filter panel

**ExploreScreen:**
- Use `userLearningService.getPersonalisedTagContext()` to re-rank the portfolio feed
- Use `userLearningService.scorePortfolioItem(item)` on each loaded item, sort descending
- Add `vibe_tags`, `occasion_tags`, `trend_names` to the Supabase portfolio select query

**Becca (BeccaScreen / enhancedAIChatService):**
- On conversation start, call `userLearningService.getPersonalisedTagContext()` and inject into Becca's system context
- Add extraction for: occasion type, style vibe, outcome desired, trend names
- Add safety-aware filtering: if user's beauty profile has allergies, filter out services with matching contraindications

**UserLearningService — call sites to add:**
- `trackProviderView()` when user opens a provider profile (pass provider's style_tags, expertise_tags)
- `trackBooking()` after a booking is confirmed (pass service's technique_tags, outcome_tags, occasion_tags)
- `trackSearch()` is already called from SearchScreen — no change needed

---

### Phase 4 — Real availability & real prices (future update)

Currently broken/hardcoded:
- Availability always shows "Slots Available" — needs to query `provider_availability` table against actual bookings
- Prices on SearchScreen are randomly assigned — need to pull min price from the provider's `services` table
- Distance filter in FilterModal is wired up in UI but never executes — needs `latitude`/`longitude` + geospatial query

---

### Phase 5 — User profile → search personalisation (future update)

Fields exist in the `users` table but are never used to filter providers:
- `hair_type` → should surface providers with matching `expertise_tags` (e.g. `4c-hair`)
- `skin_type` → should surface aesthetics providers experienced with that skin type
- `allergies` → should exclude services where `contraindications` overlaps
- `style_vibe` → already seeds `userLearningService` via `setUserProfile()` — needs to be called on auth load

---

### Phase 6 — Inclusive & safety search flags (future update)

Provider-level `inclusive_flags` column now exists. Populate and surface:
- `pregnancy-safe` — filter to providers who have marked services as safe
- `allergy-conscious` — for clients with known sensitivities
- `lgbtq-friendly`, `male-grooming`, `kids-specialist`

---

## WHAT IS DONE (as of June 2026)

| Item | Status |
|---|---|
| `DbService` — all tag fields added to TypeScript type | Done |
| `DbProvider` — style/occasion/expertise/technique/inclusive/price_tier added | Done |
| `DbPortfolioItem` — vibe/occasion/trend/hair_type/skin_tone added | Done |
| `DbBooking` — occasion_type/style_request/reference_image_url added | Done |
| Service edit modal — tag chips, safety section, aesthetics card | Done |
| `providerRegistrationService` — saves and loads all new tag fields | Done |
| `userLearningService` — tag-level tracking, scoring, personalisation methods | Done |
| Supabase SQL migrations | **Pending — must be run manually** |
| Provider tag population | **Ongoing — providers fill in via Edit Service** |
| SearchScreen server-side search + tag filter | Pending Phase 3 |
| ExploreScreen personalised ranking | Pending Phase 3 |
| Becca tag-aware context injection | Pending Phase 3 |
| Real availability check | Pending Phase 4 |
| Real price from services table | Pending Phase 4 |
| User profile → provider filter | Pending Phase 5 |
| Inclusive flags surfaced in search | Pending Phase 6 |
