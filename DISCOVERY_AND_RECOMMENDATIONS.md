# Discovery & Recommendations — How the Home Screen Decides What You See

This documents every provider-surfacing section on the home screen
(`src/screens/HomeScreen.tsx`): where its data comes from, how it's filtered
and ordered, what happens when it's empty, and how it fits together end to
end. It also covers the "Near You" location feature and how it compares to
how Uber Eats ranks restaurants, since that's the model this was built
against.

For the deep math behind the personalization score, see
`USER_LEARNING_ALGORITHM.md` — that file is slightly out of date (it
describes "Your Providers" as interaction-based; it is actually bookmarks —
see below) but the scoring weights it documents are accurate.

---

## The 15-per-row rule

Every horizontal row and every "View All" grid on the home screen shows a
**maximum of 15 providers**. Before this, caps were inconsistent — some rows
showed 5, some 10, some had no cap at all (Male/Kids "View All" used to render
every matching provider with no limit). 15 is now the standard everywhere:
enough to feel abundant without turning a row into an unbounded list, and
consistent so no section feels arbitrarily stingier or more generous than its
neighbors. Where a source list naturally has fewer than 15 candidates
(e.g. "Book Again" for a user with 3 past providers), the row just shows what
exists — the cap is a ceiling, not a target.

---

## Section by section

