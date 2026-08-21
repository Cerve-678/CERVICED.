# CERVICED — App State

**Supersedes `LOGIC.md`, `APP_OVERVIEW.md`, `APP_PROGRESS.md`, `FINAL_STATUS.md`
(all deleted).** `FEATURE_LOGIC.md` and `FUTURE_LOGIC.md` remain separate —
build methodology and roadmap respectively, not current-state docs. For deep
booking-lifecycle detail (availability, checkout, payment, reschedule,
cancellation, file:line references) see `BOOKINGS.md`; for the waitlist system
see `WAITLIST.md`; for Becca see `BECCA_CAPABILITIES.md`.

**This is a living doc, like `MEMORY.md` — update it when a feature's status
changes, not just when someone remembers to.** A status marked ✅ here is a
claim about the code as of the date below; if you touch a feature, correct its
row in the same change rather than leaving it stale for the next person.

*Last verified against code: 2026-08-08.*

---

## What CERVICED is

CERVICED is a two-sided beauty & wellness marketplace (React Native/Expo +
TypeScript, Supabase backend, UK-based/£ pricing) connecting clients with
independent providers. One Supabase auth account carries two "hats" — client
and provider — toggled via an app-side active-mode flag (`activeMode`), not a
separate login. Screens, navigators, and notification routing differ by hat;
see `hat-separation-architecture` in memory for the rule that `activeMode` is
the only source of truth and `BookingContext` is client-only.

**For clients:** browse providers, search/filter, view provider profiles
(services, portfolio, reviews, availability), add multiple services across
multiple providers to a single cart, book appointments, manage/reschedule/
cancel bookings, bookmark providers, leave reviews, get notifications, and use
Becca (an in-app assistant) for guidance and quick actions.

**For providers:** build a business profile (services, pricing, portfolio,
weekly hours, blocked dates), manage a booking dashboard, run promotions, view
client/clientele history, message clients, see analytics, and configure
automations (auto-accept, buffers, waitlist, reminders, deposits).

### Tech stack (verified)

- **Framework:** Expo (React Native), TypeScript
- **Navigation:** React Navigation (native-stack + tabs), **not** Expo Router
  file-based routing — `APP_OVERVIEW.md` previously claimed Expo Router; the
  app actually uses `src/navigation/RootNavigation.tsx` → `AppNavigator.tsx`
  with hand-written stack/tab navigators, split into
  `src/navigation/client/tabs/` and `src/navigation/provider/tabs/` (see
  reorg note below). This is corrected from both prior docs.
- **State:** React Context (`AuthContext`, `CartContext`, `BookingContext`,
  `ThemeContext`, `RegistrationContext`) + Zustand stores (bookmarks, planner,
  app state)
- **Backend:** Supabase (Postgres + Auth + Storage + Edge Functions +
  Realtime). `src/services/databaseService.ts` is the **only** file allowed
  to import the Supabase client directly.
- **Payments:** Stripe, mid-migration (see Payments section below) —
  `@stripe/stripe-react-native`, `src/services/stripeService.ts`
- **Session storage:** envelope-encrypted (`largeSecureStore.ts`), not
  plaintext AsyncStorage (fixed in the 2026-08-02 security audit)

### Folder structure (current, post-reorg)

```
src/
├── components/        Shared/reusable UI
├── constants/          Static config (theme, provider themes, etc.)
├── contexts/            Auth, Cart, Booking, Theme, Registration
├── data/                 Static/lookup data
├── navigation/
│   ├── client/tabs/       HomeNavigator, ExploreNavigator, CartNavigator, BeccaNavigator, ProfileNavigator
│   └── provider/tabs/     ProviderHomeNavigator, ProviderServicesNavigator, ProviderBeccaNavigator, ProviderAccountNavigator
├── screens/
│   ├── auth/              Welcome, Login, SignUp1–5, ClaimProvider, password reset, etc.
│   ├── client/             Client-only screens
│   ├── provider/           Provider-only screens
│   └── shared/              Used by both hats (NotificationsScreen, BeccaScreen, DevSettingsScreen, etc.)
├── services/             Supabase-backed logic (databaseService.ts boundary)
├── stores/                Zustand stores
├── theme/                  Enterprise theme tokens (mostly unused — see below)
├── types/                  Shared TS types
└── utils/                  Pure helpers
```

