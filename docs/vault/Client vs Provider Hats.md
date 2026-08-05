# Client vs Provider Hats
#accounts #auth

One account can be **both** a client (books other people's services) and a provider (offers their own). This note explains how that actually works — the account model, how switching works, what each side can/can't do, and where it's fragile. For the separate topic of dev-only reset/testing tools, see [[#Appendix — dev reset tools]] at the bottom.

## The one-sentence model

**`accountType`/`role`** is a DB-backed fact about the account ("provider" or "user"/client — whichever is *currently dominant*). **`activeMode`** is a local, in-session UI toggle ("which tab bar am I looking at right now"). They are related but not the same thing, and conflating them is the single easiest way to misunderstand this system.

## The account model

Every account is a row in `public.users`, with a `role` column constrained to exactly two values: `'user'` or `'provider'` (`supabase/phase1_schema.sql:13-14`). There is no third role and no unset state — signup always picks one of two cards, *"Looking for Services"* → `role: 'user'`, or *"Beauty Professional"* → `role: 'provider'` (`SignUpStep1Screen.tsx:46-87`). Under the hood, `'user'` is just the DB/code name for what the UI calls **client** — same thing.

**Being "dual-hat" is not a third role value.** It's inferred at runtime from two separate signals:
- `role` — which hat is currently dominant (`AccountType = 'user' | 'provider'`, `AuthContext.tsx:19`)
- `hasClientProfile` — a boolean proxy computed as `!!profile.dob` (`AuthContext.tsx:309`) — "has this account also filled in client beauty-profile data"

There's a third implicit signal the type system doesn't directly track: **whether a `providers` row actually exists.** A `role='provider'` account can, briefly, have no `providers` row yet (see below) — this gap has already caused one documented bug.

## Becoming a provider (or adding a client hat back)

There's no single "become a provider" button that does everything atomically. It's a short in-place flow reusing the signup wizard:

**Client → Provider**, via `upgradeToProvider()` (`AuthContext.tsx:414-430`):
1. `UserProfileScreen`'s "Become a Provider" button (only shown when `accountType !== 'provider'`) → confirmation modal → jumps into the signup wizard at **Step 3** (skips name/email/phone/password, since those already exist).
2. On finishing, `upgradeToProvider()` runs `UPDATE users SET role='provider', business_name, business_email` — **and nothing else**. No `providers` row yet.
3. The `providers` table row (slug, category, location, etc.) is only created the *first time* the new provider actually saves their profile in `InfoRegScreen` → `saveProviderToSupabase()` (`services/providerRegistrationService.ts:247-394`), which upserts `providers` and (redundantly) sets `role='provider'` again.

So there's a real window — between finishing the upgrade wizard and saving the first provider profile — where `role === 'provider'` but `providers` has no row for this account. `UserProfileScreen.tsx:271-273` calls this out by name as a past bug source: switching `activeMode` to `'provider'` during that window "lands them in an empty provider dashboard (the 'different account' bug)." The current fix is a UI-level guard at that one call site, not a server-side invariant — a new "switch to provider" entry point elsewhere wouldn't automatically inherit the same protection.

**Provider → Client**, via `addClientProfile()` (`AuthContext.tsx:434-466`): same pattern in reverse. `ProviderAccountScreen`'s "Create Client Account" / "Switch to Client Mode" button (label depends on `hasClientProfile`) walks through the wizard from Step 2 onward, writing beauty/preference fields + `dob` directly onto the same `users` row — no new table involved.

Both directions funnel through `SignUpStep5Screen.tsx:137-183`, which checks flags (`fromProviderSwitch` / `fromClientSwitch`) to decide "upgrade this existing account" vs. a genuine brand-new `supabase.auth.signUp(...)` for someone who isn't logged in at all.

**Separately:** `ClaimProviderScreen` is a *different* flow — claiming a pre-existing, pre-scraped/imported provider listing (e.g. a salon that was imported into the platform before it had an account). It sets `role: 'provider'` at signup directly, without ever going through `upgradeToProvider`. Don't conflate "claim my salon's imported profile" with "add a provider hat to my existing client account" — they're two separate paths that happen to land in a similar place.

## Switching hats at runtime — `switchMode()`

Once an account has both hats, flipping between them is instant, local, and requires no re-login or network call:

```ts
// AuthContext.tsx:400-410 (paraphrased)
const switchMode = useCallback(async () => {
  const next = activeMode === 'provider' ? 'client' : 'provider';
  setIsSwitching(true);
  await sleep(300);            // lets the "Switching to X Mode" modal render
  setActiveMode(next);
  await AsyncStorage.setItem('@active_mode', next);
  await sleep(600);            // same modal, cosmetic only
  setIsSwitching(false);
}, [activeMode]);
```

The ~900ms of delay is **purely cosmetic** (a full-screen "Switching to Provider/Client Mode" overlay, `RootNavigation.tsx:81-90`) — no server round-trip happens. What actually changes underneath:

- `RootNavigation.tsx:35` swaps the **entire bottom-tab navigator tree** — `ClientTabNavigator` vs `ProviderTabNavigator` — as the component mounted for the app's main tabs screen. Everything below that point (stacks, screens) is a completely separate component tree per hat, not one screen branching on a flag.
- `activeMode` persists to `AsyncStorage` (`@active_mode`) so reopening the app lands back in the same hat — but this is **device-local only**, never written to the `users` table. Server-side, there is no "current mode" column; only `role` exists in the DB.
- A lower-level sibling, `applyMode()`, does the same state flip *without* the overlay/transition — used when a push notification needs to jump straight into the other hat's screen (e.g. a client-hat push arriving while the app is showing provider mode), and when a hat gets deleted and the app needs to drop out of that mode immediately.

## What's actually separate between the two hats

**Navigation is fully separate**, not shared-with-flags:
- Client tabs: Becca · Explore · Home · Cart · Profile (`src/navigation/client/ClientTabNavigator.tsx`)
- Provider tabs: Becca · ProviderHome · MyServices · Profile (`src/navigation/provider/ProviderTabNavigator.tsx`)
- Even the tab named "Becca" in both is two **entirely separate** navigator stacks (`ProviderTabNavigator.tsx:7-8`: *"Provider mode uses the ISOLATED Becca stack (no client screens) so a provider can never bubble into a client-facing screen from the Becca tab"*) — not one shared screen with an if/else.

**A few screens are genuinely shared** and branch internally on `activeMode` instead of having two versions — `BeccaScreen.tsx` and `NotificationsScreen.tsx` both destructure `activeMode`/`isProviderMode` and show different content/data within the same component. This is the exception, not the pattern.

**Theme is independent of hat** — light/dark mode preference lives in `ThemeContext`, untouched by `activeMode`. Switching hats never changes light/dark.

## What can't be done / hard limits

- **No account is permanently client-only by server rule.** Any `role='user'` account can call `upgradeToProvider` — there's no flag reserving an account as "can never become a provider." The only gates that exist are UI-level (which button/label shows), not permission-level.
- **A provider isn't automatically bookable just by having the hat.** Going live (`has_gone_live` on `providers`) is a separate, additional gate — services, an open schedule, and a geocoded address are all required first (see [[Provider Onboarding & Go-Live]]). Adding the provider hat ≠ becoming a searchable/bookable provider.
- **Deleting one hat while keeping the other is instant and permanent — no undo, no grace period.** The 30-day grace period only applies when deleting your *last* remaining hat (i.e. the whole account). Narrowing from dual-hat down to one hat is immediate (`supabase/delete_account.sql:19-21, 103-106, 199-201`).
- **A documented, known, permanent data-loss edge case:** if a provider hat is purged, reviews *about* that provider — written by other, still-existing client accounts — are hard-deleted along with it. Those reviewers don't get their review back; there's currently no mechanism to preserve a review independent of the provider it was about (`supabase/delete_account.sql:47-54`, explicitly flagged there as a known limitation, not an intended design choice).

## Two things that read as bugs but are actually documented tradeoffs

- `role='provider'` gets written in **two different places** — once when upgrading (`upgradeUserToProvider` in `databaseService.ts`) and again, unconditionally, every single time a provider saves their profile (`saveProviderToSupabase`, not just the first time). Redundant, not broken — just worth knowing which call site is "authoritative" if you're tracing when `role` actually flips.
- `hasClientProfile` is **only** a proxy for "does `dob` have a value" — not a dedicated flag. If a client hat's DOB were ever cleared for an unrelated reason, `hasClientProfile` would silently read `false` even if other client data still exists. Soft coupling, not a confirmed live bug, but a fragility to keep in mind if this ever needs to be made more precise.

## Connections
[[Provider Onboarding & Go-Live]] · [[Screens & Navigation]] · [[Contexts]] · [[Client vs Server Authority]]

## Open questions
- `AuthScreen`'s `login()` is a documented no-op (`AuthContext.tsx:468-470` — real auth goes entirely through `onAuthStateChange` → `loadUserProfile`). Is `AuthScreen` itself still reachable/used anywhere, or is it dead code that looks live? #todo
- Should `role='provider'` imply a `providers` row exists as a server-side invariant, rather than relying on the one UI-level guard in `UserProfileScreen` to prevent the "empty provider dashboard" bug at every future call site that might trigger a mode switch? #todo

---

## Appendix — dev reset tools

Separate, narrower topic: `src/screens/shared/DevSettingsScreen.tsx` has dev-only buttons to wipe test data per-hat (client bookings vs. provider bookings) at both the local-cache and database level, plus a note on a real storage-key bug (`@bookings` vs `@cerviced_bookings`) found and fixed while testing this. That's testing/QA tooling, not app behavior — kept as a footnote here rather than the main topic. If this grows, split it into its own note; for now: `dev_reset_client()`, `dev_reset_provider_bookings_only()`, and `dev_reset_provider()` are the three SQL RPCs (`supabase/dev_reset_*.sql`), each self-scoped to `auth.uid()`'s own client-side or provider-side rows respectively, deliberately never touching `transactions` (which survive by design — see `transactions_survive_account_deletion.sql`).
