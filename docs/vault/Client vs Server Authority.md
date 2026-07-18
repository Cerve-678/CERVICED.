# Client vs Server Authority
#security #server-authoritative

The single most important lens for this app: **who decides?** If the client decides something sensitive, a tampered or curious app can bypass it. The fix is always to move the decision into Postgres (RLS, a trigger, an RPC, or a gated view).

## Already server-authoritative ✅
- **Double-booking / availability** — the `enforce_booking_bookability` trigger (`supabase/availability_v2.sql`) rejects overlaps, past dates, out-of-hours, blocked dates, notice/window on every insert. See [[Availability & Slots]].
- **Address release** — the `client_bookings` view masks the address until released; the client never receives it early. See [[Address Release]]. #server-authoritative
- **Status-change side effects** — notifications/waitlist fire from DB triggers. See [[Notifications]].

## Client still decides — candidates to fix 🚧
Ordered most-dangerous first.

| # | Client decides | If it lies… | Fix mechanism |
|---|---|---|---|
| 1 | **Payment amounts** — app inserts `base_price`, `deposit_amount`, `amount_paid`, `payment_status` (`src/contexts/BookingContext.tsx` ~1478) | book for £0 / self-mark paid | BEFORE INSERT trigger or `create_booking` RPC recomputes from `services.price` | 
| 2 | **Booking cap / auto-accept** — `max_bookings_per_day` counted client-side; client sets `status:'confirmed'` | exceed cap / self-confirm | extend `enforce_booking_bookability`; set confirmed status from provider `auto_accept` server-side |
| 3 | **Status transitions** — `updateBookingStatus` writes any status | self-mark `completed`, skip payment | BEFORE UPDATE trigger validating legal transitions |
| 4 | **Provider visibility** — every query must filter `has_gone_live` | one missed filter leaks unlaunched providers | move to **RLS on `providers`** |
| 5 | **Cancel / reschedule eligibility** — notice window & max-reschedules computed client-side | cancel past cutoff / over-reschedule | `cancel_booking` / `request_reschedule` RPCs |

See [[Payments]] for #1–#3, [[Provider Onboarding & Go-Live]] for #4, [[Booking Flow]] for #5.

## The pattern to apply
1. Put the raw sensitive data behind a **gated view** or keep it out of client reads.
2. Enforce mutations with a **trigger** (automatic) or **SECURITY DEFINER RPC** (explicit action).
3. Leave RLS to gate *rows*; use triggers/views to gate *columns and transitions*.

## Connections
[[Architecture Overview]] · [[Address Release]] · [[Availability & Slots]] · [[Data Layer — Supabase]] · [[Payments]]

## Open questions
- Do current RLS policies allow a client to UPDATE arbitrary columns on their own booking (price/status)? #needs-verification #todo
