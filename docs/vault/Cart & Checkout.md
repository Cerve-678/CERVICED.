# Cart & Checkout

Everything between "add to cart" and "payment sheet opens". Once a booking row
exists, [[Booking Flow]] takes over.

`src/contexts/CartContext.tsx` · `src/screens/client/CartScreen.tsx` ·
`src/features/cart/` (`pricing.ts`, `presentation.ts`, `platformFee.ts`)

The cart is **client-only** — never read it from a provider screen, see
[[Client vs Provider Hats]].

## What a cart item is

`CartItem` is a *service instance*, not a quantity. Booking the same service
twice puts two items in the cart (`addServiceInstance`), because each one needs
its own date, time and add-ons. Items persist to AsyncStorage
(`STORAGE_KEYS.CART_ITEMS`) so the cart survives a restart.

Each item carries its own schedule (`selectedDate`, `selectedTime`), `addOns`,
`notes`, `isDepositOnly`, and `policyAcceptedAt`.

`bookingBatchId` is what makes a **group**: several services for the same
provider, scheduled back-to-back, rendered as one card and booked as one
appointment. Editing one service out of a group clears its batch id — it stops
running back-to-back, so it stops being part of that group.

## How the screen is organised

- **Provider sections**, collapsible. Adding an item collapses every *other*
  section, so you're always looking at what you just did. Anything added in the
  last `JUST_ADDED_WINDOW_MS` (60s) counts as "just added" on first mount.
- **Render units** inside a section: a `GroupedServiceCard` for services sharing
  a `bookingBatchId`, a `ServiceCard` for everything else.

## Money

Three numbers that have to reconcile, and they're computed per item, not from
the cart total:

- **Service price** — `getCartItemFullPrice()` (base + add-ons).
- **Deposit** — per service, set by the provider. Read the mode through
  `resolveDepositMode()`, never `depositRequired`/`depositOnly` → [[Payments]].
- **Platform fee** — `calculatePlatformFee()`, once per checkout. Tiered
  (£1.99 / £3.99 / £5.99 / £9.99) on the full-payment subtotal, or a flat £0.99
  for an all-deposit checkout. **Never taken out of the provider's deposit** —
  it's added on top.

A cart can mix deposit and pay-in-full services for the same provider, which is
why the group footer prints service total, charged now, and remaining
separately.

Promo discounts are baked into the checkout snapshot rather than applied at
payment time, so the discounted price flows through validation, payment and the
saved booking identically. A note on the booking tells the provider which code
was redeemed.

## The checkout sequence

1. **Preconditions** (`handleCheckout`) — everything scheduled, every date
   readable, no scheduling conflicts. See *Error design* below.
2. **Snapshot** — items + bookings are frozen into `checkoutSnapshot`. Nothing
   downstream reads live cart state, so editing mid-checkout can't change what's
   being paid for.
3. **Review** — customer details, then the Terms + cancellation-policy checkbox.
   Ticking it stamps `policyAcceptedAt` on every item. This is app-wide consent,
   and is **separate** from a provider's own T&Cs, which are agreed per service
   in the booking sheet before the item ever reaches the cart.
4. **Reserve** — on "Confirm & Pay":
   - Stripe path (`USE_STRIPE_PAYMENTS`): `prepareCheckout()` returns a
     `checkoutBatchId` and the server's own `amountDue`.
   - Otherwise: `holdCartCheckoutSlots()` writes `on_hold` booking rows with a
     `hold_batch_id` → [[Availability & Slots]].
   Either way the slot is reserved *before* the payment sheet opens, closing the
   window between "committed to paying" and "booking inserted".
5. **Pay**, then `createBookingsFromCart()` → [[Booking Flow]].

The hold's real backstop is the 10-minute TTL cron sweep, not a client-side
abandon signal — this app has no reliable one.

