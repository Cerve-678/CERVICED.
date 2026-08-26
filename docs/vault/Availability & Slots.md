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

## Emergency requests — asking past the rules
#server-authoritative

Four of the trigger's rejections are no longer absolute. Since `20260821143821_emergency_booking_requests.sql` a provider can opt into being **asked** for a time their own rules exclude — one independent opt-in per rule, all default `false`:

| `providers` column | Relaxes |
|---|---|
| `allow_out_of_hours_requests` | outside working hours |
| `allow_blocked_date_requests` | blocked date, or a one-off `is_closed` override |
| `allow_short_notice_requests` | under `min_booking_notice_hrs` |
| `allow_beyond_window_requests` | beyond `booking_window_days` |

Still hard for everyone: a past date, an already-elapsed same-day time, and a genuinely taken slot. The overlap rule above is untouched — no opt-in reaches past it.

**The provider chooses how far either side.** `request_window_before_mins` / `request_window_after_mins` (`20260826182059`) bound what's OFFERED, measured from **that day's own** opening/closing time; `NULL` = any time and is the default. Display preference only — deliberately not in the trigger, since the provider approves every request anyway and a second copy would just drift. A day with no hours has nothing to measure from, so the whole day is requestable.

**There is no bound the app invents.** Working hours decide what's *ordinarily* bookable; everything outside them is requestable once the provider opts in, at any hour, and their approval is the filter. An earlier version bounded requests to the provider's weekly envelope widened by an extension — which refused a **4am bridal call**, the most common genuine out-of-hours booking in this industry, because the bound was inferred from hours describing a NORMAL week. Removed 2026-08-26 (`20260826171244`), which also drops the dead `out_of_hours_extension_mins` column.

What survives every opt-in, and must stay mirrored between `resolveSlotOffer()` and the trigger — **if they drift, the picker offers times the DB rejects**: a past date, an already-elapsed same-day time, a taken slot. Covered by `src/tests/emergencyRequestSlots.test.ts`.

**Slots carry their reason.** `getAvailableSlots` returns these as normal `TimeSlot`s with `isByRequest: true` + `requestReasons`. `ModernBeautyCalendar` shows them in a separate "By request" group, **red-outlined on both the date pill and the time chip** (never the accent — that colour means "bookable"), and **only when the caller passes `allowRequests`** — default `false`, because a caller that shows them must be able to carry the flag to checkout. Everything else (consultation prerequisite, both reschedule pickers, provider AddBooking's Available tab, the grouped back-to-back chain picker, and `resolveNextAvailableSlot`) never sees them.

**Always pending.** `finalize_checkout()` forces auto-accept off for `is_emergency_request`, so an opted-in provider with `auto_accept_bookings = true` is never silently committed. `emergency_ack_at` mirrors `safety_ack_at`, enforced inside `prepare_checkout`.

Provider control lives in `SchedulingScreen.tsx`; the client confirmation is `EmergencyBookingPrompt.tsx`. See [[Cart & Checkout]] for how the flag travels.

## Schema
- `provider_availability_windows` / `provider_availability_overrides` (new, `availability_v2.sql`); legacy `provider_availability`.
- Buffers: `service_buffer_settings.sql`, provider `buffer_mins`, per-service `buffer_before_mins`/`buffer_after_mins`.
- `prevent_double_booking.sql` — partial unique index catching exact-time duplicates atomically (backstop for the overlap SELECT's race).

## Known nuances
- The trigger's overlap check uses raw `[booking_time, end_time)` — **buffers are applied client-side but not in the trigger.** Slight inconsistency.
- Under high concurrency, two *overlapping-but-not-identical* inserts can both pass the trigger's SELECT (READ COMMITTED). The unique index only covers identical times. #todo
- Open UX question: should taken slots **disappear** or **show greyed as unavailable**? Currently `getAvailableSlots` omits them. #needs-verification

## Connections
[[Booking Flow]] · [[Cart & Checkout]] · [[Client vs Server Authority]] · [[Data Layer — Supabase]] · [[Provider Onboarding & Go-Live]]
