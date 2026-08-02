# CERVICED — Waitlist System

Reference doc for the waitlist feature as redesigned in
[waitlist_holds.sql](supabase/waitlist_holds.sql). See [BOOKINGS.md](BOOKINGS.md)
for the general booking lifecycle this plugs into.

---

## 1. What problem this solves

The original design (`waitlist_automation_settings.sql`) sent the top waiter
a bare "tap to book" notification with no date/time and no reservation —
whoever's `INSERT` landed first won, waitlisted client or not. It also
collected a preferred-date range but never checked it, never enforced its own
`expires_at`, and only ever tried one candidate per cancellation. The
redesign fixes all four:

1. A freed slot is now genuinely **held** for the best-matching candidate —
   not just first-come-first-served.
2. The client's stated date preference is actually respected.
3. An unclaimed/declined hold **auto-cascades** to the next candidate instead
   of the slot going stale forever.
4. Queue position is visible.

## 2. Data model

Two tables involved:

**`public.provider_waitlist`** ([waitlist_schema.sql](supabase/waitlist_schema.sql)) —
one row per client-waiting-for-a-provider(+optionally a specific service):

| Column | Notes |
|---|---|
| `service_id` | `NULL` = "any service from this provider" |
| `preferred_dates` | `DATE[]`. **`[0]`** = range start, **`[1]`** (optional) = range end. `NULL` = any date at all. This is a real date-range picker the join modal already had (`waitlistDateFrom`/`waitlistDateTo`, [ProviderProfileScreen.tsx:2111](src/screens/ProviderProfileScreen.tsx#L2111)) — the redesign made the *backend* finally read it, no new UI needed. |
| `position` | Auto-assigned per provider+service by an insert trigger (`assign_waitlist_position()`) — FCFS tiebreaker within a service |
| `status` | `waiting → notified → booked` (happy path) or `→ expired` (missed/declined a hold) or `→ cancelled` (left voluntarily) |
| `expires_at` | 30 days from joining — the row itself goes stale, distinct from a hold's `hold_expires_at` on the linked booking |

**`public.bookings`** gained two columns for this:

| Column | Notes |
|---|---|
| `waitlist_entry_id` | Nullable FK — links a hold (and its eventual real booking) back to the waitlist entry that earned it |
| `hold_expires_at` | Only set while `status = 'on_hold'` — cleared on claim |

And a new status value, **`on_hold`** — a real `bookings` row, not a separate
holds table. This is the key design choice: reusing `bookings` means the
hold is automatically respected by *every* existing overlap mechanism (the
`bookings_no_overlap` exclusion constraint, `enforce_booking_bookability()`'s
own check, every app-side availability query) with no parallel
conflict-checking system to keep in sync.

## 3. Join flow

`ProviderProfileScreen.tsx`'s waitlist modal → `joinWaitlist()`
([databaseService.ts](src/services/databaseService.ts), moved here from a
standalone `WaitlistService.ts` that used to call Supabase directly — a
boundary violation fixed as part of this redesign) → deletes any stale row
for the same provider+service, then inserts fresh. The waitlist button only
appears when `hasNearTermAvailabilityForServices` confirms nothing's
bookable in the next 14 days (see [BOOKINGS.md §4b](BOOKINGS.md#4b-fully-booked)),
and only if the provider's `automation_settings.waitlistEnabled !== false`.

## 4. The hold mechanism

`invite_next_waitlist_entry()` ([waitlist_holds.sql](supabase/waitlist_holds.sql)) —
called from `handle_booking_status_change()` on every transition into
`cancelled` (i.e., whenever a slot actually frees up), passing the freed
slot's provider/service/date/time/price through.

```
1. Bail if automation_settings.waitlistEnabled is off (default: on)
2. Select candidates:
     provider_id matches, status = 'waiting',
     (service_id matches OR service_id IS NULL),
     freed date falls within [preferred_dates[0], preferred_dates[1] ?? infinity]
       (NULL preferred_dates = always matches)
   ORDER BY exact-service-match DESC, position ASC
3. For each candidate in order, TRY:
     autoAcceptWaitlist ON  → INSERT a real 'pending' booking outright
                              (unchanged from the original design — the
                              provider explicitly wants zero-friction booking)
     autoAcceptWaitlist OFF → INSERT status='on_hold', hold_expires_at = now()+3h,
                              waitlist_entry_id = this candidate's row,
                              send a notification carrying this booking's id
                              and the actual date/time (not just "tap to book")
   On success: mark the waitlist entry 'notified' (or 'booked' for
   auto-accept) and STOP.
   On failure (bookability rules no longer clear — notice window, working
   hours, a concurrent write): try the NEXT candidate instead of giving up.
4. If every candidate fails: nothing to do, slot is just open to the public,
   same as any other cancellation.
```

`autoAcceptWaitlist` keeps its original meaning (provider wants instant
booking, no confirmation step) — the hold is specifically what happens when
that's *off* (the default), which used to just be a bare notification with
no reservation at all.

**Why a hold blocks everyone else, for free**: `on_hold` is not in the
exclusion constraint's `WHERE status NOT IN ('cancelled', 'no_show')`
excluded set, so it's already "active" as far as `bookings_no_overlap` is
concerned. It's also added explicitly to the handful of app-side
`.in('status', [...])` availability queries
([AvailabilityService.ts](src/services/AvailabilityService.ts),
[databaseService.ts:1132](src/services/databaseService.ts#L1132)) and to
`enforce_booking_bookability()`'s own overlap check
([waitlist_holds.sql](supabase/waitlist_holds.sql), step 3 of the migration).

## 5. Expiry & cascade

`expire_waitlist_holds()`, run every 15 minutes via `pg_cron`
(`expire-waitlist-holds` job):

```
For every booking WHERE status='on_hold' AND hold_expires_at < NOW():
  → flip it to 'cancelled'
  → flip its waitlist entry to 'expired' (the status value the schema always
    had but nothing ever set until now)
  → PERFORM invite_next_waitlist_entry() again for that same freed slot
    (provider/service/date/time carried on the booking row) — cascades to
    whoever's next in line automatically.
```

`decline_waitlist_hold(booking_id)` does the same cancel+cascade
immediately, client-invoked — so an active "no thanks" doesn't make the next
person wait out the full 3 hours.

## 6. Claiming a hold

`claim_waitlist_hold(booking_id)` — SECURITY DEFINER RPC, verifies the caller
owns the hold and it hasn't expired, then:

- Provider has `auto_accept_bookings` on → straight to `confirmed`, sends the
  normal "Booking Confirmed" wording itself.
- Otherwise → `pending`, sends the normal "Booking Request Sent" +
  "New Booking Request" pair itself.

Neither transition (`on_hold → confirmed` / `on_hold → pending`) matches any
branch in `handle_booking_status_change()` (its branches all key off
specific named `OLD.status` values, none of which is `on_hold`) — so
`claim_waitlist_hold` sending its own explicit notification is deliberate,
not a workaround: nothing else will fire for this transition, so there's
nothing to double up with. Separately, `handle_new_booking()` (fires on
every `INSERT`) got an early-return guard for `NEW.status = 'on_hold'` — the
hold's own INSERT would otherwise have prematurely told the client "your
request is awaiting confirmation" and the provider "new booking request" for
something the client hasn't even seen yet.

## 7. UI surfaces

**Client**:
- Waitlist chip on the provider profile — `Waiting · #{position}` or
  `Slot Held — Confirm!` when a hold is active
  ([ProviderProfileScreen.tsx:2971](src/screens/ProviderProfileScreen.tsx#L2971)).
- Tapping the `waitlist_slot_available` notification (cold-start push or
  in-app) deep-links straight to a **Confirm/Decline modal**
  ([BookingsScreen.tsx](src/screens/BookingsScreen.tsx)) showing the actual
  service, provider, date, and time — fetched directly by booking id via
  `getBookingById()`, since a not-yet-claimed hold is deliberately excluded
  from the normal bookings list (`client_bookings` view) so it never shows
  as a phantom confirmed appointment. Confirm → `claimWaitlistHold`; Decline
  → `declineWaitlistHold` (cascades immediately).

**Provider** (`ProviderBookingHistoryScreen.tsx`'s Waitlist tab):
- Each entry shows `Waiting · #N` or `Holding Slot` with an estimated expiry
  time (`notified_at + 3h`, computed client-side for display — not an
  authoritative countdown).
- Preferred-date range now renders as an actual range ("12 Aug – 30 Aug" or
  "12 Aug onward") instead of a comma-joined date list.
- Manual **"Schedule & Invite"** — a provider hand-picking someone books them
  outright (`insertDirectBooking`, unchanged) rather than placing a hold —
  there's no public race to protect against when the provider is the one
  deliberately choosing right now.

## 8. Known limitations

- Hold window (3 hours) is a fixed constant, not per-provider configurable —
  reasonable default for v1, not exposed as a setting yet.
- The provider's hold-expiry estimate in the Waitlist tab is computed
  client-side from `notified_at`, not fetched from the actual
  `hold_expires_at` on the linked booking — cosmetic drift only if the
  constant ever changes without updating both places.
- `preferred_dates` matching is a plain date-range containment check — no
  day-of-week or partial-day preference (e.g. "weekday afternoons only").
