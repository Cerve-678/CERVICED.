# Availability & Slots
#server-authoritative

How open times are computed, and how a taken slot is blocked.

## Two layers
1. **Compute open slots (display)** — `AvailabilityService.getAvailableSlots()` (`src/services/AvailabilityService.ts`, exposed via `databaseService.getAvailableSlots`). Reads the provider's availability windows/overrides + existing bookings + service duration + buffers to produce bookable times.
2. **Enforce on write (authority)** — the **`enforce_booking_bookability` trigger** (`supabase/availability_v2.sql`, BEFORE INSERT/UPDATE on `bookings`). Rejects:
   - past dates, outside booking window, under minimum notice,
   - blocked dates, closed days / outside working hours (windows → overrides → legacy),
   - **overlap** with any `pending/confirmed/in_progress` booking → *"That time is no longer available."*

So **a taken slot cannot be booked even if the client skips its own check.** The client-side checks in [[Booking Flow]] are UX only.

## Schema
- `provider_availability_windows` / `provider_availability_overrides` (new, `availability_v2.sql`); legacy `provider_availability`.
- Buffers: `service_buffer_settings.sql`, provider `buffer_mins`, per-service `buffer_before_mins`/`buffer_after_mins`.
- `prevent_double_booking.sql` — partial unique index catching exact-time duplicates atomically (backstop for the overlap SELECT's race).

## Known nuances
- The trigger's overlap check uses raw `[booking_time, end_time)` — **buffers are applied client-side but not in the trigger.** Slight inconsistency.
- Under high concurrency, two *overlapping-but-not-identical* inserts can both pass the trigger's SELECT (READ COMMITTED). The unique index only covers identical times. #todo
- Open UX question: should taken slots **disappear** or **show greyed as unavailable**? Currently `getAvailableSlots` omits them. #needs-verification

## Connections
[[Booking Flow]] · [[Client vs Server Authority]] · [[Data Layer — Supabase]] · [[Provider Onboarding & Go-Live]]
