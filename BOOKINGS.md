# CERVICED — Booking Experience

Reference doc for the full booking lifecycle: availability, checkout, payment,
fully-booked handling, reschedule, and cancellation. Written directly against
the current code (not aspirational) — file:line references throughout so it
stays checkable. See [WAITLIST.md](WAITLIST.md) for the waitlist system
specifically, and `LOGIC.md`/`CLAUDE.md` for the rest of the app.

---

## 1. Data model

Single table, `public.bookings` ([phase1_schema.sql](supabase/phase1_schema.sql)),
one row per appointment. Key columns:

| Column | Notes |
|---|---|
| `status` | See §2 below |
| `booking_date` / `booking_time` / `end_time` | `DATE` / `TIME` — `end_time` is always persisted at creation, even if the client only picked a start time (derived from service duration) |
| `service_id` | Nullable — static/demo services (non-UUID ids) store `NULL` here |
| `effective_start` / `effective_end` | `TIMESTAMP`, computed by a trigger — the buffer-padded span actually used for conflict detection (see §5) |
| `payment_intent_id` | The Stripe PaymentIntent covering this booking — shared across every booking from the same multi-service checkout |
| `is_group_booking` / `group_booking_id` / `group_booking_count` | Set at creation from the cart size; corrected after the fact if a multi-service checkout partially fails (§4) |
| `provider_name_snapshot`, `service_name_snapshot`, `provider_address_snapshot`, etc. | Frozen at booking time — a later provider rename/address change doesn't retroactively alter past bookings |
| `waitlist_entry_id`, `hold_expires_at` | Only meaningful for `on_hold` rows — see [WAITLIST.md](WAITLIST.md) |

