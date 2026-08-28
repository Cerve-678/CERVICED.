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

## EXPLORE SCREEN — Pinterest-style redesign (done 2026-08-01)

### Status: Implemented (My Plans tab mentioned below was later removed same day — see the "MY PLANS" entry further down)

`ExploreScreen.tsx`'s Discover tab is a 2-column masonry grid (`MasonryGrid` +
`PortfolioCard`). Shipped on 2026-08-01:

- **Fixed a real sizing bug**, not just a style tweak: `aspect_ratio` is
  stored as width/height (see `InfoRegScreen.handleAddPortfolioImages`), but
  `PortfolioCard`/`ImageDetailModal` were multiplying by it instead of
  dividing — portrait photos rendered short/landscape-looking instead of
  tall. Now `imageHeight = columnWidth / item.aspectRatio` in both places.
- Cards are picture-forward: caption/price text below the card is gone;
  price now shows as a small overlay badge (top-left) alongside the
  existing category chip + provider name (bottom) and bookmark (top-right).
  `getItemHeight` dropped its `+40` fudge factor since there's no more
  variable-height text below the image.
- Removed the header row (title + bookmark icon) above `SubTabBar`; the
  bookmark button moved inline into the search bar row instead. At the time
  `SubTabBar` (Discover/My Plans) was kept as-is — the My Plans/event-planner
  feature was explicitly out of scope for this pass. (It was removed later
  the same day; see below.)
- **Mixed feed**: the Discover grid now interleaves portfolio photos with
  provider cover-photo cards and service-photo cards (4 portfolio : 1
  service : 1 provider), via two new `databaseService` queries,
  `getDiscoverProviders` (providers with a `background_image_url`) and
  `getDiscoverServices` (`services` inner-joined to `service_images`, so
  only services with a real photo show up). All three share the same
  `PortfolioItem` shape (`kind: 'portfolio' | 'provider' | 'service'`) so
  existing card/modal/click-through code didn't need to branch on it.
  Scoped to the no-search-text browse case; typed search still searches
  portfolio photos only (`searchPortfolio`), not services/providers.

**Known gaps, not done in this pass:**
- Still 2 columns fixed regardless of screen width; still an unvirtualized
  `ScrollView` in `MasonryGrid` (fine at current volumes, revisit if the
  feed grows past a couple hundred on-screen items).
- Provider/service cards use a hardcoded `0.8` aspect ratio (no real
  dimensions available for a cover/service photo) — may look slightly off
  next to true portfolio photos with varied ratios.
- "Book Now" from a service card still passes the item's category as
  `providerService`, not the real service name/price, matching prior
  (pre-existing) checkout behaviour — not something this pass touched.

---

## IMAGE DETAIL MODAL — "More like this" row (removed 2026-08-01, revisit later)

### Status: Pulled out entirely — visibly glitchy, not worth patching in place

Built alongside the Explore redesign above: tapping a card opened
`ImageDetailModal` with a same-category "More like this" row underneath the
tags, and tapping one of those swapped the modal to that item in place.
Removed the same day after the user hit a visible glitch.

