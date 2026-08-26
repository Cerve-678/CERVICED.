# CERVICED — Booking Experience

Reference doc for the full booking lifecycle: availability, checkout, payment,
fully-booked handling, reschedule, and cancellation. Written directly against
the current code (not aspirational) — file:line references throughout so it
stays checkable. See [WAITLIST.md](WAITLIST.md) for the waitlist system
specifically, and `APP_STATE.md`/`CLAUDE.md` for the rest of the app.

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

### 3a. Emergency requests — asking past the rules

Four of the rules above (working hours, blocked dates, minimum notice, booking
window) normally stop a client dead: `getAvailableSlots` never offers the time,
and `enforce_booking_bookability()` rejects it if one somehow arrives. Since
[20260821143821_emergency_booking_requests.sql](supabase/migrations/20260821143821_emergency_booking_requests.sql)
a provider can opt into being **asked** instead, one opt-in per rule:

| Column on `providers` | Relaxes |
|---|---|
| `allow_out_of_hours_requests` | *"This appointment is outside the provider's working hours"* |
| `allow_blocked_date_requests` | *"Provider is unavailable on this date"* — both `provider_blocked_dates` and a one-off `is_closed` override |
| `allow_short_notice_requests` | *"This appointment does not meet the provider's minimum notice"* |
| `allow_beyond_window_requests` | *"Booking is outside this provider's booking window"* |

All four default `false`, so nothing changes for an existing provider until
they turn one on in
[SchedulingScreen.tsx](src/screens/provider/SchedulingScreen.tsx).

**Still hard for everyone, no opt-in:** a past date, a same-day time that has
already elapsed, and a genuinely taken slot (`bookings_no_overlap` + the
trigger's own overlap check). Same three exclusions the provider-side manual
override (§4, `p_override_scheduling`) already respects.

**How far either side is the provider's own choice.**
`request_window_before_mins` / `request_window_after_mins`
([20260826182059](supabase/migrations/20260826182059_provider_chosen_request_window.sql))
bound how much of the day is *offered*, measured from **that day's own**
opening and closing time. `NULL` means any time and is the default. This is a
display preference, not a rule: the trigger doesn't enforce it, because the
provider approves or declines every request regardless — putting it there would
only create a second place for the two to drift apart. A day with no hours (a
blocked date, or a weekday they never work) has nothing to measure from, so the
whole day is requestable under whichever opt-in covers it.

Note what this is *not*: the dropped `out_of_hours_extension_mins` measured a
single figure from a value the app **derived** (the widest hours across the
whole week), which is what made 4am unaskable regardless of what the provider
set. These are stated by the provider, anchored to the day, and default to no
ceiling at all.

**No bound the app invents, deliberately.** Working hours decide what is
*ordinarily* bookable; everything outside them is requestable once the provider
opts in, at any hour, and the provider answers each request — that approval is
the filter. The first version bounded requests to the provider's recurring
weekly envelope widened by an extension setting, and that refused a 4am bridal
call: the most common genuine out-of-hours booking in this industry, rejected
because the bound was inferred from hours describing a *normal* week. An
emergency request is by definition not that. Removed in
[20260826171244](supabase/migrations/20260826171244_emergency_requests_remove_derived_hour_bound.sql),
which also drops the now-dead `out_of_hours_extension_mins` column.

What still holds regardless of any opt-in, mirrored exactly between
`resolveSlotOffer()` ([AvailabilityService.ts](src/services/AvailabilityService.ts))
and the trigger: a past date, an already-elapsed same-day time, and a genuinely
taken slot. A shut day answers to the blocked-date opt-in, not the out-of-hours
one.

**Client side.** Such times come back from `getAvailableSlots` as ordinary
`TimeSlot`s with `isByRequest: true` and the rules they break in
`requestReasons`. `ModernBeautyCalendar` renders them in their own "By request"
group below the real slots — **red-outlined, both the date pill and the time
chip**, so the two read as one state and neither borrows the accent colour that
every ordinarily-bookable control uses. Only when the caller opts in with
`allowRequests` — which defaults to **false** precisely because a caller that
shows them must be able to carry the resulting flag through to checkout.
Picking one opens
[EmergencyBookingPrompt](src/components/EmergencyBookingPrompt.tsx): *"Scheduling
conflict … do you want this to be considered an emergency booking? … read
{provider}'s policy before confirming"*, with a link into the provider's own
T&Cs and a tick that gates the request.

Pickers that deliberately never see these times: the consultation prerequisite,
both reschedule flows, the provider's own AddBooking "Available" tab, and
MultiBookingSheet's grouped back-to-back picker (whose chain resolver returns
plain strings and has no notion of a per-slot reason). `resolveNextAvailableSlot`
also skips them — auto-resolution picks *for* the client, and must never hand
them a slot that needs the provider's acceptance without the explanation.

