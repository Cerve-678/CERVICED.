# Services

The data/API layer (`src/services/`) — everything that talks to Supabase or external APIs. [[Contexts]] call these; these call Postgres → [[Data Layer — Supabase]].

## The big one
- **`databaseService.ts`** — the bulk of DB reads/writes. Bookings (`getMyBookings` via the `client_bookings` view, `getProviderBookings`, `createBooking`, `updateBookingStatus`, `isSlotTaken`), providers, policies (`getProviderAddressPolicy*`, `getProviderReschedulePolicy*`, `getProviderCancellationPolicy*`, `getProviderContact*` — all **id-first with name fallback**), waitlist, address release. → [[Address Release]] [[Booking Flow]]

## By domain
- **Booking/availability**: `AvailabilityService.ts` (slot computation → [[Availability & Slots]]), `bookingService.ts`, `checkoutService.ts` → [[Payments]], `WaitlistService.ts`.
- **Provider**: `providerRegistrationService.ts` → [[Provider Onboarding & Go-Live]], `ProviderDataService.ts`, `acuityTransferService.ts` (import from an Acuity Scheduling link — not a generic provider id).
- **Media**: `ImageLoader.ts`, `UploadService.ts`.
- **Notifications**: `pushNotificationService.ts`, `notificationTapHandler.ts`, `emailService.ts` → [[Notifications]].
- **AI (Becca assistant)**: `aiChatService.ts`, `enhancedAIChatService.ts`, `beccaStorageService.ts`.
- **Misc**: `biometricService.ts`, `userLearningService.ts` (personalization), `api.ts`.

## Convention worth keeping
Provider lookups prefer **`provider_id`** (stable, unique) over `display_name` (can drift/collide across the two name sources), with a name fallback for legacy rows. See [[Contexts]] gotchas.

## Connections
[[Contexts]] · [[Data Layer — Supabase]] · [[Address Release]] · [[Notifications]]
