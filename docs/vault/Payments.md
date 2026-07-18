# Payments
#security #client-decides

Money on a booking. **This is the biggest trust gap in the app** → [[Client vs Server Authority]] #1–#3.

## The money fields (on `bookings`)
`base_price`, `add_ons_total`, `service_charge`, `deposit_amount`, `amount_paid`, `remaining_balance`, `payment_status` (`pending | deposit_paid | fully_paid | refunded | failed`), `payment_type` (`full | deposit`).

## How they're set today
The **client computes and inserts them** at checkout (`src/contexts/BookingContext.tsx` ~1349 breakdown, ~1478 insert). Deposit/service-charge rates are derived from what was charged. Provider balance collection: `markBalanceCollected` (`ProviderBookingDetailScreen`).

## Why that's a problem
Nothing server-side validates the amounts. A modified client could insert `base_price: 0` or `payment_status: 'fully_paid'`. For a payments app this is the #1 thing to move server-side.

## The fix (proposed, not built)
- BEFORE INSERT trigger (or a `create_booking` RPC) that **recomputes** price from the real `services.price` + selected add-ons and **ignores** client-supplied money fields.
- A BEFORE UPDATE trigger constraining `payment_status` / `status` transitions so a client can't self-mark paid/completed.

## Stripe?
Payment-method screens exist (`DbPaymentMethod`, `stripe_payment_method_id`) and `DbTransaction` has `stripe_payment_intent_id`. Actual charge flow / edge function integration is **unverified here** — trace `checkoutService.ts`. #needs-verification

## Connections
[[Booking Flow]] · [[Client vs Server Authority]] · [[Services]] · [[Data Layer — Supabase]]

## Open questions
- Where is the Stripe charge actually created — client SDK, edge function, or webhook? #todo
- Is `remaining_balance` recomputed anywhere server-side? #needs-verification
