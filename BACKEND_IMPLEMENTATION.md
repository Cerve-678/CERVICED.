# CERVICED — Complete Backend Implementation Plan

## App Overview
Beauty services marketplace. Two user types: **Consumers** (browse, book, review) and **Providers** (list services, manage bookings, set availability). Currently ~100% hardcoded. All data must migrate to Supabase.

---

## Database Tables & Columns Required

### Core Identity

**`users`** *(already exists, extend it)*
- `id` (uuid, FK to auth.users)
- `email`
- `full_name`
- `phone`
- `avatar_url`
- `role` ('user' | 'provider')
- `service_interests` (text array, e.g. ['HAIR', 'NAILS'])
- `expo_push_token` (for push notifications)
- `created_at`, `updated_at`

---

### Provider Side

**`providers`**
- `id` (uuid)
- `user_id` (FK → users)
- `slug` (unique, URL-safe, e.g. "styled-by-kathrine")
- `display_name`
- `service_category` ('HAIR' | 'NAILS' | 'LASHES' | 'BROWS' | 'MUA' | 'AESTHETICS' | 'MALE' | 'KIDS' | 'OTHER')
- `custom_service_type` (text, when OTHER)
- `location_text` (e.g. "North West London")
- `latitude`, `longitude`
- `about_text`
- `slots_text` (e.g. "Slots out every 30th of the month")
- `logo_url`
- `gradient` (text array, 2–3 hex colours)
- `accent_color` (hex string)
- `phone`, `email`
- `rating` (numeric, auto-computed from reviews)
- `review_count` (int, auto-computed)
- `years_experience`
- `is_active`, `is_featured`, `is_verified`
- `created_at`, `updated_at`

**`provider_specialties`**
- `id`, `provider_id` (FK → providers), `specialty` (text)

**`services`**
- `id` (uuid)
- `provider_id` (FK → providers)
- `category_name` (sub-category label, e.g. "Box Braids", "Knotless")
- `name`
- `description`
- `price` (numeric, base price)
- `price_max` (numeric, null if fixed — for price ranges)
- `duration_minutes` (int)
- `is_active`, `sort_order`
- `created_at`

**`service_images`**
- `id`, `service_id` (FK → services), `url`, `sort_order`

**`service_add_ons`**
- `id`, `service_id` (FK → services), `name`, `price`, `description`, `is_active`

**`provider_availability`**
- `id`
- `provider_id` (FK → providers)
- `day_of_week` (0=Sun … 6=Sat)
- `open_time`, `close_time` (time)
- `is_closed` (boolean)

**`provider_blocked_dates`**
- `id`, `provider_id` (FK → providers), `blocked_date` (date), `reason` (optional text)

---

### Portfolio

**`portfolio_items`**
- `id` (uuid)
- `provider_id` (FK → providers)
- `service_id` (FK → services, nullable)
- `image_url`
- `caption`
- `category` (matches service_category enum)
- `tags` (text array)
- `price` (numeric, optional — starting price shown on Explore card)
- `aspect_ratio` (numeric, for masonry grid layout)
- `is_featured` (boolean)
- `created_at`

---

### Bookings

**`bookings`**
- `id` (uuid)
- `user_id` (FK → users)
- `provider_id` (FK → providers)
- `service_id` (FK → services)
- `status` ('pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show')
- `booking_date` (date), `booking_time` (time), `end_time` (time)
- `notes` (text), `booking_instructions` (text, from provider)
- `payment_type` ('full' | 'deposit')
- `base_price` (numeric), `add_ons_total` (numeric), `service_charge` (numeric)
- `deposit_amount` (numeric), `amount_paid` (numeric), `remaining_balance` (numeric)
- `payment_status` ('pending' | 'deposit_paid' | 'fully_paid' | 'refunded')
- `payment_method` (text), `payment_intent_id` (text — Stripe reference)
- `is_group_booking` (boolean), `group_booking_id` (uuid), `group_booking_count` (int)
- `provider_name_snapshot`, `service_name_snapshot` (denormalized, frozen at booking time)
- `provider_address_snapshot`, `provider_phone_snapshot`, `provider_coordinates` (jsonb)
- `confirmed_at`, `created_at`, `updated_at`

**`booking_add_ons`**
- `id`, `booking_id` (FK → bookings), `add_on_id` (FK → service_add_ons)
- `name_snapshot`, `price_snapshot` (frozen at booking time)