**Likely cause (not confirmed, didn't dig further since it was pulled):** the
modal's main `ScrollView` had `key={item.id}` so it would remount and reset
scroll position each time the open item changed. That's fine when the modal
first opens, but swapping items via "More like this" reused the *same* modal
instance — so the `key` change forced a full remount of everything inside
(hero image, provider row, tags, buttons), not just the parts that actually
needed refreshing. That's the kind of thing that reads as a flash/flicker
rather than a smooth in-place swap.

**If this comes back:** don't reset scroll via a `key` on content that's
supposed to update in place — reset scroll explicitly instead (a `ScrollView`
ref + `scrollTo({ y: 0 })` on item change), so only the bits that changed
(image source, text) re-render rather than the whole subtree remounting.

**What was reverted:** `similarItems`/`onSelectSimilar` props and the
"More like this" `View`/`ScrollView` block in `ImageDetailModal.tsx`, the
`key={item.id}` on the main `ScrollView`, the `similarItems` useMemo +
`handleSelectSimilar` callback in `ExploreScreen.tsx`, and the associated
`similar*` styles. The mixed-feed grid itself (portfolio/provider/service
cards) is untouched and still live.

---

## MY PLANS (event planner) — removed 2026-08-01, revisit later

### Status: Removed; the second Explore tab now holds Favourites instead (see below)

**Update, same day:** the second Explore tab is back, but as "Favourites"
(anything hearted — via `PortfolioCard`'s bookmark button or the new heart
icon in `ImageDetailModal` — powered by the existing `useBookmarkStore`/
`savedPortfolioIds`), not a revival of My Plans. The notes below describe
what My Plans specifically was and how to bring *that* back, if ever wanted
— it's a different feature from Favourites.

The Explore screen used to have two tabs: Discover and My Plans. My Plans let
a client create an "event" (e.g. a wedding), attach portfolio looks to it as
tasks via "Plan This" in `ImageDetailModal`, and track a checklist —
entirely local-device state (`AsyncStorage`/`usePlannerStore`, key
`planner_events`), never synced to Supabase. Removed at the user's request
("remove for now") — no bug, just wasn't wanted right now — alongside the
`ImageDetailModal` "slick" pass below, since the "Plan This" button that
opened it was the biggest single piece of clutter in that modal.

**Files deleted entirely** (last touched in commit `7a69339`, so
`git show 7a69339~1:src/stores/usePlannerStore.ts` or similar gets the old
content, or just `git checkout 7a69339~1 -- <path>` to restore a single file):
- `src/stores/usePlannerStore.ts` — the zustand store (events, tasks, checklist, all local)
- `src/screens/EventDetailScreen.tsx` — the plan detail screen
- `src/components/EventTimelineCard.tsx` — used only by EventDetailScreen
- `src/components/CreateEventModal.tsx` — "create a new plan" modal

**Touchpoints trimmed, not deleted** (these files still exist, just smaller):
- `ExploreScreen.tsx` — removed the `SubTabBar` (Discover/My Plans toggle,
  now just one implicit view), `EventCard` + `getDaysUntil`, the whole
  My Plans tab JSX block, and the `handlePlanThis`/`handleEventCreated`/
  `handleEventPress` handlers + related state (`activeTab`,
  `isCreateEventVisible`, `pendingPlanItem`).
- `ImageDetailModal.tsx` — removed the `onPlanThis` prop and the "Plan This"
  gradient button.
- `src/navigation/Tabs/ExploreNavigator.tsx` + `src/navigation/types.ts` —
  removed the `EventDetail` route/param.
- `src/utils/storage.ts` — removed the now-unused `PLANNER_EVENTS` key.

**Deliberately left alone:** `getMyEventPlans`/`getEventPlanDetails` in
`databaseService.ts` and the `DbEventPlan`/`DbEventTask`/`DbEventChecklistItem`
types — these were *already* dead/unused before this change (a separate,
Supabase-backed event-plan design that the local-only `usePlannerStore`
apparently superseded and never called) so removing My Plans doesn't change
their status. Not touched here since they're a pre-existing, unrelated loose
end, not something this pass orphaned.

**If this comes back:** restore the four deleted files from git history,
re-add the `EventDetail` route + `PLANNER_EVENTS` storage key, and re-wire
`ExploreScreen`/`ImageDetailModal`. Worth reconsidering the local-only
storage design at that point too — it means a plan never survives a
reinstall or shows up on a second device.

---

## RESCHEDULE EXPIRY EATS THE CLIENT'S CANCELLATION RIGHT (deferred 2026-08-26)

Not building this yet — decision deferred deliberately. Recording it so the
trap is not rediscovered the hard way.

**The trap.** Reschedule expiry shipped 2026-08-26 (see `BOOKINGS.md` §7a): if
a provider never answers, the request expires at the start of the appointment
day and the booking stays exactly as originally scheduled. But cancelling is
governed by a *separate*, unrelated window — `cancel_own_booking()` reads
`providers.cancellation_notice_hours`, falling back to
`booking_policies->>'cancelNotice'` (24h/48h/72h), and hard-blocks with
`This provider requires N hours notice to cancel`.

Nothing connects the two. So a client who acts entirely in good time can be
left unable to do either thing:

| | 24h cancel notice | 72h cancel notice |
|---|---|---|
| Appointment | 2pm Wed | 2pm Wed |
| Client asks to reschedule | 2pm Tue (allowed) | 2pm Sun (allowed) |
| Provider ignores it | | |
| Request expires | midnight Tue→Wed | midnight Tue→Wed |
| Time left at expiry | ~14h | ~14h |
| Can they still cancel? | **No — needs 24h** | **No — needs 72h** |

**The sharp part:** at the moment the client asked, they still had their full
cancellation right. By the time the provider's silence resolved into an answer,
they had lost it. The provider's non-response consumed a right belonging to the
client. Their remaining options are attend an appointment they tried to move,
or no-show — and a no-show inside 24h also increments `late_cancel_count` on
`client_provider_reliability`, so the silence ends up recorded against the
*client's* reliability.

The longer the provider's notice period, the worse it gets — a 72h provider
opens a ~58h gap between "you could still have cancelled" and "you now can't."

**Two ways out, and they trade off against each other:**

1. **Grant a no-penalty cancellation** when a `pending` request expires. Most
   direct, and the fairest reading — the client shouldn't lose a right to
   somebody else's inaction. This is the option with real liability attached
   (`LEGAL-COMPLIANCE-NOTES.md` §12) and it is a product/legal call, not an
   engineering one. It also needs a refund answer, and there is currently no
   refund logic anywhere in the app (`PRE-LAUNCH-TODO.md` §1b).

2. **Expire the request early enough that the cancellation window is still
   intact** — cap the deadline at `appointment - cancelNotice` as well. Cleaner
   in that no new right is invented, but it cannot fully work on timing alone:
   when the cancel notice is long (72h) and the client asks near that boundary,
   the cap lands at or before the moment they asked, leaving the provider no
   answer window at all. It would need the same 4-hour floor the appointment-day
   backstop already uses, and at that point it is still eating into the
   cancellation window, just less of it.

A real fix probably combines them: cap where there is room, and fall back to
(1) where there is not. Do not pick unilaterally — (1) is the half with money
and terms attached.


### PARKED 2026-08-27: telling the client the cancel window has already closed

Built, reviewed, then parked before shipping — not abandoned. The code was on
`RescheduleScreen` and is in git history (`a16c492`), removed the same day.

**What it did.** When a client opened the reschedule screen for a booking
already inside their provider's *cancellation* notice — legitimate, because a
provider whose reschedule notice is shorter than their cancellation notice
accepts requests from clients who can no longer cancel — it showed a plain note
above the policy card. No warning icon, no red, not a modal, not a block: the
client has done nothing wrong and the request may well succeed.

The copy, with the final sentence cut on review (it pushed the client at the
provider when the screen's own job is to handle it):

> Worth knowing: [Provider] asks for [N] hours' notice to cancel, and this
> appointment is inside that now. You can still ask to move it — just bear in
> mind that if none of the times work out, the original booking stays as it is.

**What it needed.** `getProviderReschedulePolicy*` had to carry
`cancelNoticeHours` alongside the reschedule fields, resolved exactly the way
`cancel_own_booking()` resolves it — `providers.cancellation_notice_hours`
first, `booking_policies->>'cancelNotice'` as fallback — and read *before* the
mapper's early return, since a provider can have the column set while
`booking_policies` is still null. That field was removed again with the UI
rather than left with no reader.

**Why it is parked rather than dead.** It is the client-facing half of the
cancellation-right trap above. The server-side half — the
`cancel_window_closing` warning notification — shipped and is live
(`20260827160000`). This half covers the case that warning cannot reach: the
client who was already past the cancel boundary when they asked, where there is
no gap to warn into. Restoring it is a small diff and one policy field.

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
