# CERVICED — Complete Logic Map

**Purpose:** a source-derived map of every logical system in CERVICED, across both hats. This is an index of behaviour, not a product wish-list. Follow the linked code/module indexes for individual functions and routes.

## 1. Runtime shape

```
Expo app boot
  └─ Auth → Theme → Registration → Font → Cart → Booking state
       └─ Root navigation
            ├─ Client hat: Becca / Explore / Home / Cart / Profile
            └─ Provider hat: Becca / Home / My Services / Profile
                 └─ services → Supabase (RLS, RPCs, triggers, cron, Edge Functions)
```

- Boot loads fonts, bookmarks and settings; initializes Sentry without PII/session replay; conditionally mounts Stripe outside Expo Go.
- Global state: `AuthContext`, `ThemeContext`, `RegistrationContext`, `FontContext`, `CartContext`, `BookingContext`.
- Persistent local state includes cart, booking cache, active hat, Becca history, bookmarks, preferences and biometric credentials where enabled. Supabase remains the intended source of truth for account, booking and business data.
- The app has **65 screens, 73 routes, 27 service modules, 38 DB tables, 81 DB functions, 28 triggers, 100 RLS/storage policies and 22 cron jobs** at the time this map was written. See [[Code Index]].

## 2. Entry, identity and account lifecycle

### Unauthenticated
- Welcome, login, password reset/OTP/new-password, email verification and signup wizard.
- Signup chooses `user` (Client) or `provider`; email verification creates/updates the public user record.
- Biometric login stores/refreshes a secure auth credential only when device capability and user opt-in allow it.
- A user can claim an imported/unclaimed provider listing: search listing → request verification → retain pending claim → claim profile.

### Account state
- A database user row has one dominant DB role: `user` or `provider`.
- Dual-hat is inferred: a provider can also have client profile data, and a client can upgrade in place to provider.
- `activeMode` is a device-local UI mode. Switching shows a transition and swaps the complete tab/navigation tree; it does not re-authenticate or write a server-side mode.
- Client → Provider: resumes registration, updates role/business fields, then profile save creates/upserts the provider row.
- Provider → Client: creates/updates client beauty/profile data on the same account.
- Account deletion has two scopes: delete one hat immediately, or request full-account deletion with a 30-day reactivation grace period. Scheduled deletion processing and a reactivation screen handle the grace state.

### Security/privacy identity rules
- Private provider full address is separated from the public provider record.
- Public user/profile access uses narrowed functions rather than broad users-table reads.
- Media storage uses owner-write/public-or-owner-read rules by asset class.

Sources: `AuthContext`, `biometricService`, `providerClaimService`, `providerRegistrationService`, `account_deletion_grace_period.sql`, `delete_account.sql`, `storage_policies.sql`.

## 3. Client hat — discovery and consideration

### Home and Explore
- Home sections are configuration-driven (`homeSections`) and surface categories, curated discovery and provider content.
- Explore/Search supports category/text queries, location/distance, provider/service results, portfolio browsing and search-event tracking.
- Discovery rankings include new, trending and top-rated providers; the trending view/RPC derives this data server-side.
- Provider profile presents branding, portfolio, services and add-ons, price/deposit/consultation details, availability, reviews, promotions, contact/chat, location policy and booking entry points.
- Only providers intended to be live should appear client-facing; current query filtering is an important enforcement dependency.

### Relationship and inspiration
- Bookmark/save providers; follow/unfollow providers; inspect bookmark/follower counts.
- Save/unsave portfolio looks and view saved details.
- Browse/search portfolio inspiration and image details.
- User interaction/search history feeds personalization (`userLearningService`) and promotion-interest targeting.
- Offers lists active promotions; promo validation applies eligible discounts in cart/checkout.

### Client profile and preferences
- Personal details, DOB/contact, beauty profile, health/profile flags, preferences, notifications, payments, subscription, points, billing and settings screens.
- Health/contraindication data is form/profile data; it is not a treatment-safety decision engine.
- Event planning has plans, tasks and checklist items, surfaced via database APIs and Becca account/event capabilities.

## 4. Client hat — cart, checkout and booking

### Cart
- Cart supports multiple providers, services, repeated service instances, options/add-ons, quantities, notes, promo codes, date/time and deposit-only intent.
- Items are grouped by provider for rendering and provider totals, but the cart can be checked out across providers.
- Cart computes display totals, service charges and summaries locally; it persists locally before checkout.

### Single and multi-service selection
- `BookingSheet`: one service, slot, add-ons, notes and deposit-policy acknowledgement.
- `MultiBookingSheet`: multiple services from one provider. It finds back-to-back availability chains for services kept together; the client can move individual services into separate schedules.
- Grouped services get the same local `bookingBatchId`. At checkout, a batch of more than one becomes a provider-scoped `group_booking_id`, with count metadata. Items scheduled separately and separately-added services remain single bookings.
- Partial checkout failure reconciles group metadata so surviving bookings do not claim missing siblings.