### Your Providers
**What it is:** providers the user has bookmarked. Not a personalization
feature — it's a literal list of saved providers, same as any "favorites"
list.
**Data flow:** `useBookmarkStore` holds `bookmarkedIds: string[]`, persisted
to both AsyncStorage (`STORAGE_KEYS.BOOKMARKED_VIDEOS`) and the `bookmarks`
DB table. `HomeScreen` cross-references `bookmarkedIds` against the live
provider list (`liveProviders.filter(p => bookmarkedIds.includes(p.id))`).
**Ordering:** whatever order `bookmarkedIds` is in (insertion order —
most-recently-bookmarked isn't specially promoted).
**Empty state:** section doesn't render at all if there are no bookmarks
(`showWhen` in `src/config/homeSections.ts`).
**Feeds into:** the exclusion list for Recommended (see below) — a
bookmarked provider is deliberately never shown as a "recommendation," since
recommending something the user already saved is noise.

### Recommended For You
**What it is:** the personalization engine's best guess at relevant
providers, excluding anything already bookmarked.
**Data flow:**
1. `userLearningService.getPersonalizedProviders(liveProviders)` scores every
   live provider (see scoring breakdown below) and returns them sorted
   best-first.
2. If the user has fewer than 3 tracked interactions and no beauty profile
   set, personalization is skipped entirely and the raw provider list is
   returned as-is (cold start — there's no signal yet to rank on).
3. Bookmarked providers are filtered out of the result.
4. If filtering happens to leave nothing (rare, but possible for a very new
   or very bookmark-heavy user), it falls back to "every non-bookmarked live
   provider" rather than showing nothing.
**Ordering:** score descending. The score blends (see
`userLearningService.calculateProviderScore`):
  - Service-category affinity — 40%
  - This specific provider's own affinity (have you viewed/booked *them*
    before) — 30%
  - Time-of-day match (do you usually browse at this hour) — 10%
  - Recency of interactions with this service category — 20%
  - Flat bonuses on top: +3 if the service matches a stated interest, +1 per
    matching treatment-history entry, plus weighted bonuses for style/
    occasion/technique tag overlap and hair-type/style-vibe profile matches.
**Collapsed vs "View All":** collapsed shows the top 15 from the personalized
list. "View All" used to pull from a *different, wider* pool (every category
bucket concatenated together) — this was a bug (see the section on the
empty-row fix below) and now applies the exact same bookmark exclusion, just
capped at 15 instead of 7.
**Empty state:** the whole section — header, "View All" button, everything —
disappears if there is genuinely nothing left to recommend (e.g. every live
provider is bookmarked). It used to render an empty header with nothing
underneath, which read as broken.

### Browse by Category
**What it is:** providers grouped by service (Hair, Nails, Lashes, MUA,
Brows, Aesthetics), each its own horizontal row.
**Data flow:** simple `liveProviders.filter(p => p.service === X)` per
category, computed once whenever `liveProviders` changes.
**Ordering:** whatever order `getProviders()` returned in — see "Near You"
below for why that's not always meaningful.
**Collapsed vs "View All":** collapsed shows Hair + Nails only (the two most
booked categories); "View All" shows every category with matches, each
capped at 15.

### Near You *(rebuilt — see below)*
**What it is:** a distance-ranked list of nearby providers. Previously this
row existed in the code (the comment literally said
`// Near Me Section - Location-based providers`) but was never wired up — it
just showed the first 10 providers in DB order under the label
"ALL PROVIDERS," with no actual location logic anywhere in the app.
**Data flow, now:**
1. On mount, `HomeScreen` requests foreground location permission via
   `expo-location` (`Location.requestForegroundPermissionsAsync`) — the same
   package already used elsewhere in the app (`BookingsScreen`, for
   in-progress-booking tracking), and the permission string is already
   declared in `app.json`
   (`"This app uses your location to show nearby beauty service providers."`)
   — it had simply never been consumed by Home.
2. If granted, `Location.getCurrentPositionAsync({})` gets a one-time GPS
   fix, stored as `userCoords`.
3. `nearbyProviders` (a memo) computes the great-circle distance
   (`src/utils/distance.ts`, haversine formula) from `userCoords` to every
   provider that has `latitude`/`longitude` set (the `providers` table
   already had these columns — they just weren't being read into the app's
   `Provider` type before now, and nothing ever wrote to them either — see
   below).
4. **Elastic radius:** try a 50km cutoff first. If fewer than 5 providers
   fall inside it, drop the cutoff and just take the nearest 15 regardless of
   distance. This avoids showing a near-empty row in a sparse market or early
   in the platform's rollout — see the Uber Eats comparison below, this is
   the same trick delivery apps use.
5. Sorted nearest-first, capped at 15, each card shows a small distance badge
   (`180m`, `4.2km`, etc.).
**Fallback (no location):** if permission is denied, location services are
off, or the fix fails for any reason, `userCoords` just stays `null` and the
section falls back to the plain unsorted provider list — and the header
falls back from "NEAR YOU" to "ALL PROVIDERS" so the label never lies about
what the user is looking at.
**What this does *not* do yet:** distance is not blended into Recommended,
Top Rated, or Browse by Category — those sections rank on rating/personali-
zation/recency exactly as before. Near You is currently its own row, not a
site-wide ranking signal. See "Where this goes next."

#### Where the coordinates actually come from — two tiers, on purpose

Getting `providers.latitude`/`longitude` populated at all turned out to be
its own gap. Providers have **two separate location fields**, and it matters
which one this feature is allowed to touch:

| Field | Table | Who can read it | What providers put there |
|---|---|---|---|
| `location_text` | `providers` (public) | any client, always | free text — the registration form's own placeholder suggests something as vague as `"North West London"`. A salon/studio might reasonably put their real address here instead, since a storefront isn't sensitive. |
| `full_address` | `provider_private_details` (private, RLS owner-only) | only the provider themself, until their chosen `address_release_policy` fires for a specific confirmed booking | the real, precise address — deliberately moved out of the public table by `restrict_provider_full_address.sql` specifically so it can't leak to clients before release. |

Before this pass, **neither** field ever produced a coordinate — `location_text`
was saved as plain text with no geocoding step at all, and
`providerRegistrationService.ts`'s save function never wrote to
`latitude`/`longitude` under any circumstance. So the "Near You" row (and a
second, independently-built distance feature that appeared in
`SearchScreen.tsx` around the same time as this one) had real distance math
to run, but zero providers with real coordinates to run it on.

The fix only geocodes `location_text` (via `expo-location`'s built-in
`Location.geocodeAsync`, no external API/key needed) and writes the result to
the public `providers.latitude`/`longitude` columns at save time. It
deliberately does **not** geocode `full_address`, even though that would be
more accurate: piping the private, release-gated address into a
publicly-readable coordinate would leak a home-based provider's precise
location to every client immediately, regardless of their chosen release
policy — arguably a worse leak than the address text itself, since a
lat/lng pair drops straight onto a map with no further work. A vague public
`location_text` like "North West London" now correctly geocodes to a vague,
low-precision coordinate — that's the right privacy behavior, not a bug. A
salon that put its real address in the public field gets an accurate pin,
because there was never anything sensitive about that address to begin
with.

**Deliberately left for later** (flagged, not built, because it needs care):
using the private `full_address` to compute *more accurate* distances for
home-based/mobile providers, without ever exposing the address or exact
coordinate to the client. That would need a server-side `SECURITY DEFINER`
Postgres function — mirroring the pattern `provider_private_details`'s own
RLS already relies on — that accepts the user's coordinates, joins against
each provider's private (geocoded) address internally, and returns only a
distance number. The client would only ever see "2.3km away," never the
coordinate or address it was computed from.

### New on Cerviced
**Data flow:** `getTopRatedProviders`'s sibling, `getNewProviders(15)` —
providers with `has_gone_live = true` created in the last 30 days, newest
first, capped at 15 in the query itself (not client-side).
**Empty state:** section hidden if no provider went live in the last 30 days.

### Top Rated
**Data flow:** `getTopRatedProviders(15)` — providers with `review_count >= 3`
and `rating >= 4.0`, sorted by rating descending, capped at 15 in the query.
The `review_count >= 3` floor exists so a single 5-star review can't catapult
a brand-new provider to the top.
**Empty state:** hidden if no provider currently clears the bar.

### Male Services / Kids Services
**Data flow:** same category-filter pattern as Browse by Category
(`service === 'MALE'` / `'KIDS'`), capped at 15.
**Visibility rule** (`src/config/homeSections.ts`): shown if the user's
profile explicitly opted in (`gender === 'male'` / `has_kids`), if they've
shown interest via `service_interests`, **or** if the relevant profile field
is simply unset — i.e. the section defaults to visible for anyone who hasn't
said "not applicable to me," rather than defaulting to hidden.

### Recently Viewed
**What it is:** the last providers the user opened a profile for.
**Data flow:** `userLearningService.getRecentInteractions('view', 50)` reads
the last 50 raw `'view'`-type interaction log entries (widened from 10 — see
below), then de-duplicates by provider id (`new Set(...)`) and resolves each
surviving id back to a live provider object, capped at 15.
**Why the raw window is wider than the display cap:** a single visit only
ever produces one interaction now (see the tracking fix below), but the same
provider can legitimately be viewed multiple times across different
sessions, and each of those is a separate raw entry. Fetching only 10 raw
entries could mean, after dedup, well under 15 *unique* providers even for
an active user — 50 gives enough headroom.
**The double-counting bug that was here before:** until this pass, a single
profile visit logged **two** `'view'` interactions — one fired by
`HomeScreen`/`SearchScreen` the instant a card was tapped, a second fired by
`ProviderProfileScreen` itself once the profile actually loaded. This didn't
create visibly duplicated cards (the id-based dedup caught that), but it
silently halved the useful size of the "last N interactions" window and
double-weighted every view in the personalization score. Fixed by removing
the tap-time tracking and keeping only the load-time one, which also has the
advantage of firing consistently no matter how the user arrived at a
profile (tapped a card, deep link, notification, etc.) rather than only from
Home/Search.

### Current Offers
**What it is:** active promotions from any live provider.
**Data flow:** `getActivePromotions()` — one query joining `promotions` to
`providers`, filtered to `providers.is_active`, `providers.has_gone_live`,
`promotions.is_active`, and `valid_until >= today`. Newest-created first.
Optionally targeted to a specific service category (`promotion_interest_
targeting.sql` narrows delivery further at the DB level for push/notification
purposes, but the Home row itself just shows whatever's currently active).
**Cap:** 15 (was 3 — a promotions row this small effectively only ever showed
whatever few offers existed that week; 15 lets a busier promo period actually
be browsable in the row instead of immediately pushing everything into "View
All").

### Book Again
**Data flow:** providers from the user's own past bookings
(`previouslyBookedProviders`), capped at 15.
**Empty state:** hidden entirely for a user with no booking history.

---

## The interaction-tracking pipeline (feeds Recommended + Recently Viewed)

```
User taps a provider card (Home / Search / anywhere)
        │
        ▼
navigation.navigate('ProviderProfile', { providerId })
        │
        ▼
ProviderProfileScreen loads → getProviderBySlug()
        │
        ▼
userLearningService.trackInteraction({ type: 'view', providerId: data.id, ... })
        │
        ├─▶ pushed onto in-memory interaction log (capped at 200, oldest dropped)
        ├─▶ favoriteServices[service] weight += 1 × 0.4  (see scoring table above)
        ├─▶ favoriteProviders[providerId] weight += 1 × 0.3
        ├─▶ timeOfDayPreferences[currentHour] += 1
        └─▶ persisted to AsyncStorage (@user_learning_data)
        │
        ▼
Next Home load: getPersonalizedProviders() reads the updated weights
        → Recommended For You re-ranks
Next Home load: getRecentInteractions('view', 50) reads the updated log
        → Recently Viewed re-populates
```

Booking, favoriting, and searching feed the same pipeline with different
interaction types and weights (`book`: 10, `favorite`: 5, `offer_view`: 3,
`search`/`query`: 2, `filter`: 1.5, `view`: 1) — a booking is a far stronger
signal than a view, and the scoring math treats it that way.

---

## How Uber Eats handles this (and how Cerviced compares)

Uber Eats' restaurant list isn't one signal — it's several layered on top of
each other, roughly in this order of how visible their effect is:

1. **Serviceability first, ranking second.** Before any ranking happens, a
   restaurant is filtered out entirely if it's outside the delivery radius
   for that address or currently closed. Ranking never gets a chance to
   "recommend" something that literally can't be delivered — this is a hard
   gate, not a scoring factor.
2. **Elastic radius.** In dense cities the radius is small (more choice than
   you need); in sparse areas it silently widens so the list isn't empty.
   This is exactly the trick Near You uses (50km, falling back to "just the
   nearest 15" instead of a near-empty row) — it's a standard pattern for any
   app ordering results by proximity, not something Uber Eats-specific.
3. **ETA is the real ranking currency, not raw distance.** Two restaurants
   at the same distance can have very different ETAs depending on how busy
   their kitchen is and courier availability nearby — Uber Eats ranks
   heavily on *predicted delivery time*, which distance only approximates.
   Cerviced doesn't have an equivalent "how busy is this provider right now"
   signal — the closest analogue would be next-available-slot time, which
   isn't currently factored into any ranking (see below).
4. **Personalization blended in, not a separate row.** Past-order history,
   cuisines you favorite, reorder rate — these get blended into the *same*
   ranked list a new user would see, generically ordered by popularity/ETA,
   rather than surfaced only in a separate "Recommended" section. Cerviced
   currently keeps these as genuinely separate concerns: Near You ranks by
   distance only, Recommended ranks by personalization only, Top Rated by
   rating only. That's the biggest structural difference, and the natural
   next step (below).
5. **Promoted placement is explicit and disclosed**, layered on top of the
   organic ranking rather than replacing it (sponsored slots are labeled).
   Cerviced's Current Offers row is comparable in spirit — it's a separate,
   clearly-labeled section rather than promotions being blended silently
   into other rankings.
6. **Popularity/trending as a tiebreaker and its own row**, similar to how
   Cerviced's Top Rated and (DB-level, `trending_providers_view.sql`)
   trending-this-week data work — order volume in a time window standing in
   for Uber Eats' "trending near you," booking volume standing in for
   Cerviced's.

**The upshot:** Cerviced's current design — separate rows for distance,
personalization, rating, and recency — is a reasonable, simpler starting
point than Uber Eats' single blended feed, and it's easier to reason about
and debug per-row. The gap worth closing over time is #3 and #4: folding
distance (and eventually "next available slot") into the *same* score
`calculateProviderScore` produces, rather than leaving proximity as a
parallel, disconnected row.

---

## Where this goes next

- **Blend distance into `calculateProviderScore`** rather than keeping Near
  You as a standalone row — a personalized recommendation that's also
  correctly close by is strictly more useful than one that requires a
  30-minute commute, and right now the score has no way to express that.
- **Let the user override/refine location.** `src/components/LocationModal.tsx`
  already exists — a full city + radius picker — but isn't wired into any
  screen. It's the natural home for "change your area" (useful for browsing
  a different city, or when GPS is denied) rather than only relying on a raw
  device fix.
- **Coarse fallback when GPS is denied.** Right now denial just drops back to
  unsorted "ALL PROVIDERS." An IP-based or manually-entered postcode/city
  fallback (feeding the same distance math) would keep the feature useful
  for users who decline the precise-location prompt.
- **Move the elastic-radius/distance math server-side** if the provider count
  grows large enough that client-side haversine over every row becomes
  wasteful — a Postgres function using `earth_distance`/PostGIS could filter
  at the query level instead of pulling every provider down to the device
  first.
- **"Next available slot" as a signal**, closer to Uber Eats' ETA-driven
  ranking — currently no section ranks on how soon a provider can actually
  see you.