This split (client/provider/shared/auth under both `screens/` and
`navigation/`) is the result of a full reorg — see memory
`screen-navigation-reorg.md`. Both prior docs (`LOGIC.md`, `APP_OVERVIEW.md`)
still described the pre-reorg flat structure and pre-reorg nav trees; this doc
reflects the current split.

---

## Current implementation status

Status legend: ✅ Done and verified against code · 🚧 Partial / in progress ·
⚠️ UI only (no real backing) · ❌ Not built.

### Auth & onboarding

| Feature | Status | Where |
|---|---|---|
| Sign-up (**5 steps**, same flow for client/provider, role picked mid-flow) | ✅ | `src/screens/auth/SignUpStep1Screen.tsx`–`SignUpStep5Screen.tsx`. Corrected: `LOGIC.md` described a stale 4-step flow; the actual flow has 5 screens. |
| Login (email/password) | ✅ | `src/screens/auth/LoginScreen.tsx`, `AuthContext` |
| Sign in with Apple | 🚧 known bug | `LoginScreen.tsx`/`WelcomeScreen.tsx` `handleAppleLogin` call `supabase.auth.signInWithIdToken` directly — a first-time Apple sign-in silently creates a `users` row with no name/phone/DOB and drops straight into the main app. `credential.fullName`/`credential.email` (only populated by Apple on first authorization) are read but discarded. No "logged in but profile incomplete" routing exists yet — `RootNavigation.tsx` branches on `isLoggedIn` alone. Instagram/Google buttons are inert placeholders (`Alert.alert('Coming soon')`), not a similar risk. |
| Email verification | ✅ | `src/screens/auth/EmailVerificationScreen.tsx`, edge function `confirm-email` |
| Forgot/reset password | ✅ | `ForgotPasswordScreen`, `ResetPasswordOTPScreen`, `NewPasswordScreen` |
| Session persistence | ✅ | Envelope-encrypted via `largeSecureStore.ts` (not plaintext AsyncStorage — hardened Aug 2026) |
| Provider claim flow | ✅ | `src/screens/auth/ClaimProviderScreen.tsx`, edge function `request-claim-verification` |
| Provider Acuity Scheduling import | ✅ | `src/services/acuityTransferService.ts` — imports services + pricing from an Acuity link (not a generic provider ID), does not import availability hours |
| Age verification (16+) | 🚧 | Enforced in sign-up per `LEGAL-COMPLIANCE-NOTES.md`; that file flags open legal questions around this — not a resolved item |

### Provider setup

| Feature | Status | Where |
|---|---|---|
| Provider profile creation/edit | ✅ | `src/screens/provider/ProviderMyProfileScreen.tsx` |
| Service management | ✅ | Provider profile / services screens |
| Portfolio photos | ✅ | Upload service, `portfolios/` storage bucket |
| Weekly hours + blocked dates | ✅ | `src/screens/provider/ProviderScheduleScreen.tsx` → `provider_availability`, `provider_blocked_dates` |
| Auto-accept bookings | ✅ | `ProviderAutomationsScreen.tsx` toggle → `providers.auto_accept_bookings` column, read by DB trigger `handle_new_booking()`. Confirmed still single source of truth — do not add a second toggle. |
| Waitlist automation | ✅ | `ProviderAutomationsScreen.tsx` (`waitlistEnabled`, `autoAcceptWaitlist`) — DB-trigger-owned, see `WAITLIST.md` |
| Promotions | ✅ | `ProviderPromotionsScreen.tsx` |
| Provider automations (reminders, rebook nudge, review requests, buffer time, deposit requirement, max bookings/day) | ✅ | `ProviderAutomationsScreen.tsx` |
| Provider analytics/revenue | ✅ | `ProviderAnalyticsScreen.tsx` — reads bookings/reviews |
| Clientele view / inbox / conversations | ✅ | `ProviderClienteleScreen.tsx`, `ProviderInboxScreen.tsx`, `ProviderConversationScreen.tsx` |
| Address release policy | ✅ | `providers.address_release_policy`, server-enforced via `client_bookings` view, not the app |

### Booking flow (client side) — see `BOOKINGS.md` for full detail