### Checkout and booking creation
1. Soft client preflight checks slot conflicts/cap conditions and may place temporary cart-slot holds.
2. Checkout creates one booking row per cart item, plus booking add-ons and snapshots.
3. The database validates bookability; rejected rows are left in cart with the returned reason while successful rows become local/remote bookings.
4. A provider auto-accept setting can result in confirmed status; otherwise booking starts pending.
5. New booking/status triggers create instructions, forms/info packs, notifications, reminders and other automation as configured.

### Booking status and detail
- DB statuses include pending, confirmed, in-progress, completed, cancelled, no-show and waitlist-only `on_hold`; app display maps confirmed to `upcoming`.
- Client booking lists split today/upcoming/history, support refresh/pagination, booking detail, action items, information packs, intake forms, tips, reviews, chat and rebook paths.
- A client can submit a review once eligible; database logic updates provider ratings and notifies the provider.

### Payment boundary
- The app supports saved payment methods, Stripe payment-intent creation/finalization/capture/cancellation, deposits, service charge, booking tips and transaction records.
- It does **not** safely attest to cash/off-platform balances or refunds. “Amount paid”, deposit and remaining balance are booking fields, but not proof of money collection outside the processor.
- Current booking money values are substantially client-computed at checkout; server-side recomputation/transition enforcement remains a major hardening need.

Sources: `CartContext`, `BookingContext`, `BookingSheet`, `MultiBookingSheet`, `CartScreen`, `checkoutService`, `stripeService`, `bookingService`, `databaseService`.

## 5. Availability, waitlist, rescheduling and cancellation

### Availability
- Providers have recurring availability, availability windows, overrides, blocked dates, scheduling settings, booking window/minimum notice and service/provider buffers.
- `AvailabilityService` calculates display slots from those constraints plus bookings; provider schedule UI edits them.
- `enforce_booking_bookability` is the write-time authority: prevents past/out-of-window/out-of-hours/blocked/overlapping bookings.
- An effective-range exclusion constraint backs up overlap protection. Buffer enforcement differs between client calculation and server overlap enforcement, which is a documented inconsistency.

### Cart slot holds and waitlist holds
- Cart checkout can create short-lived temporary slot holds and then claim/release them.
- Waitlist supports provider/service/date preference and queue position.
- When a slot frees, the server selects the best eligible entry and either auto-books or creates an exclusive three-hour `on_hold` booking. Claiming turns it into a real booking; declining/expiry cancels it and offers the next candidate.

### Rescheduling
- Client requests preferred date/time choices through a server RPC. Server guards ownership, notice/cooldown/cap and active-request conditions.
- Provider can respond with available slots, reject the request, or initiate a reschedule with alternatives.
- Client accepts an offered slot through a server RPC, which updates booking time and reschedule counters; declining preserves the original booking.
- Both booking detail experiences subscribe to reschedule realtime changes to avoid stale UI.

### Cancellation
- Client cancellation is server-RPC controlled and checks provider notice requirements.
- Provider cancellation/decline is scoped to their own booking and notifies the client.
- Cancellation copies state the deposit paid and provider policy, but do not promise a fee/refund outcome that the platform cannot verify.

## 6. Client hat — communication and follow-up

- Provider chat gets/creates a conversation, sends messages, marks messages read and sends a trigger-owned push/in-app notification.
- Messages screen gives the client their conversations; notification screen handles list/read-all/read/delete actions and deep-link routing.
- Clients complete intake forms, see pending form action items, access booking-attached info packs and mark packs viewed.
- Rebookable service/history helpers reopen provider booking journeys.
- Push setup registers/unregisters Expo tokens; notification tap handling changes hat if required and opens the correct booking/chat/form/history screen.

## 7. Provider hat — onboarding, public presence and services

### Provider onboarding/go-live
1. Register/upgrade or claim a business.
2. Save provider identity, business type, public profile, contact/branding and geocoded private address.
3. Add services, images, add-ons, service categories/descriptions, buffers and consultation/deposit policies.
4. Configure at least one availability window.
5. `check_and_set_provider_live` makes the provider live once service, schedule and address requirements are met.

### Profile/business management
- Public business profile, logo/background, provider theme/palette, business details, account info, branding, contact/email and external booking link.
- Acuity transfer can import profile information from a valid Acuity source.
- Provider profile protects full address, publishing only approximate location until a booking-specific address release permits disclosure.

### Services and portfolio
- Provider creates/updates/replaces services, categories, duration/pricing, add-ons and images.
- Portfolio upload/delete and categorization, profile presentation and public portfolio view.
- Consultation service/required setting and deposit/payment policies influence booking UI.

## 8. Provider hat — operations

### Daily operations
- Provider dashboard/calendar reads bookings by date/range, availability and current/next bookings.
- Booking detail supports confirm/decline/cancel, allowed status changes, client address handling for mobile appointments, address release, group siblings, tips, forms, info packs, client contact and rescheduling.
- History groups bookings, includes waitlist management and supports booking-detail drill-down.
- Schedule manages recurring windows, per-date overrides, blocked dates/time off, buffers, min notice, booking window and daily booking cap.