**Client reads never hit `bookings` directly** — `getMyBookings`/`getOlderBookings`
([databaseService.ts:994-1010](src/services/databaseService.ts#L994)) go through
the `client_bookings` view instead, which masks the provider's address until
release policy allows it and excludes `on_hold` holds so they never show as
phantom appointments.

## 2. Status lifecycle

Raw DB values → client-side `BookingStatus` enum via
`mapDbBookingStatus()` ([BookingContext.tsx:280](src/contexts/BookingContext.tsx#L280)) —
**always** go through this mapper; never branch on the raw string in a
screen. Notably `'confirmed'` maps to `BookingStatus.UPCOMING`, not a
`CONFIRMED` value — there isn't one.

```
pending ──(provider confirms)──> confirmed ──(appt day)──> in_progress ──> completed
   │                                  │
   │                                  └──(client/provider cancels)──> cancelled
   └──(provider declines / client withdraws)──> cancelled

confirmed ──(provider marks)──> no_show

on_hold (waitlist only, see WAITLIST.md) ──(claimed)──> pending/confirmed
                                          ──(expires/declined)──> cancelled
```

`no_show`, `completed`, `cancelled` are terminal — no RPC transitions out of
them.

## 3. Availability calculation

Owned by [AvailabilityService.ts](src/services/AvailabilityService.ts), reused
by every read path (slot lists, single-slot checks, near-term/"fully booked"
checks, the multi-service scheduler) rather than reimplemented per screen.

- **Working hours**: `resolveWorkingWindows()` ([AvailabilityService.ts:105](src/services/AvailabilityService.ts#L105))
  resolves, in priority order: a closed date-override wins outright → explicit
  date overrides → recurring weekly windows → legacy single daily
  open/close row. A day with none of these has zero working windows (closed).
- **Slot granularity**: `slot_interval_mins` (15/30/60, per provider).
- **Buffers**: every booking has an effective span
  `[start − buffer_before, end + buffer_after)`. A service's own
  `buffer_before_mins`/`buffer_after_mins` override the provider's global
  `buffer_mins`; `NULL` on the service falls back to the provider's setting
  (`bufferFromRow()`, [AvailabilityService.ts:124](src/services/AvailabilityService.ts#L124)).
  This exact formula is duplicated in three places by necessity (app-side
  slot generation, `createBooking`'s pre-check, and the DB trigger in §5) —
  if you ever change the buffer rule, all three need to move together.
- **Booking window / notice**: `booking_window_days` (how far ahead a client
  can book) and `min_booking_notice_hrs` (minimum lead time) are provider
  settings, enforced both app-side (`getAvailableSlots`) and DB-side
  (`enforce_booking_bookability()`, [availability_v2.sql:86](supabase/availability_v2.sql#L86) —
  the actual source of truth; the app-side version is for UI responsiveness,
  not the real gate).

## 4. Booking creation

### Single service
Provider profile → date/time picker → `AvailabilityService.isSlotAvailable()`
pre-check → `createBooking()` ([databaseService.ts:967](src/services/databaseService.ts#L967)),
which re-validates the overlap itself (SELECT-then-INSERT, backstopped by the
DB constraint in §5) before inserting.

### Multi-service cart checkout
`CartScreen.tsx`'s `handleCheckout` → review/summary modals → payment sheet →
`BookingContext.createBookingsFromCart()` ([BookingContext.tsx:1093](src/contexts/BookingContext.tsx#L1093)),
which loops the cart **sequentially**, calling `createBooking()` once per
item (not a single transaction — see below for why that matters).

**Pre-payment conflict check**: `handleCheckout`
([CartScreen.tsx:1176](src/screens/CartScreen.tsx#L1176)) calls
`AvailabilityService.validateCartBookings()` before the payment sheet ever
opens — catches (a) two cart items for the same provider that overlap each
other, and (b) a cart item that's since been taken by someone else's booking
in Supabase. This used to be a defined-but-never-called function; discovering
a conflict used to happen mid-checkout, after the card was already authorised.

**Partial failure handling**: if item 2 of 3 fails (slot taken, bookability
rule changed since being added to cart, etc.), items 1 and 3 still persist.
`BookingError` carries `succeededCartItemIds` **and** `succeededAmountPaid`
so the caller knows exactly what to keep and what to actually charge for —
see §4a. `group_booking_count`/`is_group_booking`/`group_booking_id` (stamped
optimistically from the full cart size before any outcome is known) get
corrected via `updateBookingGroupInfo()` ([databaseService.ts:1225](src/services/databaseService.ts#L1225))
once the real outcome is known, so a booking that survives a 3-item partial
failure doesn't keep claiming to be "1 of 3."

### 4a. Payment

`StripePaymentModal` ([CartScreen.tsx:399](src/screens/CartScreen.tsx#L399)) —
**not currently active** (`USE_STRIPE_PAYMENTS = false` at
[CartScreen.tsx:51](src/screens/CartScreen.tsx#L51); the live path today is the
mock `PaymentModal` that never touches Stripe). When enabled: manual-capture
flow — `create-payment-intent` authorises only, `finalize-payment-intent`
captures after the booking is confirmed to exist. One PaymentIntent covers
the whole multi-service cart.

- **All succeeded**: capture the full amount.
- **All failed**: cancel the whole authorisation — client is never charged.
- **Partial success**: capture *only* `succeededAmountPaid` (a Stripe partial
  capture — the remainder releases automatically), verified server-side
  against the sum of `amount_paid` for bookings actually carrying that
  `payment_intent_id` ([finalize-payment-intent/index.ts:87-104](supabase/functions/finalize-payment-intent/index.ts#L87)) —
  the edge function never trusts the client's claimed amount on its own. This
  closes what used to be a real gap: any partial failure previously cancelled
  the *entire* authorisation even when some bookings had already persisted
  and were marked paid in the DB — a live, unpaid "paid" booking.

### 4b. Fully booked

Two horizons, both via `AvailabilityService.hasNearTermAvailabilityForServices()`
([AvailabilityService.ts:709](src/services/AvailabilityService.ts#L709)),
computed once per provider load in `ProviderProfileScreen.tsx:1826-1843`:

- **14 days** → gates the **waitlist button** (only shown when nothing's
  bookable soon).
- **180 days** (`FULL_BOOKING_HORIZON_DAYS`) → gates the **"Fully Booked"**
  disabled state on the Book button itself.

Both fail *open* on error/unknown-provider (never show a false "fully
booked" off a network hiccup).

## 5. Conflict prevention — two layers

1. **Exact-slot race** (two bookings landing on the identical
   `(provider_id, booking_date, booking_time)`): closed by a plain Postgres
   unique index, `bookings_no_double_book_idx`
   ([prevent_double_booking.sql](supabase/prevent_double_booking.sql)). Violation
   surfaces as error code `23505`.
2. **Buffer/duration overlap race** (different start times that still
   overlap once duration+buffer applies — e.g. a 90-min booking at 2:00pm vs
   a fresh request at 2:30pm): the unique index above doesn't catch this at
   all, and the app-side check (`createBooking`'s SELECT-then-INSERT) is a
   genuine TOCTOU race under concurrent requests. Closed by
   [prevent_overlapping_bookings.sql](supabase/prevent_overlapping_bookings.sql):
   a trigger (`compute_booking_effective_range`, `SECURITY DEFINER` so it
   can't be weakened by RLS on `providers`/`services`) snapshots each
   booking's buffer-padded span onto `effective_start`/`effective_end`, then
   a GiST `EXCLUDE` constraint (`bookings_no_overlap`) blocks any overlap for
   the same provider among non-cancelled/non-`no_show` rows — atomic at the
   database level, immune to app-side races, and covers reschedule
   confirmations too (any `UPDATE` of the scheduling columns re-triggers it).
   Violation surfaces as `23P01`.

Both codes are mapped to the same friendly message ("that time was just
taken") in `BookingContext.tsx`'s `createBookingsFromCart` catch
([BookingContext.tsx:1453](src/contexts/BookingContext.tsx#L1453)) and in
`RescheduleScreen.tsx`'s submit catch
([RescheduleScreen.tsx:166](src/screens/RescheduleScreen.tsx#L166)).

**⚠️ Not yet applied to the live Supabase project** — both migration files
above are checked in but need to be run manually (they add a real column,
extension, and constraint).

## 6. Multi-service auto-scheduler

`AvailabilityService.findBackToBackSlots()` /
`findNextBackToBackDay()` ([AvailabilityService.ts:1093-1156](src/services/AvailabilityService.ts#L1093)) —
chains multiple services for one provider back-to-back (each still respecting
its own buffer against the next), walking forward from today to find the
first day the whole chain fits. Surfaced as a **"Schedule all N together"**
button in the cart ([CartScreen.tsx](src/screens/CartScreen.tsx)) when 2+
items share a provider — proposes one day/timeline, single confirm, instead
of the client picking each service's time individually and hoping they don't
clash.

## 7. Reschedule

Two-actor flow via three SECURITY DEFINER RPCs
([booking_rules_server_enforcement.sql](supabase/booking_rules_server_enforcement.sql)) —
replaced what used to be app-side-only enforcement (client-side notice/cap
checks a tampered client could simply skip).

```
Client: request_reschedule_own_booking(booking_id, preferred_dates[])
  → booking must be 'confirmed'; no other pending/provider_responded request already open
  → 24h cooldown since last successful reschedule
  → provider's maxReschedules cap (booking_policies->>'maxReschedules', default 1, 'unlimited' opts out)
  → provider's rescheduleNotice window (same_day/24h[default]/48h/72h) vs time-until-appointment
  → creates/upserts a 'pending' booking_reschedule_requests row

Provider responds with available slots (upsertProviderRescheduleRequest)
  → status → 'provider_responded'

Client: confirm_reschedule_own_booking(booking_id, new_date, new_time, new_end_time)
  → requires an active 'provider_responded' request — can't invent one
  → UPDATEs booking_date/time/end_time directly → re-fires the overlap
    exclusion constraint (§5) and enforce_booking_bookability(), same as any
    fresh booking
  → increments reschedule_count / last_rescheduled_at
```

A raw `23505`/`23P01` from the confirm step (someone else took that slot
between the provider proposing it and the client confirming) is mapped to a
friendly "time no longer available" alert rather than shown as a raw
Postgres error ([RescheduleScreen.tsx:166](src/screens/RescheduleScreen.tsx#L166)).

## 8. Cancellation

Two RPCs, deliberately asymmetric — a client cancelling has a notice window
to respect; a provider cancelling doesn't (it's their calendar):

- **Client**: `cancel_own_booking(booking_id)`
  ([booking_rules_server_enforcement.sql:41](supabase/booking_rules_server_enforcement.sql#L41)) —
  only `pending`/`confirmed` bookings; enforces the provider's
  `cancellation_notice_hours` (hours-until-appointment vs the setting) —
  server-side, so it can't be bypassed by a client that skips the app-side
  check.
- **Provider**: `provider_cancel_own_booking(booking_id)`
  ([booking_rules_server_enforcement.sql:89](supabase/booking_rules_server_enforcement.sql#L89)) —
  any non-terminal status, no notice window.

A plain `.update({status: 'cancelled'})` is never used directly from the app
for this — RLS on `bookings` is permissive enough that it *would* succeed,
which is exactly why the notice-window check has to live in the RPC, not the
client.

**Why cancellation matters beyond the status flip**: `handle_booking_status_change()`
([RUN_ALL_MIGRATIONS.sql:82](supabase/RUN_ALL_MIGRATIONS.sql#L82), see the
live version in [waitlist_automation_settings.sql:150](supabase/waitlist_automation_settings.sql#L150)
for the actual deployed body) fires on the `cancelled` transition and:
1. Notifies the other side (whoever didn't perform the cancellation).
2. Calls `invite_next_waitlist_entry()` — the freed slot triggers the
   waitlist hold mechanism. See [WAITLIST.md](WAITLIST.md).

There is **no DELETE policy** on `bookings` — a client-side delete is a
silent no-op, not an error. Cancellation is the only supported removal path.

## 9. Notifications

Entirely DB-trigger-owned — `handle_new_booking()` (on INSERT) and
`handle_booking_status_change()` (on status UPDATE) are the single source of
truth for booking-lifecycle notifications. **Never** add an app-side
notification insert for something these triggers already cover — the
project has hit double-notification bugs from exactly that before. The one
exception is the payment-receipt notification, which no trigger sends
(`BookingContext.tsx:1488`).

## 10. Known gaps

- `updateBookingDateTime`/`rescheduleBookingInSupabase`
  ([databaseService.ts:1751](src/services/databaseService.ts#L1751),
  [bookingService.ts:541](src/services/bookingService.ts#L541)) — dead code,
  zero callers, superseded by `confirm_reschedule_own_booking`. Harmless as
  long as nothing re-wires it (it would bypass the reschedule RPC's cooldown/
  cap checks if it did).
- `enforce_booking_bookability()`'s own overlap check and the newer
  `bookings_no_overlap` exclusion constraint are two separate mechanisms that
  happen to agree today — if either's buffer/overlap formula changes without
  the other, they'll disagree, and whichever fires second wins with a
  possibly-confusing error.
- The in-app card payment form (mock `PaymentModal`) collects raw card
  fields itself rather than tokenising through Stripe — not production-ready;
  see `CLAUDE.md`'s payment-handling note before this ever handles real money.
