# Waitlist
#server-authoritative

**A freed slot is now held for the best-matching waitlisted client, exclusively, for real** — not just a "tap to book" notification racing against strangers. `supabase/waitlist_holds.sql`.

## What it replaced
Previously, `invite_next_waitlist_entry()` (when `autoAcceptWaitlist` was off) just sent a generic notification with no date/time and no reservation — a waitlisted client had zero actual priority over anyone else independently booking the same freed slot. It also ignored `preferred_dates` entirely (collected via `ProviderProfileScreen`'s join-waitlist modal, never read), and `expires_at`/`'expired'` existed in the schema but were never enforced by anything.

## The flow
1. **A slot frees up** (cancellation, or a hold expiring — see step 4) → `invite_next_waitlist_entry(provider_id, service_id, date, time, …)` runs.
2. **Pick the best match**, looping through candidates in order until one succeeds:
   - `status = 'waiting'`, service matches (or no preference).
   - The freed date falls inside their `preferred_dates` range (or they said any date is fine — `NULL` array).
   - Ordered: service-specific match first, then queue `position`.
3. **Reserve it for real.** A genuine `bookings` row is created with status **`on_hold`** and `hold_expires_at = NOW() + 3 hours`. Because it's a real row (not a side table), every existing overlap check — the `bookings_no_overlap` EXCLUDE constraint, `enforce_booking_bookability`'s own overlap check — automatically treats it as occupied. Nobody else can book it out from under the held candidate. Client gets a push: "held for you for 3 hours."
   - If `autoAcceptWaitlist` is on, it skips the hold entirely and inserts a normal `pending` booking directly — no exclusivity window needed since it's committing immediately.
4. **What happens to the hold:**
   - **Claimed** (`claim_waitlist_hold`, client-invoked RPC) → becomes a real `pending`/`confirmed` booking, both parties notified.
   - **Declined** (`decline_waitlist_hold`) → cancelled immediately, and the **next** matching candidate is offered the same slot right away — no reason to make them wait out the window.
   - **Ignored** → a cron job (`expire_waitlist_holds()`, every 15 min) cancels any hold past `hold_expires_at`, marks that waitlist entry `'expired'`, and cascades to the next candidate — same as an active decline.
5. **Nobody qualifies** → falls through to the public, same as a normal cancellation with no waitlist.

## Why a hold is a real `bookings` row, not a separate table
Reusing `bookings` means the hold is respected by every overlap-prevention mechanism that already exists, for free. Trade-off: several other places that assume "a bookings row means a real booking" needed a small `status != 'on_hold'` / `status IN (…, 'on_hold')` guard added:
- `handle_new_booking()` early-returns on `status = 'on_hold'` — no "request sent" notification for a hold the client hasn't agreed to yet.
- `enforce_booking_bookability()`'s overlap check now includes `on_hold` alongside pending/confirmed/in_progress.
- **`client_bookings` view excludes `on_hold` rows entirely** (`WHERE b.status != 'on_hold'`) — a client should never see an unclaimed hold in their bookings list as if it were a real appointment.
- Neither claim nor decline matches any branch in `handle_booking_status_change()` (its branches key off specific named `OLD.status` transitions, `on_hold` isn't one) — so `claim_waitlist_hold`/`decline_waitlist_hold` each send their own explicit notification rather than relying on that trigger, avoiding double-notifying or silently notifying nobody.

## Security
`claim_waitlist_hold`/`decline_waitlist_hold` both check `v_booking.user_id != auth.uid()` internally, **and** are explicitly locked down against the anon-execute gap documented in [[Address Release]] (`REVOKE ALL … FROM public` + `REVOKE EXECUTE … FROM anon`, not just the first one alone).

## Connections
[[Booking Flow]] · [[Notifications]] · [[Data Layer — Supabase]] · [[Availability & Slots]]

## Open questions
- 3-hour hold window is hardcoded — should it be provider-configurable like `address_release_policy` is? #todo
- No `RUN_ALL_MIGRATIONS.sql` entry for this file yet — a fresh environment has no waitlist-hold behavior at all. #todo
