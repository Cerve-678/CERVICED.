# Payments
#security #client-decides

Money on a booking. **This is the biggest trust gap in the app** → [[Client vs Server Authority]] #1–#3.

## The money fields (on `bookings`)
`base_price`, `add_ons_total`, `service_charge`, `deposit_amount`, `amount_paid`, `remaining_balance`, `payment_status` (`pending | deposit_paid | fully_paid | refunded | failed`), `payment_type` (`full | deposit`).

## How they're set today
The **client computes and inserts them** at checkout (`src/contexts/BookingContext.tsx` ~1349 breakdown, ~1478 insert). Deposit/service-charge rates are derived from what was charged.

**Deliberately not built**: the app does not collect, verify, or attest to an off-app remaining-balance payment between client and provider — a "mark balance collected" feature existed and was **removed on purpose**. If money isn't moving through the app's own processor, the app has no business tracking its status. Don't re-add this.

## Why that's a problem
Nothing server-side validates the amounts. A modified client could insert `base_price: 0` or `payment_status: 'fully_paid'`. For a payments app this is the #1 thing to move server-side.

## The fix (proposed, not built)
- BEFORE INSERT trigger (or a `create_booking` RPC) that **recomputes** price from the real `services.price` + selected add-ons and **ignores** client-supplied money fields.
- A BEFORE UPDATE trigger constraining `payment_status` / `status` transitions so a client can't self-mark paid/completed.

## Stripe status

The Stripe Payment Sheet path is implemented but deliberately disabled in
`CartScreen` (`USE_STRIPE_PAYMENTS` is hard-coded to `false`). It uses
`create-payment-intent` and `finalize-payment-intent` Edge Functions with
manual capture: the card is authorised first, bookings are created, then the
payment is captured (or cancelled if booking creation fails).

**Do not enable it yet.** `create-payment-intent` currently accepts the total
amount supplied by the client. Before live activation, checkout must calculate
the charge from server-authoritative service, add-on, promotion, and deposit
data; the client must not be the source of truth for money.

## Connections
[[Booking Flow]] · [[Client vs Server Authority]] · [[Services]] · [[Data Layer — Supabase]] · [[Cancellations]]

## Open questions
- Where is the Stripe charge actually created — client SDK, edge function, or webhook? #todo
- Is `remaining_balance` recomputed anywhere server-side? #needs-verification