**`booking_reschedule_requests`**
- `id`, `booking_id` (FK → bookings)
- `requested_by` ('user' | 'provider')
- `original_date` (date), `original_time` (time)
- `requested_dates` (date array)
- `provider_available_slots` (jsonb: [{date, times[]}])
- `status` ('pending' | 'provider_responded' | 'confirmed' | 'rejected')
- `reschedule_count` (int)
- `created_at`, `updated_at`

---

### Reviews

**`reviews`**
- `id` (uuid)
- `booking_id` (FK → bookings, unique — one review per booking)
- `user_id` (FK → users), `provider_id` (FK → providers), `service_id` (FK → services)
- `rating` (int, 1–5)
- `comment` (text)
- `tip_amount` (numeric, nullable)
- `created_at`

---

### Notifications

**`notifications`**
- `id` (uuid)
- `user_id` (FK → users — the recipient)
- `type` ('booking_confirmed' | 'booking_reminder' | 'payment_success' | 'booking_cancelled' | 'new_provider' | 'reschedule_request' | 'reschedule_response' | 'reschedule_confirmed' | 'promotion' | 'review_request')
- `title`, `message`
- `priority` ('high' | 'medium' | 'low')
- `is_read` (boolean), `is_actionable` (boolean)
- `booking_id` (FK → bookings, nullable)
- `provider_id` (FK → providers, nullable)
- `promotion_id` (FK → promotions, nullable)
- `created_at`

---

### Bookmarks

**`bookmarks`**
- `id`, `user_id` (FK → users), `provider_id` (FK → providers), `created_at`
- UNIQUE constraint on (user_id, provider_id)

---

### Promotions / Offers

**`promotions`**
- `id` (uuid), `provider_id` (FK → providers)
- `title`, `description`
- `discount_text` (e.g. "20% OFF")
- `discount_percent` (numeric, nullable), `discount_amount` (numeric, nullable)
- `service_category` (for filtering by tab on HomeScreen)
- `valid_from` (date), `valid_until` (date)
- `is_active` (boolean), `created_at`

---

### Event Planner (Consumer "My Plans")

**`event_plans`**
- `id` (uuid), `user_id` (FK → users)
- `name`, `event_date` (date)
- `goal_portfolio_item_id` (FK → portfolio_items, nullable)
- `is_active` (boolean), `created_at`, `updated_at`

**`event_tasks`**
- `id`, `event_plan_id` (FK → event_plans)
- `portfolio_item_id` (FK → portfolio_items, nullable)
- `provider_id` (FK → providers, nullable), `service_id` (FK → services, nullable)
- `provider_name`, `service_name`, `category`
- `scheduled_date` (date, nullable)
- `status` ('pending' | 'booked' | 'completed')
- `sort_order`

**`event_checklist_items`**
- `id`, `event_plan_id` (FK → event_plans)
- `text`, `category`, `is_completed` (boolean), `sort_order`

---

### Payments (Stripe)

**`payment_methods`**
- `id`, `user_id` (FK → users)
- `stripe_payment_method_id`, `card_brand`, `last_four`
- `exp_month`, `exp_year`, `is_default` (boolean), `created_at`

**`transactions`**
- `id`, `booking_id` (FK → bookings)
- `user_id` (FK → users), `provider_id` (FK → providers)
- `stripe_payment_intent_id`
- `amount` (numeric), `currency` ('gbp')
- `status` ('pending' | 'succeeded' | 'failed' | 'refunded')
- `type` ('full' | 'deposit' | 'remaining' | 'tip' | 'refund')
- `created_at`

---

## Implementation Phases

---

### Phase 1 — Database Foundation
**Goal**: All tables created in Supabase with correct types, relationships, indexes, and RLS policies. Seed existing hardcoded providers.

**What this unlocks**: Everything. Nothing else can be built without this.

Tasks:
- Create all tables and foreign key relationships in Supabase SQL editor
- Add indexes on high-query columns (user_id, provider_id, booking_date, status)
- Write RLS policies:
  - Consumers can read providers, services, portfolio, promotions (public reads)
  - Consumers can read/write ONLY their own bookings, bookmarks, notifications, event plans, reviews
  - Providers can read/write their own provider row, services, portfolio, availability, promotions
  - Providers can read bookings where provider_id matches their provider row
  - Providers can update status on their own bookings only
  - No user can read another user's private data
- Create Supabase Storage buckets: `provider-logos`, `service-images`, `portfolio`, `avatars` (all public reads, authenticated writes)
- Seed the 16+ existing hardcoded providers with real data (upload logos to Storage, insert rows)
- Fix role constraint: add 'provider' value (currently missing from check constraint)