| Feature | Status | Where |
|---|---|---|
| Browse/search/filter providers | ✅ | `HomeScreen`, `SearchScreen`, `ExploreScreen` → `databaseService.getProviders()`, capped at `DEFAULT_PROVIDER_QUERY_LIMIT` (200) |
| Provider profile view | ✅ | `ProviderProfileScreen` |
| Add to cart (multi-provider) | ✅ | `CartContext` — reducer pattern, groups items by provider |
| Cart pricing | ✅ | `CartContext.ts:554` — service fee = `max(subtotal * 0.05, £2)`. Confirmed still exactly this formula. |
| Deposit vs full payment | ✅ | `BookingService.calculateDeposit()` — now driven by a provider-configurable `ProviderDepositPolicy` (type + amount), defaulting to 20% if unset, not a hardcoded 20% as `LOGIC.md` described |
| Date/time scheduling | ✅ | `ModernBeautyCalendar` → `AvailabilityService.getAvailableSlots()`, real provider hours from Supabase, filters booked slots via `get_provider_busy_spans` RPC |
| Slot intervals, booking window, min notice, buffer time | ✅ | `providers.slot_interval_mins` / `booking_window_days` / `min_booking_notice_hrs` / `buffer_mins` |
| Checkout availability re-check | ✅ | `AvailabilityService.isSlotAvailable()` queries Supabase at checkout |
| Checkout slot hold | ✅ | 10-minute `on_hold` reservation during payment, TTL cron backstop (see memory `cart-checkout-slot-hold`) |
| Booking created in Supabase | ✅ | `BookingContext.createBookingsFromCart()` → `databaseService.createBooking()` |
| Booking confirmation notification + email | ✅ | DB-trigger-owned notification + `sendEmail()` fire-and-forget |

### Payments — corrected, this is the most stale part of the old docs

`APP_PROGRESS.md` said payment gateway was "❌ Not started." That is no
longer accurate. The actual state, verified in `src/screens/client/
CartScreen.tsx` and `src/services/stripeService.ts`, is a **deliberate
mid-migration**:

| Component | Status | Where |
|---|---|---|
| Mock `PaymentModal` (raw card fields, fake instant success, no real charge) | 🚧 still present | `CartScreen.tsx` — collects card data itself, not PCI-compliant. CLAUDE.md flags this must not be extended as if production-ready. |
| Real Stripe PaymentIntent flow (`StripePaymentModal`, native Payment Sheet: card/Apple Pay/Google Pay) | ✅ built, test-mode | `stripeService.ts`, edge functions `create-payment-intent` / `finalize-payment-intent`, `@stripe/stripe-react-native` |
| Which one runs | Toggled by a `USE_STRIPE_PAYMENTS` flag in `CartScreen.tsx` (`ActivePaymentModal = USE_STRIPE_PAYMENTS ? StripePaymentModal : PaymentModal`) — Expo Go can't run the real Stripe module (no native module), so the mock stays wired for that environment | `CartScreen.tsx` |
| `payments` / `earnings` tables | Per `stripe-payment-intent-integration` memory, this landed on main 2026-08-02 and per CLAUDE.md still needs `cerviced-security-review` + `cerviced-legal-flagger` before treating it as launch-ready | — |

**Do not describe payment as either "fully mock" or "fully real Stripe" —
both code paths exist simultaneously on purpose.**

### Post-booking

| Feature | Status | Where |
|---|---|---|
| Client bookings list | ✅ | `BookingsScreen` |
| Reschedule (RPC-only, forgery-hardened) | ✅ | `respond_to_reschedule_request`, `provider_initiate_reschedule` RPCs — see memory `reschedule-request-rls-forgery-fixed` |
| Provider booking detail/history, accept/decline | ✅ | `ProviderBookingDetailScreen`, `ProviderBookingHistoryScreen` |
| Real-time booking status sync | ✅ | `BookingContext` subscribes to Supabase realtime on `bookings` |
| Leave a review | ✅ | `BookingsScreen` → `submitReview()` / `hasReviewedBooking()` |
| Push notifications | ✅ | `pushNotificationService.ts`, edge function `send-push-notification`. Note: it reads the push *ticket*, not the delivery *receipt*, so failed deliveries are currently silent (memory `push-notification-receipt-blindspot`) |
| Booking status values | ✅ | `BookingStatus` enum: `upcoming` / `in_progress` / `completed` / `cancelled` / `no_show` — always map raw DB status through `mapDbBookingStatus()`, never cast directly |
| Notification types | ✅ | Real DB-backed enum in `src/types/database.ts`, far larger than the 6-item list in old `LOGIC.md`: booking pending/confirmed/declined, reschedule request/response/confirmed/declined, review request/received, promotion, waitlist_slot_available, address_released, and more |