**Always pending.** `finalize_checkout()` forces `v_auto_accept := false` for a
booking with `is_emergency_request`, so an opted-in provider with
`auto_accept_bookings = true` is still never silently committed to a 9pm
Sunday. Both notification variants say so, and the provider sees an "Outside
your availability" badge in their inbox and a banner directly above
Confirm/Decline.

**The cart must know too.** `isSlotAvailable` / `validateCartBookings` re-check
every cart item against the provider's rules at checkout. An emergency request
carries `CartItem.emergencyRequest` through to that check
(`isEmergencyRequest`), or the cart flags the client's own accepted request as
a conflict and gives them no way forward. It does not skip the checks: each is
waived only under the matching opt-in, read from the same provider row the
trigger reads, so a request accepted *before* the provider switched a toggle
off is still caught — in the cart, where it can be explained, rather than at
the insert. The overlap check is never waived.

**Acknowledgement.** `bookings.emergency_ack_at` mirrors `safety_ack_at`
exactly, including being enforced inside `prepare_checkout` — a hand-built RPC
payload with `emergency: true` and no `emergency_ack` is rejected.

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
Postgres error ([RescheduleScreen.tsx](src/screens/client/RescheduleScreen.tsx)'s
submit `catch`, which is the single place client-facing reschedule copy is
decided — see §7b).

### 7a. Response deadlines — BUILT 2026-08-26

**A reschedule request now has a deadline.** Migration
`20260826090555_reschedule_request_expiry.sql`, cron job `reschedule-request-expiry`
(jobid 154, `17,47 * * * *`).

Before this, a `booking_reschedule_requests` row sat in `pending` (waiting on
the provider) or `provider_responded` (waiting on the client) forever, and
three things went wrong because of it, all against the client who asked:

1. `request_reschedule_own_booking()` refuses a second request while one is
   open, so a provider who never replied blocked the client from asking again
   — silence was a stronger veto than an outright refusal.
2. `process_auto_complete_bookings()` flipped `confirmed` → `completed` purely
   on the clock. Request `a1b9c766` was live proof: still `pending` on a
   booking completed 2026-08-21.
3. The provider's own `rescheduleNotice` window kept running while the request
   sat there, so a request made in good time became un-actionable by both
   sides with nothing telling either of them.

**The answer window is the provider's own `rescheduleNotice` setting** — a
provider who demands 72h notice to reschedule gets 72h to answer one, not
forever. The hours mapping is copied verbatim from
`request_reschedule_own_booking()` so the two cannot disagree about what `48h`
means. Floored at **24h**, because `same_day` maps to 0 hours and would
otherwise expire a request the instant it was made.

**Backstopped by the start of the appointment day**, and that backstop
deliberately BEATS the provider's own window when the two disagree — a 72h
provider does not get to spend 72h and reply as the client is walking in. The
client should wake up on the day already knowing.

Two guards sit around the backstop (added by `20260826094404`, correcting the
original bare `LEAST`), rather than weakening it:

- a **4-hour floor**, so a late request always leaves a real chance to answer;
- a **hard cap at the appointment start time**, so a deadline can never sit
  after the appointment it is about.

Without the floor, `same_day` — which skips the notice check entirely, so a
client can legitimately ask on the day — produced a deadline **8 hours in the
past**, expiring the request on the next cron tick before the provider could
ever see it. Worked examples:

| Provider notice | Client asks | Provider must answer by | Window |
|---|---|---|---|
| 72h | 3 days out | midnight before the day | 58h |
| 24h | 24h before | midnight before the day | 10h |
| 24h | a week out | 24h after the ask | 24h |
| same-day | 6h before | 4h after the ask | 4h |
| same-day | 1h before | the appointment time | 1h |

**Who is waiting is decided by status, never by `requested_by`:**

| Status | Waiting on | Why |
|---|---|---|
| `pending` | Provider | Only `request_reschedule_own_booking()` creates it, always `requested_by = 'user'` |
| `provider_responded` | Client | Including when the PROVIDER opened it — `provider_initiate_reschedule()` inserts straight into this state with `requested_by = 'provider'` |

**`expired` is a distinct terminal status**, not `rejected` or `cancelled`:
those mean somebody decided, and the difference matters for the notification
copy and for any later dispute. The status CHECK was widened to allow it.

**Notification (`reschedule_expired`, a new type):**

- `pending` expires → **client only**. The provider caused it by inaction and
  has already had up to N nudges from
  `process_provider_stale_reschedule_reminders()`; a fourth message is a nag,
  not news.
