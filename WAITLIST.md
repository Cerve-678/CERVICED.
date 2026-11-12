# CERVICED — Waitlist System

How the in-app waitlist works: a client joins a fully booked service, a freed
slot is held for them, and they pay for it at checkout. Rewritten for
`supabase/migrations/20261112100000_waitlist_pays_at_confirm.sql` (10 Nov 2026),
which replaced the earlier free "claim". The money side is also in
`docs/PAYMENTS_AND_LOGIC.md` §2.1. See `BOOKINGS.md` for the booking lifecycle.

---

## 1. The rules (decided 2026-11-10)

1. A freed slot is **held** for the next matching client for **15 minutes**
   (`waitlist_hold_duration()`), as an `on_hold` booking.
2. They **confirm and pay** through the normal checkout. The 15 minutes keep
   running while they pay; a failed payment can be retried until time is up.
   Nothing is booked until `finalize_checkout()` captures the payment.
3. **Missing the 15 minutes, or passing, takes them off that waitlist.** They
   can rejoin (back of the line).
4. What happens next is the provider's **"Offer it to the next person
   automatically"** setting (`automation_settings.autoAcceptWaitlist`):
   - **On:** the slot is held for the next person in line.
   - **Off:** the slot opens to everyone straight away and comes back to the
     provider (`waitlist_released_slots`), who can offer it to the next in
     line or pick someone.
5. A provider's own offer ("Offer a time", or offering a released slot) is a
   15-minute hold too, never an unpaid booking.
6. **Queue order** decides who's first. "Any day" and a date range are equal;
   the dates only decide whether someone matches.
7. A place lasts until the client leaves, books, or the provider removes them.

## 2. Data

**`provider_waitlist`**, one row per client per provider + service
(`service_id` NULL = any service, which Becca uses):

| Column | Notes |
|---|---|
| `preferred_dates` | `date[]`: `[1]` start, `[2]` optional end. NULL = any date |
| `position` | Set on insert by `assign_waitlist_position()`; not renumbered when someone leaves, so the real place is counted (`get_my_waitlist()`) |
| `status` | `waiting` → `notified` (held) → `booked` (paid), or `expired` (missed or passed) |
| `offered_booking_id`, `offered_date`, `offered_time`, `offer_expires_at`, `offer_ended_at` | The last offer. A lapsed hold row is deleted, so this is how "this slot has gone" is shown |

Who can change it (RLS): a client inserts their own row as `waiting`, reads
and deletes their own (not while held). A provider reads their own. Every
other change goes through a function. Before 20261112100000 the one policy was
`FOR ALL`, so a client could set their own `position`.

**`bookings`**: a hold is a real row with `status = 'on_hold'`,
`waitlist_entry_id` and `hold_expires_at`, so every overlap check already
treats it as taken. `client_bookings` never returns `on_hold` rows.

**`waitlist_released_slots`**: slots handed back to a provider (Auto-fill
off), with who didn't take them and why (`missed` / `passed`).

## 3. Functions

| Function | What it does |
|---|---|
| `offer_waitlist_slot(entry, service, date, time, end)` | Inserts the hold, marks the entry `notified`, sends "A slot opened up!". Raises on failure |
| `invite_next_waitlist_entry(...)` | Called by `handle_booking_status_change()` on a cancellation. Tries candidates in order; logs (doesn't swallow) each failure |
| `prepare_checkout(items)` | An item with `waitlist_hold_id` reuses the caller's own unexpired hold and caps the checkout's expiry at the hold's |
| `cancel_checkout(batch)` | Detaches a waitlist hold instead of deleting it, so the client can try again |
| `expire_cart_holds()` | Skips waitlist holds |
| `expire_waitlist_holds()` | Every minute (cron `expire-waitlist-holds`): ends lapsed holds |
| `end_waitlist_hold(id, missed, tell_client)` | Deletes the hold, marks the entry `expired`, tells the client if their time ran out, then rolls it on or hands it back |
| `decline_waitlist_hold(id)` | "Pass it on". Refused while a payment is going through |
| `mark_waitlist_entry_booked()` | Trigger: hold paid → entry `booked` |
| `get_my_waitlist()` | The client's places with their real place in line |
| `update_my_waitlist_dates(entry, dates)` | Change dates without losing their place |
| `provider_offer_waitlist_slot`, `provider_offer_released_waitlist_slot`, `dismiss_released_waitlist_slot`, `get_provider_released_waitlist_slots`, `provider_remove_waitlist_entry` | The provider's side |

`claim_waitlist_hold()` (booked a hold with £0 paid) was dropped.

## 4. Screens

**Client**
- Provider profile: a **Waitlist** button when nothing is bookable in the next
  14 days and the provider has the waitlist on. Once joined, the chip shows
  "2nd in line" (✕ to leave), or **Held for you**, which opens Bookings.
- Bookings: **Held for you** at the top (countdown, Confirm & pay, Pass it on),
  then **Waiting for** (place in line and dates, tap to change dates or leave,
  `WaitlistDatesSheet`), and cards for places whose hold ended (Rejoin,
  Dismiss). `WaitlistPlaceCard`.
- Confirm & pay adds the slot to the Cart at its fixed time
  (`CartItem.waitlistHold`, `buildWaitlistHoldCartItem`). The Cart shows the
  countdown, won't let the time change, and flags the item once the hold ends.
- A notification tapped after the hold ended shows "This slot has gone" with
  Rejoin.

**Provider** (Bookings to-do list, `ProviderBookingHistoryScreen`)
- Waiting clients with their place, **Offer a time** (a held offer) and
  **Remove** (asks first; the client is told).
- "Held for them" with the hold's real end time.
- A released slot: "Ama didn't take Thu 20 Nov, 2:00pm", with Offer it to the
  next in line, Pick someone, Leave it open.

## 5. Not yet

- The whole path has never run with a real client. Rehearse it in Stripe test
  mode after applying the migration: hold, pay, fail and retry, pass, time
  running out, Auto-fill on and off, provider offer.
- Dates only: no "weekdays" or "evenings" preference.
- The hold length is fixed at 15 minutes for every provider.