### AI (Becca)

| Feature | Status | Where |
|---|---|---|
| Becca assistant | ✅ deterministic capability layer, **no LLM** | `src/services/becca/` — registry + entity resolver + engine. `BECCA_CAPABILITIES.md` is authoritative; both old AI services (`aiChatService.ts`, `enhancedAIChatService.ts`) were deleted 2026-08-04 and never actually called an LLM despite what old `LOGIC.md` implied |
| Chat history persistence | ✅ | `beccaStorageService.ts`, `chat_messages` table |
| Conversation context across turns | ✅ | Landed recently (commit `775d069`) |
| User learning/personalization feeding home feed | ✅ | `userLearningService.ts` |

### Points/loyalty

| Feature | Status | Where |
|---|---|---|
| Points screen UI | ⚠️ UI only, confirmed unchanged | `src/screens/client/PointsScreen.tsx` — `const balance = 0;` is hardcoded, "How to earn"/"Redeem" lists are static copy, no `points` table, nothing awards or reads points on booking/review/referral. Still exactly as `APP_PROGRESS.md` described. |

### Infrastructure

| Feature | Status | Notes |
|---|---|---|
| Supabase auth + RLS | ✅ | Hardened Aug 2026 — `has_gone_live` gating fixed on 10 tables that were previously app-convention-only; see memory `security-audit-2026-08-02-rls-hardening` |
| Bookings/notifications DELETE | ❌ by design | No RLS DELETE policy — client-side delete is a silent no-op; use a SECURITY DEFINER RPC |
| Double-booking prevention | ✅ live | `bookings_no_overlap` constraint, future-only scope; 7 historical conflicts grandfathered (memory `booking-overlap-constraint-undeployed`) |
| Edge functions | ✅ | `confirm-email`, `create-payment-intent`, `finalize-payment-intent`, `extract-provider-profile`, `request-claim-verification`, `run-scrape-job`, `send-email`, `send-push-notification` |
| SQL migration tracking | ⚠️ known gap | Most of `supabase/*.sql` has no run/not-run record; a file's existence or absence from `RUN_ALL_MIGRATIONS.sql` is a signal, not proof — see `cerviced-migration-drift` agent before trusting any one file |

### Not yet implemented (carried forward, still accurate)

- Multi-staff/multiple team members per provider (one provider = one schedule)
- Intake form embedded as a checkout step (exists, but only auto-sent post-booking today)
- Points/loyalty backing (table + award logic)
- Advisory lock for concurrent-booking races beyond same-start-time (unique index covers same-start-time only)
- Privacy Policy screen (see `LEGAL-COMPLIANCE-NOTES.md`)

---

## Core logic flows worth remembering

Condensed from old `LOGIC.md` — kept only what's non-obvious (why something
works the way it does, or a gotcha), not a restatement of what the code
plainly does.

### Auth & hats
Both client and provider are the same Supabase auth account. `activeMode` is
the *only* source of truth for which hat is active — never infer it from the
screen stack or a stored role field. `BookingContext` is client-only; reading
it from a provider screen is a bug, not a shortcut. Shared screens (under
`src/screens/shared/`) need data-level branching by hat, not just label
changes.

### Home feed personalization
Scoring blends category affinity, provider affinity, time-of-day match, and
interaction recency, weighted `0.4/0.3/0.1/0.2`. Interaction weights: VIEW=1,
SEARCH=2, OFFER_VIEW=3, FAVORITE=5, BOOK=10. This part of old `LOGIC.md`
described interactions as AsyncStorage-only with Supabase sync as "future" —
worth re-verifying if you touch `userLearningService.ts`, since that framing
may itself now be stale.