- `provider_responded` expires → **both**. The provider's held offer is dead
  through no act of their own, and the client's app is still showing those
  offered dates as live — leaving them to tap a slot that no longer exists is
  the worse failure.

Copy asserts only what is certainly true: *"…so your booking on DD Mon YYYY
stays as originally scheduled."* It deliberately does **not** offer "ask again
or cancel" — by that point the provider's notice window may have lapsed, which
is exactly what would make both of those fail. Promising an action the next tap
rejects is worse than silence.

**An expired request costs the client nothing.** Neither limit reads this
table: the max-reschedules check reads `bookings.reschedule_count` and the 24h
cooldown reads `bookings.last_rescheduled_at`, both written only when a
reschedule actually completes. Re-requesting reuses the same row via the
existing `ON CONFLICT (booking_id) DO UPDATE`, so the UNIQUE constraint is not
in the way either.

**Two further guards shipped with it:**

- `on_booking_terminal_close_reschedule` (trigger on `bookings`) closes any
  open request as `cancelled` when its booking reaches `cancelled`/`completed`/
  `no_show`. Deliberately a separate, narrowly-scoped trigger rather than an
  edit to `handle_booking_status_change()` — that function owns every lifecycle
  notification in the app, and redeploying it to add an unrelated concern is
  what silently reverted the group-dedup fix on 2026-08-08. No notification: the
  booking's own status change already tells both parties.
- `process_auto_complete_bookings()` now skips a booking with an open request.
  Defence in depth — the deadline already makes this unreachable — and safe
  against stranding a booking forever precisely *because* expiry is guaranteed.

Three already-stranded rows were closed by the migration's backfill (silently:
telling someone their request expired days after the appointment happened is
noise, not news).

**App side:** `TERMINAL_BOOKING_STATUSES` / `pendingRescheduleStatusOverride()`
in [src/types/booking.ts](src/types/booking.ts) replace the inline condition in
`BookingContext` that named CANCELLED and NO_SHOW but omitted COMPLETED — which
is what forced `a1b9c766`'s booking back to `UPCOMING`, and since
`BookingsScreen` also filters pending-reschedule bookings out of Past, it could
never leave the Upcoming tab. Covered by
[rescheduleTerminalBookingGuard.test.ts](src/tests/rescheduleTerminalBookingGuard.test.ts).

**STILL OPEN, deferred 2026-08-26:** expiry can leave the client unable to
cancel either. Cancelling is governed by a separate window
(`cancel_own_booking()` → `cancellation_notice_hours` / `cancelNotice`) and
nothing connects the two, so a client who asked to reschedule in good time can
find that by the time the provider's silence resolved, their cancellation right
has lapsed — and a no-show inside 24h then increments `late_cancel_count`
against *them*. Worse the longer the provider's notice period.

Full analysis and the two candidate fixes are in `FUTURE_SCALE.md`. Not built:
one of the options is a no-penalty cancellation, which has real liability
attached (`LEGAL-COMPLIANCE-NOTES.md` §12) and is a product/legal call. The
cancellation policy is untouched and the expiry copy promises nothing about it.

### 7b. Client-facing failure copy

Reschedule is the flow with the most server-side rejections, so what the client
actually reads matters. Every rejection is a `RAISE EXCEPTION` (SQLSTATE
`P0001`) from `request_reschedule_own_booking()`/`confirm_reschedule_own_booking()`,
and each one has a named branch in `RescheduleScreen`'s submit `catch`:

| Guard | What the client sees |
|---|---|
| `This provider requires N hours notice to reschedule` | "Too Close to Reschedule" + message-them-directly, then back |
| `This provider allows a maximum of N reschedule(s) per booking` | "No Reschedules Left" + message-them-directly, then back |
| `A reschedule request is already in progress for this booking` | "Reschedule Already Requested" — framed as normal state, not an error |
| `You can reschedule again in N hours` | Shown verbatim (already written for a client) |
| `Booking not found` | "Booking No Longer Available" + bounce to Bookings to re-sync |
| `23505` / `23P01` | "Time No Longer Available. Please choose a different time." |
| anything else | Generic "We couldn't reschedule that just now." + full error logged |

The verbatim rows go through `err.message` directly, **not**
`toUserMessage()` — that helper matches on wording and would replace an
unmatched message with its fallback, which is how "You can reschedule again in
6 hours" used to reach the client as "That time is no longer available."
(fixed 2026-08-21). Provider-side actions use
`toUserMessageAllowingDbGuard()`, which shows `P0001` guards verbatim *except*
the ones in `GUARD_TRANSLATIONS` ([userFacingError.ts](src/utils/userFacingError.ts))
— developer-formatted guards like `Invalid status transition: in_progress ->
in_progress` are translated before a provider ever sees them.

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
