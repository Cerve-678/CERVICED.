# Booking Authority Hardening

Phase 2 design record. This is the next implementation track after the migration baseline: make booking price, payment amount, booking status and add-ons server-authoritative.

## Verified live findings — 2026-08-09

### What the database currently protects

- `enforce_booking_bookability` exists and the booking-overlap/status triggers are live.
- Client booking RLS permits an authenticated caller to **insert** a booking when `user_id = auth.uid()`.
- Provider RLS permits a provider to insert their own-provider booking rows; both roles have read policies.
- There is no general client booking `UPDATE` policy in the inspected live policy set.
- Service and active add-on public reads are gated by a live, active provider.

### What remains client-controlled

The client booking insert policy does not constrain any booking column other than `user_id`. A modified client can supply its own:

- `status`, including a status the UI would not normally choose;
- `base_price`, `add_ons_total`, `service_charge`, `deposit_amount`, `amount_paid`, `remaining_balance` and `payment_status`;
- `end_time`, booking snapshots and group metadata;
- arbitrary booking add-on snapshots after it owns a booking.

The current Stripe `create-payment-intent` Edge Function also accepts `amount` from the client cart. Cart holds and `claim_cart_booking_slots` protect a time, but the claim payload still supplies money and booking snapshot fields from the client.

Separately, the live `SECURITY DEFINER` waitlist-invitation helper is executable by `PUBLIC` and has no caller check; a direct RPC caller can create waitlist bookings with supplied price/snapshot values. This must be removed before treating waitlist automation as a trusted booking path. See [[Privileged RPC Execution Audit]].

The same audit found exposed provider/client data paths outside checkout: an arbitrary-user saved-portfolio mutation, arbitrary info-pack attachment and unowned promotion-audience lookup. These are not payment defects, but they prove the same underlying rule: an RPC interface must establish its own caller, resource ownership and server-owned fields before it writes or returns protected data.

## Target contract

Replace direct client booking inserts and client-price cart-hold claims with a small server-owned checkout state machine.

```text
prepare_checkout(items without price/status)
  → validate client, live provider, active service/add-ons, slots/cap
  → calculate canonical price and payment due
  → create/refresh server-priced on_hold booking rows
  → return checkout batch id + immutable quote

create_payment_intent(checkout batch id)
  → read server-priced holds
  → create Stripe intent for the canonical total

finalize_checkout(checkout batch id, payment intent)
  → verify ownership, intent and amount
  → atomically claim rows as pending/confirmed from provider configuration
  → create server-owned add-on snapshots
  → let existing triggers deliver notifications and side effects
```

The client may send only user intent: provider, service, selected add-on IDs, date/time, notes, client-address details where relevant, and desired deposit/full payment option. It must never send authoritative price, payment status, booking status, end time, provider snapshots or group totals.

The payment endpoint trace and the batch requirements are recorded in [[Payment Intent Authority Audit]].

## Server responsibilities

| Concern | Canonical server source |
|---|---|
| Base price and duration | active `services` row owned by selected provider |
| Add-on validity and total | active `service_add_ons` rows belonging to selected service |
| Deposit/full amount | provider policy plus calculated subtotal/service charge |
| Booking status | provider `auto_accept_bookings` and legal state transition rules |
| End time/buffers | service duration and provider/service buffer settings |
| Provider/client snapshots | canonical provider/user records at booking creation |
| Group metadata | server-generated checkout batch/group rules |
| Stripe capture amount | server-priced held/claimed booking rows only |

## Implementation sequence

1. Create a new immutable migration defining a `checkout_batches` record and typed RPCs. Do not alter existing direct booking flow until compatibility is proven.
2. Move the quote calculation into SQL/RPC and write database tests for prices, add-ons, deposits, auto-accept, cap, inactive service/provider and overlap failures.
3. Change the Stripe Edge Functions to accept only a checkout batch identifier. They read the canonical amount themselves.
4. Change `BookingContext`/`CartScreen` to call prepare → pay → finalize, handling partial failure only through returned server results.
5. Remove direct booking insert/update access for clients and direct client booking-add-on writes after the new path is live.
6. Add contract/E2E tests for Client checkout, Provider receipt/auto-accept, payment failure, expired hold, partial cart handling and retry/idempotency.

## Release gates

- A tampered client cannot create a free booking, self-confirm, use another provider's add-on or charge a different Stripe amount.
- A tampered client cannot invoke internal booking/waitlist routines, attach another provider's info pack, mutate another user's saved list or retrieve another provider's promotion audience.
- A client cannot claim an expired or another user's checkout batch.
- Provider auto-accept, caps, booking-window and overlap behaviour remain identical for normal users.
- All current booking notifications fire exactly once.
- Existing confirmed/pending bookings remain readable by both hats.
- `npm run audit:live-booking-authority` must pass: no direct client booking/add-on writes remain, and the `checkout_batches`, `prepare_checkout` and `finalize_checkout` server route exists.

Connections: [[Booking Flow]] · [[Payments]] · [[Availability & Slots]] · [[Client vs Server Authority]] · [[CERVICED E2E Readiness Programme]]