`createBookingsFromCart` deliberately **skips** its own pre-flight conflict check
when a `holdBatchId` is present: `hold_cart_booking_slots()` already did that
check server-side, and re-running it would find this cart's own `on_hold` rows
and reject every item as unavailable.

> ⚠️ **Two payment paths coexist on purpose.** `USE_STRIPE_PAYMENTS` is
> `env.stripePaymentsEnabled && !env.isExpoGo`. When it's off, `PaymentModal`
> collects raw card fields itself — a mock flow, not PCI-compliant, and not to
> be extended as if it were. See [[Payments]].

## Error design

The rule: **the dialog says *that* something is wrong; the cart says *which* and
*why*.** A dialog is dismissed and gone — it can't be what the client works
from. So every failure that can be attributed to a service flags that service's
own card, and the alert copy stays short.

Flags are `itemId → reason` (`itemIssues`), and the reason is carried as text,
not a boolean — "no time picked yet", "clashes with another service in your
cart" and "someone else took this slot" need different actions, and one
hardcoded banner told the client to re-pick a time that was never the problem.

**Covered:**

| Failure | Found |
|---|---|
| No date/time on an item | Checkout tap |
| Unreadable date | Checkout tap |
| Two services overlapping, same provider, same day | **On render** — `findCartOverlapIssues()`, no network |
| Slot taken by someone else since it was picked | Checkout tap — `validateCartBookings()` |
| Slot hold failed at "Confirm & Pay" | Re-runs the per-item check to attribute it |
| Booking failed after payment | `23505` → "taken while you were paying"; anything else → generic |

**Not covered** (alert only, nothing goes red): `prepareCheckout` rejections
that aren't slot conflicts (the safety-ack gate, an unresolved provider id);
anything not attributable to one item (provider no longer live, service deleted,
invalid promo, card declined); and plumbing failures ("Failed to clear cart",
the outer `handleCheckout` catch).

**A flag must be visible to be worth anything.** Since checkout collapses
sections, any provider holding a flagged service is auto-expanded. It's keyed on
*which* providers are flagged, not run continuously, so re-collapsing by hand
sticks — and the header then keeps a "N services need attention" count with a red
section border, so a closed section never hides the problem.

Back-to-back is deliberately **not** an overlap. That's how a group is built.

## Weak spots → [[Client vs Server Authority]]

- `validateCartBookings()` awaits `isSlotAvailable` **once per item** — an N+1
  over the cart, against the repo's own scalability rule. Now called from the
  hold-failure path too (an error path only).
- Prices are client-supplied on the non-Stripe path. `prepareCheckout()` returns
  a server-computed `amountDue`; the mock path does not.

## Emergency requests pass through here, they don't originate here
The cart is a **carrier** for this, not the owner — the decision was made back
in the booking sheet. `CartItem.emergencyRequest` (reasons + `acknowledgedAt`)
rides along to `prepareCheckout` as `emergency` / `emergency_ack`, and on the
legacy non-Stripe path as `is_emergency_request` on the **hold** (that's the
insert the bookability trigger fires on, not the claim). Two things to keep
right when touching cart scheduling:

- Editing a cart item's date/time must **clear** the flag — it's passed to
  `updateCartItem` unconditionally, not spread-when-present, so a stale
  acceptance can't survive onto a time it no longer describes.
- Reopening an item in edit mode must **restore** it (`initial.emergencyRequest`),
  or changing only the notes would strip the flag and the unchanged time would
  then be rejected by the very rule it was accepted under.

Mechanism and the provider opt-ins → [[Availability & Slots]].

## Connections

[[Booking Flow]] · [[Availability & Slots]] · [[Payments]] · [[Cancellations]] ·
[[Contexts]] · [[Client vs Provider Hats]] · [[Client vs Server Authority]]

## Open questions

- Should the uncovered failures (provider went offline, service deleted) also
  flag the item, or is an alert genuinely the right surface for them?
  #needs-decision
- Is the N+1 in `validateCartBookings()` worth batching into one query, given it
  runs on every checkout tap? #needs-decision
