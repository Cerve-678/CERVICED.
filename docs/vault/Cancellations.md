# Cancellations
#client-decides

Who can cancel a booking, what gates it, and what the client is told about the consequences. A slice of [[Booking Flow]] with its own moving parts — was scattered as a single bullet there, pulled out here now that it has real substance.

## Who can cancel, and how
- **Client** — `BookingDetailScreen.tsx` cancel modal → `cancelOwnBooking()` (`databaseService.ts`) → RPC `cancel_own_booking` (`supabase/booking_rules_server_enforcement.sql`).
- **Provider** — `ProviderBookingDetailScreen.tsx` (`handleDecline`/`handleCancel`) → `providerCancelOwnBooking()` → RPC `provider_cancel_own_booking`.
- Both are RPC-only — no raw `.update()` on `bookings.status`, consistent with [[Client vs Server Authority]].

## The notice-window gate
`getProviderCancellationPolicy(ById)` (`databaseService.ts`) returns **one number** — hours of required notice. That's the entire schema for cancellation policy today; there is no fee percentage, fixed fee, or forfeiture schedule anywhere.

If the client cancels inside that window, a **blocking alert** fires before the cancel-confirmation modal even opens:
> "This provider requires {N} hours' notice to cancel. Please contact them directly."

This is a pass/fail gate, not a consequence disclosure — it stops early cancellation outright rather than warning what happens if you go ahead.

## What the client sees at the point of cancelling
`BookingDetailScreen.tsx` cancel modal (~line 971): base copy is generic ("Are you sure you want to cancel...This cannot be undone."). If `booking.paymentType === 'deposit'`, a line is appended stating the **£ amount actually paid** (a fact the app can verify — same figure used in the receipt breakdown) plus a generic pointer to "the provider's own cancellation policy."

Deliberately **not** stated: that the deposit *will* be forfeited, or any specific fee amount. Per [[Payments]] / the deposit-liability boundary, the app never tracks whether an off-app deposit/balance was actually collected or refunded between client and provider — it can state what was paid, not what happens to it. See `cerviced-legal-flagger` review from 2026-08-08: Terms & Conditions itself is vague here too ("set by individual providers," no specifics), so there's no existing contract language a more specific UI claim could safely lean on.

`BookingsScreen.tsx` has a `handleCancelBooking`/`showCancelModal` pair that duplicates the notice-window check but **is never wired to a button or rendered modal** — dead code, found 2026-08-08, not yet removed.

## Client → notified on provider-cancel
DB trigger `handle_booking_status_change()` (`supabase/booking_flow_fixes.sql`) fires on `AFTER UPDATE OF status`, excludes the actor, and inserts a `booking_cancelled` notification — so a provider-initiated cancel does reach the client, per [[Notifications]]' "DB triggers own this" rule. Client status render always routes through `mapDbBookingStatus()`, so a provider-cancelled booking correctly shows "Cancelled," not stuck on upcoming. Verified against the file only this session — no live Supabase MCP access — worth a drift check given [[Data Layer — Supabase]]'s history of live/file divergence on this exact trigger file.

## The real gap
Not a wiring bug — a **missing data model**. There's nothing to compute or display a tiered/percentage cancellation fee even where a provider's policy might genuinely have one, because the column doesn't exist. Any future "show the fee that applies" feature needs that schema piece first; the UI can't invent a number it was never given.

## Connections
[[Booking Flow]] · [[Payments]] · [[Notifications]] · [[Client vs Server Authority]] · [[Availability & Slots]]

## Open questions
- Should `getProviderCancellationPolicy` grow a fee-percentage/fixed-fee field, and if so, does that need a Terms & Conditions update first (the UI shouldn't claim more than the contract does)? #todo
- Remove the dead `handleCancelBooking`/`showCancelModal` pair in `BookingsScreen.tsx`. #todo
- Confirm `provider_cancel_own_booking` + the cancellation branch of `handle_booking_status_change()` against the live DB, not just the file. #needs-verification
