# Address Release
#security #server-authoritative

**When can a client see the provider's real address?** Governed by the provider's `address_release_policy`, enforced in the database.

## Policies
`always` · `on_confirmation` · `day_before` · `two_days_before` · `three_days_before` · `five_days_before` · `week_before` · `manual`

## How it's enforced (the right way)
- Clients read bookings through the **`public.client_bookings` view** (`supabase/address_release_enforcement.sql`). It masks `provider_address_snapshot` / `provider_coordinates` to `NULL` until `public.is_address_released(...)` is true. The address is **never sent to the device early**.
- `getMyBookings` / `getOlderBookings` (`src/services/databaseService.ts`) select from that view.
- Clients must **never** fetch `providers.full_address`. They use `getProviderAddressPolicy*` (business type + policy only). `getProviderAddressSettings*` (has `full_address`) is **provider-side only**.
- The details screen shows the address iff `booking.address` is present — it no longer re-derives the policy.

## The write side (stamping `address_released_at`)
- `on_confirmation`: trigger in `supabase/fix_address_release_on_confirm.sql`. **Must** match `status = 'confirmed'`, not the app-only `'upcoming'` alias — that mismatch was the original bug. See [[Booking Flow]] status model.
- `manual`: provider taps release (`releaseBookingAddress`).
- `always` / time-based: computed live by `is_address_released()` (no cron needed for display).

## Two mirrors that must agree
- SQL: `is_address_released()`.
- TS: `src/utils/addressRelease.ts` (`isAddressReleasedByPolicy`) — still used **provider-side** to label the UI.

## Deploy order
1. `fix_address_release_on_confirm.sql` (trigger + backfill)
2. `address_release_enforcement.sql` (function + view)
3. ship app code (depends on the view existing)

## Connections
[[Client vs Server Authority]] · [[Booking Flow]] · [[Data Layer — Supabase]] · [[Services]]

## Open questions
- Time-based policies assume **UTC** wall-clock in SQL (no per-provider tz). Off by the tz offset for non-UTC users. #todo #needs-verification