---

### Phase 2 — Provider Registration → Supabase
**Goal**: Provider signup and profile building saves to Supabase instead of AsyncStorage.

**Screens affected**: `InfoRegScreen`, `ProviderMyProfileScreen`

Tasks:
- On InfoRegScreen save: upload logo to `provider-logos` Storage bucket, get public URL
- Upload all service images to `service-images` bucket
- Upsert `providers` row, insert/upsert `services`, `service_images`, `service_add_ons` rows
- Replace all AsyncStorage `@provider_reg_data` reads/writes with Supabase fetch/upsert
- `ProviderMyProfileScreen` loads provider data from Supabase by `user_id`
- `ProviderHomeScreen` reads provider's own ID from Supabase to scope booking queries

---

### Phase 3 — Home & Explore — Real Provider Data
**Goal**: HomeScreen and ExploreScreen show live providers, services, and portfolio from Supabase. Replace all hardcoded arrays.

**Screens affected**: `HomeScreen`, `ExploreScreen`, `ProviderProfileScreen`, `BookmarkedProvidersScreen`

Tasks:
- `HomeScreen`: fetch providers from `providers` table, grouped by service_category; fetch active promotions from `promotions` table; replace all 18 hardcoded `sampleProviders[]` and 10 `allOffers[]`
- Fix navigation param bug: all screens pass `providerId` (slug) to ProviderProfile — remove old `providerLogo/providerName/providerService` params
- `ProviderProfileScreen`: fetch provider by slug from Supabase including services, service_add_ons, service_images — replace giant hardcoded `getProviderData()` switch
- `ExploreScreen` Discover tab: fetch `portfolio_items` joined with `providers` from Supabase; keep daily-seeded masonry shuffle on the client
- `BookmarkedProvidersScreen`: query `bookmarks` joined to `providers` filtered by `user_id`
- Add loading states and empty states for all list screens
- Add pagination / infinite scroll on provider and portfolio lists

---

### Phase 4 — Availability & Real Booking Flow
**Goal**: Real time slot availability, bookings written to Supabase, providers see customer bookings in their calendar.

**Screens affected**: `CartScreen`, `BookingsScreen`, `ProviderHomeScreen`, `ProviderBookingDetailScreen`

Tasks:
- Add availability setup UI in provider portal (writes to `provider_availability` and `provider_blocked_dates`)
- `CartScreen` date/time picker: fetch available slots from `provider_availability`, subtract already-confirmed booking times from `bookings` table to show only truly open slots
- On checkout: insert `bookings` row + `booking_add_ons` rows to Supabase; remove BookingContext AsyncStorage persistence
- `BookingsScreen` (consumer): fetch user's bookings from Supabase in real-time (Supabase Realtime subscription) — replaces AsyncStorage
- `ProviderHomeScreen` calendar: fetch provider's bookings from Supabase filtered by `provider_id`; delete `generateMockBookings()`
- `ProviderBookingDetailScreen`: fetch and update booking status in Supabase
- Reschedule flow: reads/writes `booking_reschedule_requests` table
- Both consumers and providers now see the same booking data in real-time

---

### Phase 5 — Real-Time Notifications
**Goal**: Notifications are stored in Supabase, triggered automatically by booking events, and arrive in the app via Supabase Realtime.

**Screens affected**: `NotificationsScreen` (consumer + provider)

Tasks:
- Set up Supabase Database Triggers:
  - On booking confirmed → notify provider ("New booking from [name]") + notify user ("Booking confirmed")
  - On booking status → 'cancelled' → notify both parties
  - On reschedule request insert → notify provider
  - On reschedule provider response → notify user
  - On booking completion → notify user with review request (after 1 hour)
- Schedule 24-hour reminder via Edge Function + Supabase scheduled functions
- `NotificationsScreen`: replace `NotificationService` (AsyncStorage) with Supabase Realtime subscription on `notifications` where `user_id = auth.uid()`
- Mark as read: update `is_read = true` on Supabase row
- Push notifications: Expo push token stored in `users.expo_push_token`; Edge Function sends push via Expo Push API on notification insert

---

### Phase 6 — Reviews & Live Ratings
**Goal**: Users can leave reviews after completed bookings. Provider star ratings are live and accurate.

**Screens affected**: `BookingsScreen`, `ProviderProfileScreen`