### Clients, forms and information
- Clientele shows provider-owned customer/history data and supports rebook prompts.
- Form library creates/edits/deletes reusable intake forms, sends a selected form for a booking/client and reads completed responses.
- Info packs are authored, attached automatically or manually to bookings, and tracked for client viewing.

### Communications, promotions and reach
- Inbox/conversations with filters; individual provider messages and read markers.
- Communications supports announcements and outreach with suppression safeguards.
- Promotions support create/edit, activation/deactivation, schedules, audience targeting, direct promo sends and promotion notification delivery.
- Followers, reviews, provider reach and audience logic feed provider views/analytics.

### Automations and analytics
- Provider settings control auto-accept, booking caps, reminders and related booking automation configuration.
- Provider analytics/reporting reads booking/service/client data within provider scope.
- Server cron jobs create pending warnings, stale-reschedule reminders, unread-message reminders, daily recap, booking reminders, fully-booked alerts and other operational notifications.

## 9. Shared Becca logic

- Becca uses a deterministic capability registry, matcher, entity resolver, confidence bands and conversation storage—**not an LLM**.
- Entity resolution identifies provider, booking, service, date/time and money references from a message using real app data.
- Low confidence must ask/offer chips; it must not invent an answer.
- Client registry exposes booking, discovery, availability, deal, review, saved-provider, waitlist, messages, notifications, profile, event and navigation capabilities.
- Provider registry exposes today/week, waitlist, clients, inbox, forms, promos, lapsed clients, services, notifications, time off, reviews, hours, capacity, reach, address, availability, analytics, automations, info packs and help capabilities.
- Hat gating is strict: Provider Becca uses an isolated navigator that cannot route to client booking/cart/profile screens.
- Becca cannot give treatment/medical safety opinions, bypass data access, reveal unreleased data, invent prices/slots/policies, or assert off-platform payment facts.

Sources: [[BECCA_CAPABILITIES]] and `src/services/becca/`.

## 10. Shared system logic

### Notifications, email and push
- Database triggers/functions own booking, reschedule, cancellation, review, intake-form, info-pack, address-release and chat notification creation.
- Notification inserts trigger Expo push via Edge Function; the app renders/marks/deletes the in-app notification row and routes taps.
- Edge Functions cover push, email, email confirmation, payment intents/finalization, provider-profile extraction, claim verification and scrape job execution.
- Email templates/services include client/provider welcome, booking confirmation/reminder and provider new-booking mail.

### Address release
- Provider selects policy: always, on confirmation, multiple time-before variants or manual.
- Full address/coordinates are copied to each booking as a snapshot at creation.
- The `client_bookings` view masks the snapshot until policy says released; clients should never receive it early.
- Release happens on confirmation, manual provider action or timed cron; a shared helper de-duplicates the client notification.

### Theme, UX and resilience
- Theme context manages light/dark/legacy/enterprise tokens; provider public themes can be fixed independently from the viewer theme.
- App boot handles font/splash lifecycle; safe area, gesture root, error boundary and status blur wrap all screens.
- Sentry excludes default PII and session replay. Logger, network/performance monitoring and image loaders support diagnostics and responsiveness.
- Dev Settings is explicitly test/dev tooling: test push/receipts and role-scoped reset RPCs.

## 11. Server authority map

| Decision | Primary authority |
|---|---|
| Who may read/write a row or media asset | RLS/storage policies |
| Address visibility | `client_bookings` view + address-release functions |
| Slot bookability/overlap | `enforce_booking_bookability` trigger + exclusion/unique constraints |
| Waitlist reservation | waitlist RPCs + `on_hold` booking rows + expiry cron |
| Reschedule/cancel ownership and rules | dedicated SECURITY DEFINER RPCs |
| Notifications/automatic side effects | booking/chat/form/review/address triggers + cron |
| Provider go-live | service/schedule/address triggers/functions |
| Push/email delivery | notification trigger → Edge Functions |

## 12. Known implementation gaps / audit priorities

1. Payment fields and some booking state are client-supplied; reprice and constrain transitions server-side.
2. Client visibility of providers depends on every query filtering `has_gone_live`; put it in RLS/gated views.
3. Fresh-environment migration bundle is incomplete for go-live gates and waitlist holds.
4. Time-based address release uses UTC rather than provider timezone.
5. Booking-buffer enforcement is not identical in display calculation and server overlap prevention; non-identical concurrent overlap remains a risk.
6. Role upgrade can temporarily leave `role=provider` without a provider row.
7. Local documentation/source was inspected; deployed Supabase migration drift still requires a live-environment audit.

## 13. Exhaustive source indexes

- **Every screen and feature entry:** [[Screens (generated)]] and [[Screen Flow (generated)]].
- **Every route and navigation edge:** [[Routes (generated)]] and [[Navigation Graph (generated)]].
- **Every context, service export and function:** [[Contexts (generated)]], [[Services (generated)]] and [[Function Index (generated)]].
- **Every table, view, RPC, trigger, policy and cron job:** [[Database Objects (generated)]].
- **Feature-to-file ranking:** [[Feature Map (generated)]].

This last section is the individual-function-level companion to this map: it is generated from source, so it is the place to inspect any specific behaviour without relying on a hand-maintained summary.