### Booking status & provider identity — known traps
Always map raw DB status strings through `mapDbBookingStatus()`; a raw cast
silently produces an unmatched status. There are still two divergent
provider-name sources (the `users` table and the `providers` table) that have
caused real bugs before (mismatched names between a client's booking card and
the provider's own dashboard) — if you're touching anything that renders a
provider name on a booking, check which source it's reading from. This is
`cerviced-booking-domain`'s lane in depth.

### Notifications are DB-trigger-owned, not app-owned
Status-change notifications and waitlist invites are created by Postgres
triggers (`supabase/booking_flow_fixes.sql` and related), not by app code
calling a notification service after a mutation. Never add an app-side
notification call for something a trigger already fires — that's how the
group-booking notification dedup bug happened (fixed 2026-08-08, keyed on
`group_booking_id` now).

### Address release is server-enforced
Clients read the `client_bookings` view, which masks the full address until
policy-released — the app is not the enforcement point, the database is.
Never send `provider_private_details` or a full street address to a
client-facing query directly.

### Deposits/balances — a deliberate liability boundary
The app never tracks or verifies an off-app balance payment between client
and provider (e.g. confirming a cash deposit's remaining balance was
collected in person). A "mark balance collected" feature existed and was
removed on purpose — see the Terms & Conditions "Deposits & Remaining
Balances" clause. Don't rebuild anything that has the app attest to
off-platform payment status.

The same reasoning removed two provider reminders on 2026-08-21: "Payment
Not Collected" (`balance_reminder`) and "Appointment Not Started"
(`booking_not_started`). Neither could verify what it claimed. See
`docs/vault/Notifications.md`.

### Theme system — two exist, only one is real
`src/theme/tokens.ts` + `useEnterpriseTheme()` exists but almost nothing uses
it. The actual convention, used everywhere, is per-screen `const L = {...}` /
`const D = {...}` palette literals, documented in `DESIGN_SYSTEM.md`. Follow
that pattern for new screens; don't invent a third one.

### iOS Liquid Glass tab bar
`Platform.OS === 'ios'` + version check gates a frosted-glass native tab bar
vs. the standard tab bar on older iOS. The old `FINAL_STATUS.md` documented
this as an open question ("wait for Expo SDK 55+ vs. custom native module vs.
BlurView approximation") from a past migration writeup — that doc is now
deleted as obsolete; if you need the current answer, check
`NativeGlassPillTabBar` in `src/components/` directly rather than assuming
that old writeup's options list is still the live decision space.

### Data persistence layers
Three layers, in order of durability: in-memory (Context/Zustand, cleared on
restart) → AsyncStorage/SecureStore (session, preferences, theme — cleared
only by user action) → Supabase (source of truth for bookings, providers,
payments, chat, reviews). Session token specifically is envelope-encrypted,
not plaintext AsyncStorage.

---

## What changed since the old docs were written (why this file exists)

- Full screens/navigation reorg into `client/`/`provider/`/`shared/`/`auth/`
  (memory `screen-navigation-reorg`) — both old docs still showed pre-reorg
  paths and nav trees.
- Sign-up went from the 4-step flow `LOGIC.md` described to 5 steps
  (`SignUpStep1–5Screen.tsx`).
- Real Stripe PaymentIntent integration landed alongside the mock flow —
  `APP_PROGRESS.md`'s "Payment gateway: Not started" is no longer true; it's
  mid-migration, not absent.
- Becca was rebuilt from scratch as a registry+resolver+engine architecture;
  the old AI chat services referenced in `LOGIC.md` were deleted.
  `BECCA_CAPABILITIES.md` is authoritative now, not this file.
- Deposit percentage moved from a hardcoded 20% to a provider-configurable
  policy.
- Notification types expanded substantially beyond the 6 `LOGIC.md` listed.
- Session storage was hardened from plaintext AsyncStorage to envelope
  encryption.
- RLS `has_gone_live` gating was fixed live across 10 tables that were
  previously enforced only by app convention.
- 2026-08-18: "Login" row split out Sign in with Apple as a separate, known
  bug (not folded into a blanket ✅) — first-time Apple sign-in bypasses the
  5-step signup flow entirely via `signInWithIdToken`, creating a `users` row
  with no name/phone/DOB. Confirmed by reading `LoginScreen.tsx`,
  `WelcomeScreen.tsx`, `AuthContext.tsx`, `EmailVerificationScreen.tsx`, and
  `RootNavigation.tsx` directly — not previously documented here.