Tasks:
- After booking.status = 'completed', show "Leave a Review" CTA in BookingsScreen booking card
- Write `reviews` row to Supabase (rating, comment, optional tip_amount)
- Supabase trigger auto-recalculates `providers.rating` and `providers.review_count` on review insert/delete
- `ProviderProfileScreen` renders real reviews below services (fetch from `reviews` JOIN `users` — show first_name + avatar)
- Only show review CTA once per booking (check if review already exists for booking_id)

---

### Phase 7 — User Profile — Real Data
**Goal**: Your Account screen loads and saves real user data. Bookmarks, event plans, and settings are cloud-synced.

**Screens affected**: `UserProfileScreen`, `EventDetailScreen`, `ExploreScreen` (My Plans tab)

Tasks:
- Profile Info modal: pre-fill from `users` table with real name, phone; Save upserts to Supabase
- Avatar: upload to `avatars` Storage bucket on image pick; store URL in `users.avatar_url`
- Email and Password modal: wire to `supabase.auth.updateUser()`
- Bookmarks: replace `useBookmarkStore` (AsyncStorage) with read/write to `bookmarks` table
- Payment Methods: store tokenized card references in `payment_methods` table (Stripe card_id only — never raw card numbers)
- Event Plans: replace `usePlannerStore` (AsyncStorage) with `event_plans`, `event_tasks`, `event_checklist_items` Supabase tables
- Wire the dead-link quick-access cards (Saved Looks → BookmarkedProviders, Bookings → BookingsScreen)

---

### Phase 8 — Promotions Management
**Goal**: Providers create and manage offers through the app. HomeScreen offers are real and expire automatically.

**Screens affected**: `HomeScreen`, provider portal (new screen)

Tasks:
- Add Promotions section to provider portal (new screen or modal)
- Provider can create/edit/delete promotions: title, discount, service_category, valid_from, valid_until
- Writes to `promotions` table in Supabase
- `HomeScreen` offers section fetches active promotions (where valid_until >= today and is_active = true), filtered by service_category tab
- Promotions grouped by the same category tabs as the current mock offers UI (ALL, HAIR, NAILS, etc.)

---

### Phase 9 — Payments via Stripe
**Goal**: Replace the fake 2-second payment delay with real card charging. Providers receive real payouts.

**Screens affected**: `CartScreen`

Tasks:
- Set up Stripe account with UK bank for payouts
- Set up Stripe Connect for provider payouts (each provider is a Connected Account)
- Supabase Edge Function: create Stripe PaymentIntent server-side, return `client_secret` to app
- App: render Stripe React Native SDK payment sheet in CartScreen (replaces manual card input form)
- On payment success: write to `transactions` table, update `bookings.payment_status` and `bookings.payment_intent_id`
- Deposit flow: charge deposit % at booking time; charge remaining on completion
- Platform fee: Stripe Connect application fee on each transaction (e.g. 10% to Cerviced)
- Refunds: provider or admin triggers refund via Edge Function → Stripe refund API

---

### Phase 10 — Search, Discovery & Polish
**Goal**: Full-text search on real data, location-based sorting, recommendations from booking history.

**Screens affected**: `ExploreScreen`, `HomeScreen`

Tasks:
- Enable Postgres full-text search on providers.display_name, services.name, portfolio_items.caption and tags
- `ExploreScreen` search bar: replace in-memory filter with Supabase full-text query
- Location-based sort: use PostGIS or earth_distance Postgres extension for "Nearest" sort on providers
- `HomeScreen` Recommended section: query providers in categories matching `users.service_interests` and most-booked categories from booking history
- Google / Apple OAuth: wire up the currently-placeholder buttons
- Add pagination on all list queries (cursor-based via created_at for stability)
- Performance: add Supabase indexes for all common query patterns confirmed in testing

---

## Priority Order

| Priority | Phase | Why |
|---|---|---|
| 1 | Phase 1 — Database Foundation | Everything depends on this |
| 2 | Phase 2 — Provider Registration | Providers must exist in the DB |
| 3 | Phase 3 — Home & Explore Real Data | Core consumer browsing experience |
| 4 | Phase 4 — Availability & Bookings | Core transaction — the whole point of the app |
| 5 | Phase 5 — Real-Time Notifications | Completes the booking loop for both sides |
| 6 | Phase 6 — Reviews & Ratings | Trust signal — needed for real launch |
| 7 | Phase 7 — User Profile | Account management and data portability |
| 8 | Phase 8 — Promotions | Provider marketing tools |
| 9 | Phase 9 — Stripe Payments | Real money — do after full flow is tested end-to-end |
| 10 | Phase 10 — Search & Polish | Scale and discovery quality |
