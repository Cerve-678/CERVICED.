# Address Release
#security #server-authoritative

**When can a client see the provider's real address?** Governed by the provider's `address_release_policy`, enforced in the database. As of this session, every provider is also required to *have* a real, geocoded address in the first place — see [[Provider Onboarding & Go-Live]].

## Policies
`always` · `on_confirmation` · `day_before` · `two_days_before` · `three_days_before` · `five_days_before` · `week_before` · `manual`

## Where the address actually lives
- `provider_private_details.full_address` (+ now `latitude`/`longitude`) — **owner-only RLS**, not on `providers` (which is world-readable and can't hide a single column). `supabase/restrict_provider_full_address.sql`.
- `providers.location_text` — the public, approximate area text ("North West London"), always visible, unrelated to release policy.
- `bookings.provider_address_snapshot` / `provider_coordinates` — a **per-booking snapshot** taken at INSERT time by `stamp_booking_address_snapshot()` (`supabase/fix_booking_address_snapshot_uses_real_address.sql` + `stamp_booking_address_snapshot_fallback_location_text.sql` + `require_provider_address.sql`), SECURITY DEFINER so it can read the owner-only table. Fallback order: real `full_address`/coordinates → public `location_text` → whatever the app sent. This is what `client_bookings` actually gates.

## How it's enforced (the right way)
- Clients read bookings through the **`public.client_bookings` view** (`supabase/address_release_enforcement.sql`). It masks `provider_address_snapshot` / `provider_coordinates` to `NULL` until `public.is_address_released(...)` is true. The address is **never sent to the device early**.
- `getMyBookings` / `getOlderBookings` (`src/services/databaseService.ts`) select from that view.
- Clients must **never** fetch the real address directly. They use `getProviderAddressPolicy` / `getProviderAddressPolicyByDisplayName` (business type + policy only — `getProviderAddressSettings` was a duplicate of the by-id version and was deleted this session, folded into `getProviderAddressPolicy`). Only `getMyProviderFullAddress`/`setMyProviderFullAddress` ever touch `provider_private_details`, and RLS scopes those to the owning provider regardless of what id is passed.
- The details screen (`src/screens/client/BookingDetailScreen.tsx`) shows the address iff `booking.address` is present — it no longer re-derives the policy.

## The write side (stamping `address_released_at`)
- `on_confirmation`: trigger in `supabase/fix_address_release_on_confirm.sql`. **Must** match `status = 'confirmed'`, not the app-only `'upcoming'` alias — that mismatch was the original bug. See [[Booking Flow]] status model.
- `manual`: provider taps release → `releaseBookingAddress()` → `provider_release_booking_address()` RPC. Idempotent as of `consolidate_address_release_notification_manual.sql` — a second call on an already-released booking is a no-op, not a re-stamp or an error.
- time-based (`day_before`…`week_before`): hourly cron `process_address_release_notifications()`.
- `always` / any policy for **display purposes**: computed live by `is_address_released()` (no cron needed for display).

## Notifications — one shared path now
All three release paths (the `on_confirmation` trigger, the time-based cron, and the manual RPC) used to each carry their own copy of the "Address Now Available" insert. Consolidated this session into one function, **`notify_address_released(booking_id)`**, called from all three (`consolidate_address_release_notification.sql` + `..._manual.sql`). A partial unique index on `notifications (booking_id, user_id) WHERE type = 'address_released'` makes double-notification impossible at the schema level (`ON CONFLICT DO NOTHING`), not just by convention.

**Security note**: `notify_address_released()` has no internal ownership check by design (it's only ever meant to be called from already-authorized trigger/RPC code) — but this Supabase project grants `EXECUTE` to `anon`/`authenticated` by default on new functions via schema-level default privileges, and `REVOKE ALL … FROM public` does **not** undo that (it only removes the separate PUBLIC pseudo-role grant — confirmed by reading `pg_proc.proacl` directly). Had to explicitly `REVOKE EXECUTE … FROM anon, authenticated` to actually lock it down. **The same gap likely affects other functions in this codebase** using the `REVOKE ALL … FROM public` + `GRANT … TO authenticated` pattern (`dev_reset_provider`, `delete_client_profile`, `delete_provider_profile`, `replace_provider_services` — none currently exploitable since each has its own internal `auth.uid()` check, but none were actually locked down the way their own code implies). See `supabase/fix_anon_executable_security_definer_functions.sql`. #security #todo

## Two mirrors that must agree
- SQL: `is_address_released()`.
- TS: `src/utils/addressRelease.ts` (`isAddressReleasedByPolicy`) — still used **provider-side** (`src/screens/provider/ProviderBookingDetailScreen.tsx`) to label the UI. Deliberately not merged — the provider needs a *predictive* "when will this release" read of their own row, which a client-scoped view can't give them; not worth a new RPC just to remove ~30 lines of low-churn duplication.

## Now mandatory: a real, geocoded address
Previously `full_address` was optional for every business type and not even collected for `mobile`. As of `require_provider_address.sql`:
- Required for **every** `business_type`, including `mobile` (a private base address — never client-facing, since a mobile booking's client-side UI shows `client_address` instead of the provider's own address anyway).
- Validated in `src/services/providerRegistrationService.ts`'s `geocodeAndValidateUkAddress()`: non-empty → contains a UK-postcode-shaped substring → `Location.geocodeAsync()` resolves → result falls inside a coarse UK bounding box. No third-party address-lookup API (deliberate choice — kept simple). Runs before any DB write, so a bad address never leaves partial state.
- Resulting coordinates are stored on `provider_private_details.latitude/longitude` and now win over the approximate `location_text` geocode for `bookings.provider_coordinates` once a booking is stamped — so a released booking's map pin finally reflects the real address, not just the general area. `provider_coordinates` staying approximate for providers with no real address is the one remaining known limitation (unchanged).
- **Go-live gating** (`check_and_set_provider_live()`) now also requires this — same one-way design as the pre-existing services/schedule gate: only tightens the bar for a provider going live for the **first time**, never retroactively un-lists an already-live provider with no address on file. Verified via a rolled-back transaction test. → [[Provider Onboarding & Go-Live]]

## Deploy order (current, full chain)
1. `address_release_policy.sql` → `fix_address_release_on_confirm.sql` (trigger + backfill)
2. `restrict_provider_full_address.sql` (splits `full_address` into owner-only `provider_private_details`)
3. `address_release_enforcement.sql` (function + `client_bookings` view)
4. `address_release_notification.sql` → `consolidate_address_release_notification.sql` → `..._manual.sql` (shared notify helper)
5. `fix_booking_address_snapshot_uses_real_address.sql` → `stamp_booking_address_snapshot_fallback_location_text.sql` → `require_provider_address.sql` (real-address + real-coordinate stamping, go-live gate)
6. `fix_anon_executable_security_definer_functions.sql` (lockdown pass)
7. ship app code (depends on `client_bookings` + the new `setMyProviderFullAddress` signature)

`supabase/RUN_ALL_MIGRATIONS.sql` was found stale for most of this chain (a fresh environment built from it would've shipped with unmasked addresses, world-readable provider home addresses, and a `notifications_type_check` that silently rejected `address_released`) — refreshed this session. The go-live-gating piece of `require_provider_address.sql` was deliberately **not** added to the bundle: the entire go-live-gating system (`provider_schedule_gating.sql`, `require_services_for_go_live.sql`) was never in the bundle either, so adding just the address piece would've been a misleading partial fix. #todo

## Connections
[[Client vs Server Authority]] · [[Booking Flow]] · [[Data Layer — Supabase]] · [[Services]] · [[Provider Onboarding & Go-Live]] · [[Notifications]]

## Open questions
- Time-based policies assume **UTC** wall-clock in SQL (no per-provider tz). Off by the tz offset for non-UTC users. #todo #needs-verification
- `RUN_ALL_MIGRATIONS.sql`'s go-live-gating gap (above) — worth a dedicated pass to bring the whole chain in, not just this session's piece. #todo
