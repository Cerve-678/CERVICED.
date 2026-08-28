# Payment Intent Authority Audit

Live-code audit performed 2026-08-09. This records the current Stripe checkout boundary and the required replacement before real payment is enabled.

## Current path

```text
CartScreen calculates effectiveFinalTotal in the app
  → create-payment-intent({ amount: totalAmount })
  → Stripe authorises that client-provided amount
  → BookingContext directly inserts bookings with client-calculated prices,
    payment status, amount paid and PaymentIntent ID
  → finalize-payment-intent optionally captures an amount supplied by the app
```

`finalize-payment-intent` limits a partial capture to the sum of persisted `bookings.amount_paid` rows associated with the intent. That is not sufficient authority: those booking rows and their `amount_paid` values are currently client-writable at initial booking creation.

The active Stripe payment sheet is also marked as not yet wired for a real production payment rollout in `CartScreen`; this must remain true until the replacement contract has passed staging and E2E verification.

## Required server-owned state

One checkout batch must exist before any PaymentIntent is created. It owns:

| Field | Authority |
|---|---|
| `id`, `client_user_id`, expiry and idempotency key | server |
| provider/service/add-on selections | validated client intent |
| service duration/end time, provider/client snapshots | server lookup |
| base price, add-ons, service charge, deposit and total due | server calculation |
| hold booking rows and availability decision | transaction/RPC |
| Stripe PaymentIntent ID and authorised amount | server |
| final booking state/payment state | server after Stripe verification |

The mobile app can request a quote with service/add-on IDs and time choices; it cannot submit a money amount, status, end time, snapshot, group total or `amount_paid`.

## Replacement sequence

1. `prepare_checkout` validates the caller, active/live provider, service/add-ons, booking window, slot/cap and group rules inside one transaction. It persists a server-calculated expiring checkout batch and held booking rows.
2. `create-payment-intent` accepts only `checkoutBatchId`, reads its owner and canonical due amount, and stores the generated Stripe ID on that batch. It is idempotent for an unexpired batch.
3. The payment sheet authorises the returned secret.
4. `finalize_checkout` receives batch ID and Stripe ID, verifies the intent against the batch’s stored amount/currency/owner/status, atomically marks the held rows paid and claims them using the server’s legal booking state transition.
5. Capture/cancel is driven by `finalize_checkout` server result, never by a client amount. A Stripe webhook must reconcile asynchronous status/capture failures.
6. Only after the new route is proven should direct client `bookings` insert and client `booking_add_ons` writes be removed.

## Required tests

- A modified request cannot create an intent for less/more than a prepared batch.
- A batch is single-owner, expires reliably, cannot be replayed and cannot be captured twice.
- Changing a service/add-on price after preparation does not change the quoted batch; expiry/re-prepare applies the current price.
- A wrong provider’s add-on, non-live provider, inactive service and overlapping/capped slot all fail before an intent exists.
- Full payment, percentage deposit and fixed deposit are calculated from provider policy exactly once.
- A partial cart outcome either follows an explicitly designed per-line payment model or is rejected atomically; it must not be inferred from client `amount_paid` values.
- Client and provider notifications, availability, address rules and booking history remain correct after finalisation.

## Release block

Do not deploy the Stripe Edge Functions as a production payment flow until the canonical migration baseline, the batch/RPC route, a Stripe webhook reconciliation path and the above tests are in place.

Connections: [[Booking Authority Hardening]] · [[Payments]] · [[Booking Flow]] · [[CERVICED E2E Readiness Programme]]
