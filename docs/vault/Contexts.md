# Contexts

Global React state (`src/contexts/`). These are the app's shared brains; screens read/write them, they call [[Services]].

| Context | Owns | Notes |
|---|---|---|
| `AuthContext` | current user/session, sign in/out | Supabase auth; gates client vs provider |
| `BookingContext` | bookings list, create/update, checkout | biggest one; `mapDbBookingStatus`, `createBooking`, `updateBookingStatus`, `validateBookingsBeforeCheckout` → [[Booking Flow]] |
| `CartContext` | cart items, add-ons, totals | feeds checkout → [[Payments]] |
| `ThemeContext` | light/dark, enterprise + legacy theme tokens | `src/theme/tokens.ts`; providers have fixed palettes (don't follow viewer dark mode) |
| `FontContext` | font loading | Bakbak One (headings), Jura (body) |
| `RegistrationContext` | provider signup wizard state | → [[Provider Onboarding & Go-Live]] |

## Key gotchas (from hard-won memory)
- **Status**: always map raw DB status via `mapDbBookingStatus()`; the app's `'upcoming'` ≠ a DB value → [[Booking Flow]].
- **Provider identity**: two divergent provider-name sources (users table vs providers table). Prefer `provider_id` over `display_name` for lookups.
- **Provider image**: `providerImage` is a `{uri}` object, not a string — unwrap `.uri` before writing to DB snapshot columns.

## Connections
[[Services]] · [[Booking Flow]] · [[Payments]] · [[Screens & Navigation]] · [[Architecture Overview]]
