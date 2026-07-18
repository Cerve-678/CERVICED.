# Booking Flow

How a booking goes from cart to confirmed appointment.

## The path
1. **Cart** — client adds services (`src/contexts/CartContext.tsx`, `CartScreen`).
2. **Checkout** — `src/contexts/BookingContext.tsx` → `validateBookingsBeforeCheckout()` does a *soft* client-side conflict check (UX only).
3. **Create** — `createBooking()` in `src/services/databaseService.ts` inserts the row with `status:'pending'`. The DB has the final say via the `enforce_booking_bookability` trigger → [[Availability & Slots]].
4. **Auto-accept** — if the provider has `auto_accept_bookings`, the client immediately updates status to `'confirmed'` (`BookingContext` ~1528). Otherwise it stays `pending` until the provider confirms in `ProviderBookingDetailScreen`.
5. **Side effects** — confirming stamps `address_released_at` for `on_confirmation` ([[Address Release]]) and fires notifications ([[Notifications]]) — all via DB triggers.

## Status model (important!)
- The **DB** stores: `pending | confirmed | in_progress | completed | cancelled | no_show`.
- The **app** has a display alias `UPCOMING = 'upcoming'` that maps to/from `'confirmed'` via `mapDbBookingStatus()` (`BookingContext`). *There is no `'upcoming'` in the DB.* Getting this wrong broke address release once — see [[Address Release]].
- Always map raw DB status through `mapDbBookingStatus()`.

## Reading bookings
- Client reads via the **`client_bookings` view** (`getMyBookings` / `getOlderBookings`), NOT the base table — so the address is gated. See [[Address Release]].
- Provider reads via `getProviderBookings` (base table — sees their own address).

## Screens
`BookingsScreen` (client), `ProviderBookingHistoryScreen` + `ProviderBookingDetailScreen` (provider). See [[Screens & Navigation]].

## Weak spots → [[Client vs Server Authority]]
- Prices are client-supplied (#1). Cap/auto-accept are client-enforced (#2). Status transitions are unconstrained (#3). Cancel/reschedule eligibility is client-computed (#5).

## Connections
[[Availability & Slots]] · [[Address Release]] · [[Payments]] · [[Notifications]] · [[Contexts]]

## Open questions
- Group bookings: how is `group_booking_id` assigned and shown? #needs-verification
