# CERVICED — Future Logic

Plain English explanations of features not yet built, what they mean, and exactly what needs to happen when we build them. Read this before starting any of these features so you don't have to re-derive the logic from scratch.

---

## Adding / Inviting Clients (Provider-Initiated Client Relationships)

### What it means

A provider wants an explicit "Add client" action on their Clientele screen — add someone as their client directly, rather than waiting for that person to find them and book.

### What currently happens (why there's no Add button today)

There is no such thing as a stored "client record" in the app. The Clientele list is **derived entirely from bookings**: `getProviderClientele()` reads the provider's own `completed`/`confirmed` bookings and aggregates them into unique people. A person becomes a "client" the moment they have a booking with you, and only then. There is no `provider_clients` / relationship table to insert a row into, and no way to represent a client who has never booked.

On top of that, there is no way to add someone who isn't already a Cerviced user at all — manual bookings (`provider_create_manual_booking`) are deliberately limited to existing app accounts (consent boundary: a real booking creates records, notifications, and address-release against a real person who agreed to the platform). There is no client-invite mechanism in the app today (only `inviteFromWaitlist`, which is waitlist-specific).

So an "Add client" button was removed from the Clientele screen on 2026-08-10 because it could only honestly do one of two things, both of which are their own feature:

### What needs to exist (two separable pieces)

**1. Add an EXISTING Cerviced user as a client without a booking**
- Needs a real relationship table (e.g. `provider_clients: id, provider_id, user_id, added_at, source`) so a client can exist independent of any booking.
- `getProviderClientele()` would union booking-derived clients with these explicitly-added ones (dedupe on `user_id`), and the ClienteleMember shape would need a `booking_count: 0` / "added, not yet booked" state the UI can show.
- RLS: provider can only add/read their own rows; the added user should arguably get some notification/consent signal ("X added you as a client").

**2. Invite a NON-user to Cerviced**
- Net-new invite infrastructure: generate a share/signup link or send an invite (SMS/email), track pending invites, and convert to a real client relationship on signup.
- Almost certainly needs a consent/legal review (unsolicited invites, storing a non-user's contact details) — see `LEGAL-COMPLIANCE-NOTES.md`.

### Related

- Manual booking already exists as its own standalone `AddBookingScreen` (reached from Home → Quick Access), and booking an existing client is the ONE way to make someone appear in Clientele today. The invite empty-state copy on `AddBookingScreen` ("ask them to sign up, then book them in here") is the current stopgap.

---

## Multi-Service Manual Booking (Provider Books Several Services at Once)

### What it means

On `AddBookingScreen`, a provider picks ONE service for the client. They may want to book several services for the same client in one appointment (e.g. "brows + lashes + tint" back-to-back), the provider-side equivalent of the client multi-service cart.

### What currently happens

`AddBookingScreen` is single-select by design: `serviceId` is a single string, and the underlying RPC `provider_create_manual_booking(p_client_user_id, p_service_id, p_booking_date, p_booking_time, p_notes)` takes exactly one service. Selecting a service collapses the list to that one.

### Why it's a real feature, not a UI tweak

- Client-side multi-service booking already exists but is **flagged OFF app-wide** (`MULTI_SERVICE_BOOKING_ENABLED` in `src/constants/featureFlags.ts` — see the Multi-Service section elsewhere in this doc). Bringing multi-service to the provider manual path should follow the same grouped-booking model (`group_booking_id`, all-or-nothing group RPCs), not invent a parallel one.
- The RPC would need to accept multiple services (and their durations, for back-to-back slot math) and create grouped sibling bookings atomically — DB/RPC work plus booking-domain + security review.
- The "When"/slots logic would need to reason about the **combined duration** of all chosen services, not a single service.

### Tied to

- The add-ons-not-persisted gap on `AddBookingScreen` (add-ons are collected in the UI but the RPC drops them) is the same shape of problem: the manual-booking RPC is minimal and needs extending before the UI can honestly persist richer bookings. Do both RPC extensions together if tackling either.

---

## Multi-Staff (Salons with Multiple Team Members)

### What it means

Right now every provider in the app is one person. "Jana Aesthetics" is Jana. Her schedule is her schedule. When someone books, they're booking Jana — and if Jana is busy at 3pm, 3pm is gone.

A salon is different. "Glow Studio" might have three stylists — Priya, Kezia, and Nia. When a client wants a haircut at 3pm, the answer to "is 3pm available?" is not "is Glow Studio free?" It's "is at least one of their three stylists free at 3pm?" If Priya is already booked but Kezia is free, 3pm should still show as available.

The slot only disappears when every single stylist is booked at that time.

### What currently happens (the problem)

Every booking is checked against `provider_id`. The question the code asks is: "does this provider have any booking that overlaps this slot?" That works fine for a solo operator. For a salon it's wrong — you'd block 3pm the moment anyone on the team has an appointment at 3pm, even if two other people are free.

### What needs to exist

**New database table: `staff_members`**

Each row is one person who works under a provider.

```
staff_members
  id           uuid
  provider_id  uuid  → providers.id
  name         text
  role         text   (e.g. 'stylist', 'nail tech', 'therapist')
  avatar_url   text
  is_active    bool
```

**Per-staff availability**

The `provider_availability` table (weekly hours) needs to work at the staff level, not just the provider level. Either:
- Add an optional `staff_member_id` column to `provider_availability` (null = applies to whole provider, set = applies to that person only)
- Or create a separate `staff_availability` table that mirrors the structure

**Per-staff blocked dates**

Same idea — `provider_blocked_dates` needs an optional `staff_member_id` so you can block Priya for a day off without blocking Kezia.

**Bookings assigned to a staff member**

Add `staff_member_id uuid` (nullable) to the `bookings` table. When a booking is created, the system picks the first available staff member for that slot and assigns the booking to them. Or the client can optionally choose a preferred staff member (Fresha does this).

### How the availability logic changes

**Today:** `getAvailableSlots(providerName, date)` asks: "what slots does this provider have that aren't already booked?"

**Multi-staff:** For each slot, ask: "how many staff members are working at this time and how many of them already have a booking?" If the answer is "at least one is free", the slot shows as available.

The function signature stays the same from the outside. Internally, instead of checking for any conflict against `provider_id`, you check: does every staff member have a conflict? Only mark the slot booked if ALL of them do.

The new conflict query would look like:

```
For each slot:
  Get all staff members who are scheduled to work that slot
  Count how many have a confirmed/pending booking at that time
  If count < total scheduled staff → slot is available
  If count = total scheduled staff → slot is fully booked
```

### What the booking flow looks like with multi-staff

1. Client picks a date and time
2. App checks: which staff are free at this time? Picks one (either the one with fewest bookings that day, or random, or the client chose a preference)
3. Booking is created with `staff_member_id` set to that person
4. That person's slot is now blocked — but the same time slot may still be open for other staff

### What shows on the provider dashboard

Provider sees bookings grouped by staff member, not just by time. Each staff member has their own day view. Provider can see who is doing what and when. This is the "team calendar" view that Fresha, Treatwell, and Booksy all have.

### What NOT to build yet

Don't add a client-facing "choose your stylist" screen until the underlying staff assignment logic works. The client experience is optional and can come after the backend is solid.

### Related surface-level ask, deliberately not built (2026-08-19)

A request came in to show team member names on a provider's public profile (next to the existing solo/small-team/large-team pill). Declined as a display-only change — `team_size` is currently just a self-reported label with no `staff_members` rows behind it, and the booking/availability system has no concept of an individual staff member at all (see above). Adding names without the underlying `staff_members` table + per-staff availability would create data that looks structured but isn't backed by anything — a team name with no way to book that specific person, no per-person schedule, nothing. Do this properly as part of the Multi-Staff feature above, not as a quick add-a-column-and-a-text-field job.

---

## Payment Processing (Stripe)

### What it means

Right now the app collects card details and shows a "Pay £X" button. Nothing happens. No money moves. The booking is created as if it were paid.

For launch, money needs to actually move.

### What needs to exist

**Stripe** is the standard payment processor. It handles card validation, PCI compliance, fraud detection, and payouts to providers.

The two Stripe flows that apply here:

**1. Pay in full at booking**
Client pays the full service price when they book. Stripe charges the card immediately. Provider receives the money (minus platform fee) when the appointment is completed.

**2. Deposit at booking**
Client pays 20% (or whatever the provider set) at booking. The remaining balance is collected separately — either through the app before the appointment, or the provider collects cash/card on the day.

### What needs to happen technically

In the Supabase project: create an Edge Function called `create-payment-intent`. This function receives the booking amount, calls the Stripe API to create a Payment Intent, and returns a `client_secret` back to the app.

In the app: replace the fake `PaymentModal` card input with Stripe's official React Native SDK (`@stripe/stripe-react-native`). Their `CardField` component handles the card input securely. You pass it the `client_secret` and call `confirmPayment`. Stripe handles everything else.

After Stripe confirms payment: write a row to the `payments` table (booking_id, amount, stripe_payment_intent_id, status = 'succeeded'). Write a row to the `earnings` table for the provider (amount minus your platform fee).

The `payments` and `earnings` tables exist in the schema and have `stripe_payment_intent_id` / `stripe_payment_method_id` columns already defined. Nothing writes to them yet.

### Platform fee

If CERVICED takes a percentage (e.g. 10%), this is handled via Stripe Connect — each provider has a connected Stripe account, and when a payment goes through you split it automatically. This is more complex and can come after basic payments work.

---

## Intake Form During Checkout

### What it means

Some providers need information from clients before an appointment. A lash tech might ask about eye sensitivity. An aesthetics provider might ask about medical history. A brow artist might ask whether the client has had microblading before.

Providers can build these forms in the app (ProviderIntakeFormScreen). The setting `autoSendIntakeForm` sends the form to the client AFTER booking. But ideally the client fills it in AS PART OF the checkout, so the provider has the info before they confirm.

### What needs to happen

In `CartScreen`, between the "review your details" step and the "pay" step, check: does this provider have an active intake form (`getIntakeFormByBooking` or a new `getProviderActiveIntakeForm`)? If yes, show the form questions as an additional step.

The client answers the questions. The answers are saved to the `intake_form_responses` table (already exists — `getIntakeFormByBooking` reads from it). Then the checkout continues to payment.

On the provider side, when they open a booking detail, the filled-in form appears.

The tricky part: the cart can have services from multiple providers. Each provider may have a different form (or no form). Handle this by showing a form step per provider group in the cart, not one global step.

---

## Advisory Lock for Concurrent Bookings

### What it means in plain English

If 100 people open the booking calendar at the same time and all try to grab the 10am slot, most of the time the current system handles it fine. The unique index on the `bookings` table stops two people from creating the exact same booking.

The gap is: what if Person A books 10am for a 90-minute service, and Person B simultaneously books 10:30am for a 60-minute service? These overlap (A runs 10:00–11:30, B runs 10:30–11:30), but they have different start times so the unique index doesn't catch it. Both could slip through in the same millisecond.

### What the fix looks like

Add a Postgres function that, before inserting a booking, grabs a temporary lock for that provider and date. The lock means: while I'm checking and inserting, no other booking request for the same provider on the same day can run at the same time. They queue up and go one at a time. The whole check-and-insert takes maybe 5ms, so clients never notice the wait.

The SQL looks like this:

```sql
CREATE OR REPLACE FUNCTION create_booking_atomic(
  p_provider_id UUID,
  p_booking_date DATE,
  p_booking_time TIME,
  p_end_time TIME
) RETURNS VOID AS $$
BEGIN
  -- Grab a lock for this provider+date. Any other booking for the same
  -- provider on the same day queues here until this transaction finishes.
  PERFORM pg_advisory_xact_lock(
    hashtext(p_provider_id::text || p_booking_date::text)
  );

  -- Now check for overlapping bookings. Because we hold the lock, no other
  -- insert can sneak in between this check and the INSERT below.
  IF EXISTS (
    SELECT 1 FROM bookings
    WHERE provider_id = p_provider_id
      AND booking_date = p_booking_date
      AND status NOT IN ('cancelled', 'no_show')
      AND booking_time < p_end_time
      AND end_time > p_booking_time
  ) THEN
    RAISE EXCEPTION 'slot_taken';
  END IF;
END;
$$ LANGUAGE plpgsql;
```

In the app, call `supabase.rpc('create_booking_atomic', { ... })` before `dbCreateBooking()`. If it throws 'slot_taken', show the user "sorry, that slot was just taken — please pick another time."

### When to build this

Not now. Add it when a provider starts getting enough simultaneous traffic that double-bookings actually happen. For most early-stage providers (solo operators, small salons), genuine simultaneous bookings are rare enough that the unique index is sufficient.

---

## Full-Screen Map View (Airbnb-style) for Explore/Search

### What it means

Instead of (or as a toggle alongside) the current list/grid browse, let the map take over the entire screen — like Airbnb's map search. Results aren't a separate screen; they live in a bottom sheet/card that starts docked near the bottom (peeking a header + a couple of result cards) and can be dragged/scrolled up to expand into a full scrollable list, with rounded top corners on the card (slides up over the map, doesn't replace it).

### Rough shape of what's needed

- Full-bleed map component (whatever RN maps lib the app already uses, if any — check before adding a new dependency) as the base layer of the screen.
- A bottom sheet component with at least two/three snap points (peek / half / full), rounded top-left/top-right corners, drag handle, that scrolls its own content (provider/result cards) once expanded.
- Map markers for providers in the current viewport; tapping a marker should scroll/highlight the corresponding card in the sheet (and vice versa — tapping a card centers the map on that provider).
- Needs viewport-bounded querying (map bounds → lat/lng box query), not just the existing list query — don't fetch every provider and filter client-side.

### Not scoped yet

No decision made on: which bottom-sheet library to use, whether this replaces or sits alongside the current Explore grid, or where it lives in navigation. Purely a reminder of the interaction pattern to build later, not a spec.

---

## Real-Time Calendar Updates

### What it means

If two clients are both looking at the same provider's calendar at the same time, and one of them books the 2pm slot, the other client's screen should update immediately to show 2pm as taken — without them having to refresh.

### What exists

`BookingContext` already subscribes to Supabase Realtime on the `bookings` table. When a booking is inserted or updated, the context reloads the current user's bookings. This handles the provider dashboard updating in real time.

What it does NOT do: update the client-side calendar (ModernBeautyCalendar) when a slot gets taken by someone else. The calendar fetches availability once when it renders and doesn't listen for changes.

### What needs to happen

In `ModernBeautyCalendar`, set up a Supabase Realtime subscription on `bookings` filtered by the current `provider_id`. When a booking INSERT or UPDATE event fires, re-run `generateWeeklyAvailability()` to refresh the slot display. This means a client watching the calendar sees slots disappear in real time as others book them.

---

## Bug: Cart's back-to-back slot picker offers times the DB then rejects

### What's actually happening (this is a real bug, not a future idea)

`AvailabilityService.getAvailableSlots()` (single-service path) correctly reads `min_booking_notice_hrs` from `providers` and filters out any slot starting sooner than that from now — the comment there says explicitly "matches the server-side `enforce_booking_bookability` trigger, so the calendar never shows a time the DB will then reject."

But the cart's multi-service flow doesn't call that function. It calls `findBackToBackSlotsForDate` (module-level helper in `AvailabilityService.ts`, used by `findBackToBackSlots`/`findNextBackToBackDay`) — a **second, independently-written slot-generation implementation** that selects `booking_window_days, slot_interval_mins, buffer_mins` from `providers` but never selects `min_booking_notice_hrs` and never filters by it. So the cart happily offers a same-day/near-immediate slot, the user picks it, and `hold_cart_booking_slots`/`createBooking` reject it server-side with "This appointment does not meet the provider's minimum notice" — confirmed live 2026-08-04 testing FacebyJen's cart checkout.

### The fix

Add the same `min_booking_notice_hrs` select + cutoff filter from `getAvailableSlots` (around line 440-444) into `findBackToBackSlotsForDate`'s window-generation loop (around line 255-270) — exclude any `start0` candidate earlier than `Date.now() + noticeHrs * 60 * 60 * 1000`. Small, contained fix; the bug is a missing filter, not a design gap. Worth checking whether other slot-generation call sites in this file have the same drift while in there.

---

## Bug: Category-scoped promo discounts every service from a matching-category provider, not just services in that category

### What's actually happening (this is a real bug, not a future idea)

A promotion can be scoped to a category via `promotions.service_category` (e.g. a provider creates a "15% off HAIR" code). `CartScreen.tsx`'s `itemPromoDiscounts` memo is supposed to enforce that scope per line item:

```ts
if (promo.service_category &&
    promo.service_category.toUpperCase() !== (item.providerService ?? '').toUpperCase()) continue;
```

But `CartItem.providerService` is the **provider's single whole-business category** (`providers.service_category` — the same value for every service that provider offers, set once at signup/InfoReg), not the individual service's own category. Every item in the cart from the same provider carries the identical `providerService` value. So this comparison can never selectively match "just the haircuts" within a HAIR-categorised provider's cart — it's really comparing the promo's category against the provider's category, which either matches for every one of that provider's services or none of them. A live "15%-off-HAIR" promo from a HAIR-categorised provider discounts every service they sell (beard trims, colour, extensions — anything), not just haircuts, as long as the promo's `service_category` happens to equal that provider's own category.

The same drift exists in `MultiBookingSheet.tsx`/wherever else a promo's `service_category` is checked against `providerService` rather than a per-service category — worth grepping for `service_category` comparisons against `providerService`/`providerServiceCategory` while fixing this.

### Why it's not a quick one-line fix

There is currently no per-service category field to compare against — `services` (the individual bookable service row) doesn't carry its own category distinct from the provider's. Fixing this properly needs either:
- A `services.category` column (or reuse of an existing per-service tag/type field, if one already captures this) that promo validation and `itemPromoDiscounts` compare against instead of `item.providerService`, or
- Reframing what `service_category`-scoped promos are actually meant to scope (if "provider's category" was the intended semantics all along, the bug is only in the misleading name/copy — "15% off HAIR" — not the logic, and the fix is in provider-facing promo-creation copy instead).

Needs a decision on which of those is actually intended before touching the comparison — worth checking with whoever owns Offers/Promotions before assuming the DB-column fix is the right one.

---

## Emergency / Same-Day Bookings — BUILT 2026-08-21/26, conditions still open

### Status

The core of this shipped. What this section originally sketched (a provider
opt-in, a request the provider approves rather than an instant book, a flag
distinguishing an emergency booking from a normal one) all exists — see
`BOOKINGS.md` §3a and the auto-memory `emergency-booking-requests`. Kept here
only because the **conditions governing a request** are still unbuilt; those
are the list below.

Two decisions went differently from the sketch above, deliberately:

- **It IS the normal calendar.** The sketch guessed a separate "Request
  Emergency Appointment" action, on the reasoning that the picker should keep
  hiding times outside the provider's stated availability. It's in the picker
  instead, with by-request dates and times drawn as red outlines so they read
  as a different offer without being a different flow. A second entry point
  would have meant a client who can already see the day they want having to
  leave and find another button.
- **There is no bound on which hours can be asked for.** The first version
  bounded requests to the provider's weekly envelope widened by a fixed
  extension. That refused a 4am bridal call — the most common genuine
  out-of-hours booking there is — because the bound was inferred from hours
  describing a NORMAL week. Working hours decide what's ordinarily bookable;
  everything else is requestable, and the provider's approval is the filter.

It also went wider than "same-day": the notice window is one of **four**
independent opt-ins (hours, blocked dates, short notice, booking window),
because those were four separate hard walls, not one.

### Still open — conditions on a request

None of these are built. Right now an opted-in provider can be asked for any
service, at any hour, with no lead time beyond their opt-ins and no ceiling on
how many requests arrive.

- **Per-service eligibility.** Which services may be requested out of hours.
  A 5am bridal trial makes sense; a 5am gel infill does not. Probably the
  biggest single gap — today opting in exposes the provider's *whole* service
  list at *every* hour.
- **Minimum lead time for requests specifically.** Separate from
  `min_booking_notice_hrs`, so "can you do 5am tomorrow?" asked at 11pm isn't
  possible unless the provider wants it.
- **Cap on open requests.** A limit on how many unanswered requests can be
  pending at once (or per week), so opting in doesn't bury a provider in
  decisions.
- **An emergency surcharge.** Raised 2026-08-26. Providers reasonably want to
  charge more for a 4am call than a 2pm one, and today an out-of-hours request
  costs the client exactly the list price. This is the most-wanted of the
  items here, and the one most likely to be got wrong, because it is a
  **money** change and not a scheduling one:

  - **Server-owned, or it's not real.** Prices are computed in
    `prepare_checkout` / `hold_cart_booking_slots` from the service row —
    the app sends choices, never amounts (see `BOOKINGS.md` §4). A surcharge
    added app-side would be a number the client could edit.
  - **Disclosed before the tick, not after.** The client agrees to a total on
    the Confirm & Pay step. A surcharge that appears later — or only on the
    receipt — is a price change after agreement. It has to be visible in the
    booking sheet at the moment they accept the emergency confirmation, and
    again in the cart line.
  - **Interacts with three existing numbers.** The tiered platform fee
    (`features/cart/platformFee.ts`, added on top and never taken out of the
    provider's money), the deposit (percentage or fixed — does the surcharge
    count toward the deposit base?), and promo codes (can a discount apply to
    a surcharge?). Each needs an answer before implementation, not during.
  - **The provider hasn't accepted yet.** The client pays at checkout and the
    request lands pending. If the provider declines, the surcharge has to
    come back with the rest — and there is **no refund path anywhere in the
    app**. Same blocker as auto-expire below.

  Open decisions: flat fee or percentage (or provider's choice of either);
  per-provider or per-service; whether it differs by *which* rule was broken
  (out-of-hours vs blocked date vs short notice); and whether it belongs in
  the provider's own T&Cs, which would make it a
  `cerviced-legal-flagger` question rather than only an engineering one.

- **Auto-expire if unanswered.** A request nobody answers should decline
  itself and tell the client, rather than sitting pending until the
  appointment time passes. **Blocked on refunds**: the client has already paid
  by this point and there is no refund path anywhere in the app — see
  `LEGAL-COMPLIANCE-NOTES.md` and the auto-memory
  `cancel-reschedule-policy-defaults-and-no-refunds`. Don't build the
  auto-decline before the money can actually go back.

---

## Offers / Promotions — deferred (client-facing browse)

### What it means

Offers/Promotions are temporarily pulled from BOTH sides of the app as of 2026-08-09: the "CURRENT OFFERS" carousel on the client Home screen (and the full-browse `OffersScreen` it links to), and every provider-side entry point into `ProviderPromotionsScreen` (creating/editing/managing promotions). Nobody — client or provider — can currently reach promotions through the UI. This is a UI-visibility decision, not a data/backend change.

Becca follows the same boundary: she must not query, summarise, recommend, or link to offers/promotions while this feature is disabled. Deal/promotion capabilities and their suggestion chips were removed on 2026-08-18; keep promo-code validation at checkout, which remains a separate available feature.

### What was done

A single flag, `OFFERS_ENABLED` in `src/constants/featureFlags.ts`, gates:
- The "CURRENT OFFERS" section render in `HomeScreen.tsx` (and its `handleViewAllOffers` navigation trigger) — client side.
- The `getActivePromotions()` fetch in `HomeScreen.tsx`'s initial-load effect, so no promotion data is even fetched while the flag is off — client side.
- The two "Promotions" `GridTile`s in `ProviderAccountScreen.tsx` (QUICK ACCESS and MY BUSINESS sections) — provider side.
- The "Promotions" row in `ProviderHomeScreen.tsx`'s Quick Access bottom sheet (filtered out of the array before render) — provider side.

Left untouched (so re-enabling is a one-line flip, not a rebuild):
- `OffersScreen.tsx` and `ProviderPromotionsScreen.tsx`, and all their route registrations (`Offers` in `HomeNavigator.tsx`; `Promotions` in `ProviderHomeNavigator.tsx`, `ProviderAccountNavigator.tsx`, `ProviderServicesNavigator.tsx`, `ProviderBeccaNavigator.tsx`) — still exist, just unreachable from the UI since nothing navigates to them anymore.
- `getActivePromotions` / `getProviderActivePromotions` and all provider-side promotion CRUD functions (`getMyPromotions`, `upsertPromotion`, `togglePromotion`, `deletePromotion`, `patchPromotion`) in `databaseService.ts` — these only run when their screen is focused, and the screen is now unreachable, so no separate guarding was needed.
- Promo code redemption at checkout (`PromoCodeRow.tsx`, `validatePromoCode`, `BookingSheet.tsx`) — this is a separate feature (a code entered against a specific booking) from the Offers/Promotions browse-and-manage screens, and was never in scope for this removal.
- `ProviderClienteleScreen.tsx`'s in-screen promo picker (calls `getMyPromotions()` directly for its own announcement feature) — unrelated to the standalone Promotions screen/route, left as-is.

### To bring it back

Flip `OFFERS_ENABLED` to `true` in `src/constants/featureFlags.ts`, then deliberately restore and test Becca's client deal lookup and provider promotion-management capabilities before exposing them. No other changes needed unless the underlying screens/data have drifted in the meantime.

---

## Multi-service (group) booking — deferred (client + provider)

### What it means

Multi-service booking — a client selecting several services from ONE provider and booking them together as a single grouped appointment — is temporarily pulled from BOTH sides of the app as of 2026-08-09. On the client, the provider profile's "Select" mode (multi-select checkboxes, the floating "N selected • £total — Book" bar, and the grouped `MultiBookingSheet`) is gone; a client now books one service at a time via the normal per-service "Book". On the provider, booking screens no longer collapse a group booking's siblings into one group card or route through the all-or-nothing group RPCs. This is a UI-visibility decision, not a data/backend change.

Single-service booking is entirely unaffected: per-service "Book" (`BookingSheet`), Offers/Explore "Book Now" (`handleQuickBook`/`handleBookOffer`), the cart, and checkout all work exactly as before.

### Why it's clean to gate at one point

Every `bookingBatchId` / `group_booking_id` in the app originates in exactly one place: `handleMultiBookingSheetSubmit` in `ProviderProfileScreen.tsx`, reachable only through select mode → the "Select" link. The cart's own group-reschedule (`handleConfirmGroupReschedule` in `CartScreen.tsx`) only ever REUSES or re-mints a batch id for items that are ALREADY grouped — it never creates a group from ungrouped items. So gating the "Select" link alone stops all new group bookings at the source; the cart's group-block rendering and reschedule UI simply never have grouped items to act on and go dormant.

### What was done

A single flag, `MULTI_SERVICE_BOOKING_ENABLED` in `src/constants/featureFlags.ts`, gates:
- The "Select" link in `ProviderProfileScreen.tsx` — hidden, so select mode can never be entered. `setSelectMode(true)` is only reachable via `toggleSelectMode` (the link's onPress); every other `setSelectMode` call sets it `false`. With select mode permanently off, the two `renderSelectionBar(...)` call sites and the `<MultiBookingSheet>` render (all guarded by `selectMode`) never show — client side.
- The group-sibling collapse in `ProviderBookingHistoryScreen.tsx` — with the flag off, siblings are NOT grouped, so each service in any pre-existing group booking shows as its own single card (`siblingCount` 1, no group badge) and is managed individually — provider side.
- The group-sibling refetch effect in `ProviderBookingDetailScreen.tsx` (`getGroupBookingSiblings`) — skipped when off, so a group booking opened directly (e.g. from a notification) is treated as a single booking. Every group-specific branch keys off `groupSiblings.length > 1`, which stays 1, so the GROUP BOOKING badge, sibling list, group reschedule modal, and all-or-nothing group RPCs (`updateGroupBookingStatus` / `providerCancelGroupBooking` / `providerInitiateGroupReschedule`) never fire — provider side.

Left untouched (so re-enabling is a one-line flip, not a rebuild):
- `MultiBookingSheet.tsx` and all its handlers (`handleBookSelected`, `handleMultiBookingSheetSubmit`, `renderSelectionBar`, `toggleSelectMode`, the select-mode state/effects) in `ProviderProfileScreen.tsx` — still present, just unreachable since the "Select" entry point is hidden.
- `CartContext.tsx`'s `bookingBatchId` plumbing and `CartScreen.tsx`'s group-block rendering / group-reschedule flow — the cart itself is unchanged; it simply never receives grouped items while the flag is off.
- The provider-side group RPCs in `databaseService.ts` (`getGroupBookingSiblings`, `updateGroupBookingStatus`, `providerCancelGroupBooking`, `providerInitiateGroupReschedule`) and the `group_booking_id` / `is_group_booking` DB columns — no data/backend change; existing group rows still exist and are simply handled as individual bookings.
- The provider's "Group bookings" profile toggle in `ProviderBusinessEmailScreen.tsx` — this is an UNRELATED marketing preference (bridal parties, hen dos — one client, many people), not the multi-service cart grouping, and was never in scope.

### To bring it back

Flip `MULTI_SERVICE_BOOKING_ENABLED` to `true` in `src/constants/featureFlags.ts`. No other changes needed unless the underlying screens/data have drifted in the meantime.

---

## Emergency / out-of-hours booking requests — deferred (client + provider)

### What it means

Emergency requests — a client picking a time the provider's own rules exclude (outside their working hours, a blocked date, inside their minimum-notice period, or beyond their booking window) and asking anyway, for the provider to accept or decline — are temporarily pulled from the client app as of 2026-08-28, alongside the split of the provider's single "Terms & Conditions" document into two:

- **Terms & Conditions** (unchanged mechanism) — the `booking_intake_forms` row (`is_terms`), read via `get_provider_terms`, that a client agrees to before add-to-basket. Its editor entry point moved from Business Info into the InfoReg profile document ("Your Terms & Conditions" card near the end).
- **Emergency Booking Policy** (new) — a free-text `emergencyBookingPolicy` key on `providers.booking_policies` (JSONB), authored on `PoliciesScreen`, that a client reads in the "scheduling conflict" prompt. `EmergencyBookingPrompt` now points at this field instead of the terms form. Both the Policies editor card and the client reader sit behind the flag.

This is a UI-visibility decision, not a data/backend change.

### Why it's clean to gate at one point

`ModernBeautyCalendar`'s `allowRequests` prop is the single switch: when `false`, by-request slots are filtered out of the grid, `RequestTimePanel` offers nothing, and `onTimeSelect` never receives `EmergencyReason[]` — so `EmergencyBookingPrompt` never opens and `emergencyRequest` stays `null` through checkout. Both sheets hard-coded `allowRequests` to `true`; they now pass `EMERGENCY_BOOKINGS_ENABLED`.

### What was done

A single flag, `EMERGENCY_BOOKINGS_ENABLED` in `src/constants/featureFlags.ts`, gates:
- `allowRequests` on the `ModernBeautyCalendar` in `BookingSheet.tsx` and `MultiBookingSheet.tsx` — client side. (The Multi sheet is already unreachable via `MULTI_SERVICE_BOOKING_ENABLED`; this is belt-and-suspenders.)
- The entire "Requests Outside Your Availability" `Card` in `SchedulingScreen.tsx` — the provider opt-in toggles (`allow_out_of_hours_requests` etc.) and the request-window radios — provider side. Load/save still round-trip these columns, so a provider's stored choices survive.
- The "Emergency Booking Policy" `Card` on `PoliciesScreen.tsx` — the `emergencyBookingPolicy` key still round-trips through the full-REPLACE save, so a value written once the feature returns is safe meanwhile.

Left untouched (so re-enabling is a one-line flip, not a rebuild):
- `EmergencyBookingPrompt.tsx`, `RequestTimePanel.tsx`, and the emergency-reason logic in `AvailabilityService.ts` — still present, just never triggered.
- `prepare_checkout`'s server-side `emergency_ack` requirement, the `providers.allow_*_requests` columns, `bookings.is_emergency_request`, and the provider inbox accept/decline of an *existing* pending request (`ProviderInboxScreen.tsx`, `ProviderBookingDetailScreen.tsx`) — no data/backend change.
- The `result.emergencyRequest` handling in `ProviderProfileScreen.tsx` / `CartScreen.tsx` and the `isRequest` display on client `BookingsScreen` / `BookingDetailScreen` — dead-but-harmless while no new requests are created.

### To bring it back

Engineering: flip `EMERGENCY_BOOKINGS_ENABLED` to `true` in `src/constants/featureFlags.ts`, then verify the by-request slot math still fires and that providers' stored `allow_*_requests` still round-trip. (`BookingSheet` resolves `emergencyBookingPolicy` from the `bookingPolicies` prop on the provider-profile path and self-fetches it via `getProviderBookingPoliciesById` on the cart edit path, which passes no prop — the self-fetch is itself gated on this flag.)

Legal blockers to resolve **with counsel before flipping the flag** (raised by `cerviced-legal-flagger` 2026-08-28 — not live exposure while off):
- **Snapshot the policy text properly.** `buildPolicySnapshot()` already spreads the whole `booking_policies` blob into `policy_snapshot`, so `emergencyBookingPolicy`'s value at checkout *is* frozen — but nothing reads it back (`readProviderTermsSnapshot` only pulls `providerTerms`) and nothing ties it to the `emergency_ack`. `emergency_ack_at` is a bare timestamp with no reference to which text was shown. Decide whether the emergency ack needs its own snapshot key + reader like `providerTerms` has, or stays informational-only.
- **Consent shape.** It's the "free-text box nobody signs" pattern the T&Cs deliberately avoid by being a `policy`-type intake form. Decide whether the emergency acknowledgement needs the same per-question / timestamped-against-booking treatment.
- **Cerviced Terms coverage.** `TermsScreen` says nothing about out-of-hours times being *requests* a provider can decline, or what happens to a payment taken when a request is declined/unanswered (ties into the no-refund-path gap, `LEGAL-COMPLIANCE-NOTES.md` items 6 and 12).
- The `PoliciesScreen` field placeholder was scrubbed of any surcharge / off-app-payment example; keep it that way, and resolve the emergency-surcharge question ("Emergency / Same-Day Bookings" in this doc) before any money term is honoured here.

---

## Multiple Service Types Per Provider (Discovery, Not Just Display)

### What it means

A provider who genuinely does two things — hair *and* nails, lashes *and* brows — wants to be found under both.

### What currently happens

`providers.service_category` is a **single** value, picked at sign-up and locked afterwards. It is the only thing client-facing discovery filters on:

- `getProviders` / `getProvidersByCategory` / the Explore category tabs / category search all do `.eq("service_category", category)` (several call sites in `databaseService.ts`).
- `SUBCATEGORY_SUGGESTIONS_BY_CATEGORY` in `InfoRegScreen.tsx` scopes the "+ Add Category" suggestion grid off it.
- `addPortfolioItem` **stamps** `portfolio_items.category` from it when no explicit category is passed — so a HAIR provider's nail photos are tagged HAIR, and appear under the HAIR tab in Explore.

Separately, `services.category_name` is free-form and unbounded — a provider can add as many categories as they like via "+ Add Category". Those drive the category tabs **on their own profile only**.

So the current state is: a provider can *display* many service types, but is *discoverable* under exactly one. A HAIR provider who adds a Nails category never appears under NAILS anywhere, and their nail work is filed under HAIR. That mismatch is also why `service_category` is locked — changing it re-scopes the suggestion pools and orphans the category stamps on every portfolio row already written.

### What needs to happen

1. **Schema**: `service_categories TEXT[]` (or a `provider_service_categories` join table) alongside a retained single `service_category` as the *primary* — the primary still has to exist, because subcategory suggestions and the default portfolio stamp both need one answer, not a set.
2. **Queries**: every `.eq("service_category", …)` becomes an array-overlap test (`.contains` / `.overlaps`, or `.in` on the join table). Nine-ish call sites in `databaseService.ts`; grep for `service_category` before starting.
3. **Portfolio stamping**: `addPortfolioItem` can no longer infer a single category. Either add a per-photo category picker to the upload UI (there has never been one — see the `portfolio-category-null-bug` memory for what happened last time this column went unwritten), or stamp from the service/category the photo was uploaded under.
4. **Unlock the picker**: `InfoRegScreen`'s Service Type lock and `BusinessInfoScreen` both need to let the set be edited, with copy explaining that the primary drives suggestions.
5. **Backfill**: existing rows need `service_categories = ARRAY[service_category]`.

### Why it's deferred

Deferred on 2026-08-20. It touches every discovery query in the app plus a column with a known history of being silently unwritten, so it's a schema-and-query project, not a UI change. Until then the honest framing for providers is: your service type is your *primary* type and it's what clients find you under; extra categories organise your own profile.

---

## In-Person / Pay-on-the-Day Checkout Option

### What it means

A client books and pays nothing (or only a deposit) through the app, settling the rest — or all of it — with the provider in person.

### What currently happens

Half of this already exists. A deposit checkout takes the deposit through the app and shows the client `Remaining: £X (pay at appointment)`; the provider's Payments screen lists which in-person methods they accept (cash, card, bank transfer). What does **not** exist is a checkout option that takes £0.

### What needs deciding before it can be built

1. **The liability boundary.** `CLAUDE.md` forbids the app collecting, storing, verifying, or attesting to an off-app payment between a client and a provider — a "mark balance collected" feature was built and removed for exactly this reason, and the Terms & Conditions "Deposits & Remaining Balances" clause draws the same line. A "pay in person" option is only safe if the app records *how the client intends to pay* and never *whether they did*. No paid/unpaid state, no amount-received field, no reconciliation.
2. **Platform fee.** `calculatePlatformFee` returns `0` when nothing goes through the app (`amount <= 0` and not a deposit checkout). A £0 checkout therefore earns Cerviced nothing, and there's no obvious place to charge from. Either the fee moves to the provider side, or the option is restricted to deposit-plus-balance so a deposit is always taken.
3. **No-show exposure.** With no deposit and no card on file, a no-show costs the provider the whole slot and there is no instrument to charge against — which makes the existing `noShowAction: 'charge_deposit' | 'charge_full'` policy unenforceable for these bookings. The policy UI would need to say so.
4. **Terms acceptance.** Offering this needs an explicit Cerviced T&C acceptance at checkout, because the platform is expressly not a party to the in-person payment. **This is legal copy — flag it, do not draft it.** See `LEGAL-COMPLIANCE-NOTES.md` and the `cerviced-legal-flagger` agent.

### Likely shape when built

A provider-level opt-in (Business Details → Payments, next to `depositMode`) that adds a third client-facing checkout state alongside the existing `full_only` / `client_choice` / `deposit_required` — most likely "deposit now, balance in person", since that keeps a payment instrument and a platform fee in play. Read the deposit mode through `resolveDepositMode()` in `src/utils/depositPolicy.ts`; do not add a fourth parallel flag.

### Why it's deferred

Deferred on 2026-08-20. Items 1–4 above are product, pricing and legal decisions, not engineering ones.

---

## Provider T&Cs as a Signable Form (Not Just a Read)

### What it means

A client would receive the provider's Terms & Conditions the way they receive any other form — sent against their booking, filled in, signed, and recorded — instead of only reading them in a pop-up at checkout.

### What exists today (2026-08-20)

A provider writes their own T&Cs in **Forms → Your Terms** (the `TERMS_TEMPLATE` in `ProviderIntakeFormScreen.tsx`). It saves as a normal `provider_form_library` row with `is_terms = true` — at most one per provider, enforced by a partial unique index.

Clients read it from `BookingSheet` / `MultiBookingSheet` as a **read-only pop-up**, fed by the `get_provider_terms(uuid)` RPC (`supabase/provider_terms_and_conditions.sql`). That RPC exists because `provider_form_library` is owner-only and must stay that way — it also holds medical-history and patch-test forms. The RPC returns only the terms form's title and its `policy`-question body, and only for a live provider.

Deliberately **not** a second agreement checkbox: nothing records that the client read or agreed to those terms, so presenting it as consent would claim something the app cannot back up. The existing checkbox next to it covers CERVICED's terms and the provider's structured cancellation policy, which *is* snapshotted (`policyAcceptedAt` + `policySnapshot`).

### What needs to happen

1. **Sending**: the plumbing already exists — `sendLibraryFormToClient` copies a library form into `booking_intake_forms`. A terms form could auto-send on booking confirmation the way `auto_send` forms already do.
2. **Agreement record**: `booking_intake_forms` already has `requires_signature` and `client_signature`. Decide whether terms acceptance is a signature, a `policy`-question acknowledgement, or its own timestamped column.
3. **Timing**: today's pop-up is pre-booking; a sent form is post-booking. If terms are meant to be a condition of booking rather than a disclosure after it, the form has to be answerable *during* checkout — which is the same blocker as `## Intake Form During Checkout` above. Solve them together.
4. **Snapshotting**: like `policySnapshot`, the booking has to remember the terms *as they were*, not follow later edits.
5. **Legal**: whether a read receipt, a tick, or a signature constitutes acceptance is not an engineering call. **Flag it, don't draft it** — see `LEGAL-COMPLIANCE-NOTES.md` and the `cerviced-legal-flagger` agent.

### Why it's deferred

Deferred on 2026-08-20 — the read-only pop-up was the explicitly requested scope. Items 3 and 5 are the real work.

---

## Providers Who Are Both Mobile AND Premises-Based

### What it means

A provider who has a salon or home studio **and** also travels to clients. Today they must pick one.

### What currently happens

`providers.business_type` is a single value: `'salon' | 'studio' | 'home_based' | 'mobile'`. It is not cosmetic — it drives real, divergent behaviour:

- **Address release.** `ADDRESS_RELEASE_BY_BUSINESS_TYPE` gates which timings the provider may even choose. Premises types get `'always'`; `home_based` gets the timed set; `mobile` gets `['manual']` only, defaulting to not sharing at all. A single provider who is both needs *both* answers at once, and the right one depends on the individual booking, not the profile.
- **Whose address is used.** For mobile bookings the client supplies theirs (`bookings.client_address`, shown in `ProviderBookingDetailScreen`'s ADDRESS section, which renders on `business_type === 'mobile'`). For premises bookings the provider's is released. A both-provider needs this decided per booking.
- **Copy everywhere.** InfoRegScreen's address hint, `BUSINESS_TYPE_OPTS`, BusinessInfoScreen's Address Release sub-line and the booking-detail Location row all branch on the single type.

So a provider who does both currently has to choose which half of their business the app describes correctly.

### What needs to happen

The honest shape is almost certainly **per-service or per-booking location mode**, not a second business type:

1. A service-level flag (`services.location_mode`: `'at_provider' | 'at_client' | 'either'`), since it's really the *service* that is or isn't mobile.
2. The client picks, at booking time, where an `'either'` service happens — which then decides whose address matters for that booking.
3. Address release becomes per-booking rather than a single profile-wide policy: a booking at the provider's premises releases their address on their chosen timing; a booking at the client's does not release it at all.
4. `business_type` stays as the *primary* premises answer (or becomes null for pure-mobile), because the address-required rule and the "is there a premises" question still need one answer.
5. Copy across the four surfaces above stops branching on a single type.

### Why it's deferred

Deferred on 2026-08-20. It reopens address release — the one area of this app where the DB, not the UI, is the enforcement point (`is_address_released()`, the `client_bookings` view, the on-confirmation trigger) — so it is a schema-and-policy change, not a settings-screen change. See the `address-release-server-enforced` memory before starting.

---

## Provider Deactivation / Pause Bookings (No Such Toggle Exists Today)

### What it means

A provider wants to temporarily stop appearing to clients and stop taking new bookings — without deleting their account. "I'm on holiday for two weeks, pause my listing" or "I'm overwhelmed, hide me for now."

### What currently happens (why there's no toggle today)

`has_gone_live` is the flag every client-facing query gates on (see `CLAUDE.md`'s Security section). Today it is **write-once from the provider's own actions**: it flips `true` exactly once, when onboarding requirements are satisfied (`provider_schedule_gating.sql`, `require_provider_address.sql`, `require_services_for_go_live.sql`, `availability_v2.sql` — all `SET has_gone_live = TRUE`). There is no app code anywhere that flips it back to `false` except:
- `delete_account.sql` (account deletion)
- `dev_reset_provider.sql` (dev/testing reset RPC, not provider-facing)

No screen — not `InfoRegScreen.tsx`, not anywhere in `src/screens/provider/` — has a toggle, switch, or button that calls anything to set `has_gone_live = false`. A provider's only way to stop being visible today is to delete their account entirely, which is a much bigger and more destructive action (see `account-deletion-architecture` in memory — grace period, per-hat delete RPCs) than "I want a break."

### What needs to exist

- A real "Pause bookings" / "Go offline" control, most likely in `InfoRegScreen.tsx` near the business-profile settings, calling a new RPC (e.g. `provider_set_availability_status(p_paused boolean)`) rather than a raw `.update()` on `has_gone_live` — consistent with the rest of this app's RPC-only mutation pattern for security-sensitive provider-state columns.
- **Must warn about upcoming bookings before pausing**, same shape as the blocked-date warning added to `ProviderScheduleScreen.tsx` (2026-08-17): check `getProviderBookingsByDate`-style active bookings across the provider's upcoming window before allowing the toggle, since — per the deactivation gap findings this session — flipping `has_gone_live` to `false` today touches zero existing bookings. Decide product-side whether pausing should be blocked outright while upcoming bookings exist, or just warned-and-allowed (existing bookings stay valid, only new bookings stop).
- Decide whether "paused" should notify clients with upcoming bookings at all, and whether a paused provider can still be found via direct link (e.g. an existing bookmark) vs. fully hidden from all discovery.
- Needs a `cerviced-security-review` pass since this is a mutation on the exact column every client-facing query boundary depends on.

### Related

Found during the 2026-08-17 provider-definable-policy audit alongside the no-show/cancellation-policy gaps — this one was scoped out of that fix pass because it's net-new feature surface (a toggle that doesn't exist yet), not a fix to something already there.

---

## Event Plans — table and Becca capability exist, nothing writes to them

### What it means

A client plans a set of appointments around an occasion — a wedding, a holiday, a birthday — and wants them tracked together: "what have I got booked for the wedding?"

### What currently exists

More than you'd expect, which is why this is a "finish it" item rather than a "build it from scratch" one:

- An `event_plans` table, live in the database.
- `getMyEventPlans()` and `getEventPlanDetails()` in `databaseService.ts`.
- A working Becca capability, `account.events` (`src/services/becca/capabilities/client.ts`), matching "my event plans", "my wedding", "what have I got for the holiday".
- Becca's own help text advertises event plans as one of the things she can tell you about.

### What's missing

**Nothing in the app can create an event plan.** There is no writer function and no screen — `getMyEventPlans` is the only code path that touches the table at all, and it only reads. So `account.events` correctly reports "you haven't set up any event plans yet" to every user, permanently, while the help text implies the feature works.

### What needs to exist

- A way to create an event plan and attach bookings to it (a dedicated screen, or a step in the booking flow).
- A writer in `databaseService.ts`, plus RLS confirmed on `event_plans` — the table has never been exercised by a write path, so its policies are effectively untested.
- Once rows can exist, `account.events`'s success path needs per-item nav chips so a listed plan can be opened. Every other list-style Becca capability (`booking.list`, `inbox.notifications`, `discover.saved`) provides these; this one returns no suggestions at all, because it has never been possible to reach that branch with real data.

### Related

Found during the 2026-08-18 Becca capability audit. Flagged rather than removed — the read side is deliberate groundwork for a planned feature, not dead code to delete.

---

## Scheduled promotion notification cadence

### What it means

`process_scheduled_promotion_notifications()` (pg_cron jobid 64) runs every 15
minutes and is the **single most expensive job on the database** — 300 seconds of
CPU across 3,534 calls over 43 days, out of ~1,595s for all 12 `process_*` jobs
combined.

### Why it wasn't trimmed with the others

The 2026-08-18 cron trim (`supabase/cron_reminder_frequency_trim.sql`) slowed five
provider reminder jobs from 30m to 2h and two background queues from 5m to 15m.
Promotions was pulled out of that change on user instruction.

**Important context found afterwards:** promotions are already disabled app-wide.
`OFFERS_ENABLED` in `src/constants/featureFlags.ts` has gated every client and
provider entry point since 2026-08-09 (see "Offers / Promotions — deferred"
above). Live data confirms the consequence:

- 3 promotions total, newest created **2026-07-11** — none since the flag went off
- **0** promotion notifications sent in the last 9 days

So jobid 64 currently wakes up every 15 minutes to poll for scheduled promotions
that **cannot be created through the UI**. It is the single most expensive job on
the database and, for as long as the feature flag is off, it does nothing at all.

This makes the decision easier than originally framed. The "acceptable delay"
product question only matters once promotions are re-enabled. While
`OFFERS_ENABLED` is false, the job could be paused outright
(`cron.alter_job(64, active => false)`) with zero user-visible effect, recovering
the full ~300s per 43 days — the largest single saving available.

The reason to be careful is coupling, not delay: pausing the job ties a cron
schedule to a feature flag in a way nothing currently tracks, so whoever flips
`OFFERS_ENABLED` back on must also reactivate jobid 64 or scheduled promotions
will silently never notify. That's the trade-off to weigh — a silent-failure risk
at re-enable time, versus 300s of CPU spent on a disabled feature.

### The underlying cost is planning, not execution

Worth knowing before anyone tries to "optimize the query": these jobs are slow to
*plan*, not to *run*. Measured on the equivalent reminder function:

    Execution Time:   0.129 ms
    Planning Time:   99.656 ms   (949 buffer hits)

Indexes are already correct and the queries return zero rows on almost every
tick. plpgsql re-plans against a large catalog on each call. **No index or query
rewrite will help** — frequency is the only lever. See the auto-memory
`cron-reminder-jobs-planning-cost`.

### What needs to happen

- **Decide whether to pause jobid 64 while `OFFERS_ENABLED` is false.** If yes,
  `cron.alter_job(64, active => false)` recovers ~300s per 43 days immediately —
  but it MUST be re-activated in the same change that flips the flag back on.
  Note that alongside it in `src/constants/featureFlags.ts` so the two move together.
- If promotions are re-enabled: a product call on how stale a scheduled promotion
  may be before it notifies. If 30 minutes is acceptable, apply
  `cron.alter_job(64, schedule => '7,37 * * * *')` for roughly half the saving.
- If it isn't acceptable, the alternative is making the function cheaper to call
  rather than calling it less — e.g. an early-exit guard that checks a cheap
  indexed predicate before the main body, so the expensive statements are never
  reached on an empty tick.
- Either way, re-measure `total_plan_time` vs `total_exec_time` in
  `pg_stat_statements` afterwards rather than assuming the change helped.

### Related

Found during the 2026-08-18 CPU investigation, which established that this
database is CPU-constrained (68%) and not disk-IO-constrained (45%) — see the
auto-memory `db-constraint-is-cpu-not-disk-io`. Deferred rather than applied
because the trade-off is a product judgement, not an engineering one.

---

## Swipeable Stacked-Card Portfolio (Explore-Plan Feature)

### What it means

A Tinder-style physical-stack browsing mode for portfolio photos — top card
full-size, one or two cards peeking behind it, drag the top card off to
reveal the next photo — as an alternative to the flat Pinterest-style
two-column masonry grid. Prototyped on `ProviderProfileScreen.tsx`'s
Portfolio/Venue sections during the 2026-08-19 session, then reverted back
to the masonry grid; this section is the record of what was built and what
it would take to bring it back properly, scoped as part of the Explore plan
rather than a one-off screen change.

### What currently happens

Portfolio photos on a provider's profile render as a two-column masonry
grid (`dealIntoColumns` in `ProviderProfileScreen.tsx`), items packed into
whichever column is shorter with per-item tile height from the item's
`aspect_ratio`. Tapping a tile opens the existing lightweight fullscreen
image viewer (`serviceImageModal` state + `openImageViewer`/`FlatList`
paging — not `ImageDetailModal`, which is a different, richer modal used
elsewhere for Explore cards). Venue/address photos get their own identical
grid in a separate labeled section below the main gallery.

### What was prototyped, and why it was reverted

A `PortfolioCardStack` component (`src/components/PortfolioCardStack.tsx`,
deleted on revert) replaced both grids with a swipeable deck:

- Top card full-size + up to 2 peeking cards behind (offset up, scaled
  down), all cards sharing one box height derived from the **median real
  aspect ratio** across the visible items — reusing
  `useMeasuredAspectRatios` (the same hook `ImageDetailModal` uses for its
  own multi-photo carousel) plus `portfolio_items.aspect_ratio`, since a
  stacked deck can't resize per-card without visibly jumping between
  swipes.
- `PanResponder`-driven drag: horizontal drag translates/rotates the top
  card; past a distance or velocity threshold it flies off and the deck
  cycles (swiped photo rejoins the back of the deck — pure browse, no
  removal). A tap instead of a drag opens the same fullscreen viewer the
  grid tiles used.
- The peek layers eased forward via a shared `dragProgress` Animated.Value
  driven live by drag distance (not a snap between two fixed poses), so the
  card behind visibly grows/rises as the top card is dragged away.
- A `size="compact"` variant existed for the Venue section (62% width,
  left-aligned) so venue photos read as smaller/secondary to the main
  portfolio deck.

Reverted at the user's request — the masonry grid is back as the current
behavior — but not because the mechanism was wrong; the fundamentals
(median-ratio shared box height so `cover` never zoom-crops, native-driven
animation throughout, live-interpolated peek layers instead of a snap) are
worth carrying forward if/when this gets rebuilt.

### What needs to exist to do this properly (Explore-plan scope)

- **Swipe-to-save/skip as a real gesture**, not just browse-only cycling —
  explicitly deferred during the prototype: "swipe to save will be in the
  future ... or scale for [the] Explore plan feature." This turns the deck
  from a passive viewer into an actual save/dismiss interaction, which
  changes the gesture contract (direction now means something) and needs
  its own UX pass — likely tied into `useBookmarkStore` the way
  `PortfolioCard.tsx`'s heart button already is.
- **Decide scope**: is this an Explore-feed browsing mode (swiping through
  many providers' photos, closer to what "Explore plan" implies) or a
  per-provider profile portfolio view (what was actually prototyped)? The
  prototype was profile-scoped; a save/skip gesture arguably makes more
  sense feed-wide, where "skip" has an obvious meaning (not interested,
  show me something else) that it doesn't have on a single provider's own
  portfolio (skipping your own already-chosen provider's photo means what,
  exactly?). This should be settled before rebuilding.
- On-device verification of the drag physics — this was never actually run
  in the simulator/on a device this session (see auto-memory
  `simulator-no-tap-automation`), only typechecked and reasoned about; the
  "stiff" and "wrong image sizing" feedback that led to the mid-session fix
  is exactly the kind of thing that needs a real device pass, not just
  `tsc --noEmit`, before shipping.

---

*Last updated: 2026-08-18*

---

## Get In Touch enquiry threads are unlimited (in-app messaging has no scope boundary)

### What it means

`Get In Touch` on a provider's public profile is for **general enquiries from anyone browsing** — someone who hasn't booked, or a booked client asking something that isn't about their appointment. Booking-specific contact is a different surface: `Booking Details → Contact`, driven by the provider's Communications toggles.

The product intent is that the enquiry channel is *limited* — it isn't meant to become a free, unbounded inbox that any account can open against any live provider. Today there is no such limit.

### What currently happens

`ProviderProfileScreen.tsx`'s `handleGetInTouch` navigates straight to `ProviderChat` via `get_or_create_provider_conversation` for any client viewing any live provider. There is no check for whether a booking exists, no message cap, no thread expiry, and no rate limit — client-side or server-side. A provider's only defence is muting/ignoring the thread.

As of 2026-08-20 the split between the two audiences is **copy and data-source only**:
- Public / enquiry channel = the contact details set in `InfoRegScreen.tsx` step 03 (phone, email, Instagram, website). Filling a field in there publishes it.
- Booked-client channel = `providers.preferred_contact_methods`, set in `ProviderCommunicationsScreen.tsx`, read by `getProviderContactById` for the Booking Details contact sheet.

`in_app` is locked on in the Communications toggles, so a provider cannot currently opt out of receiving enquiry messages at all.

### What needs to exist

- A defined rule for what "limited" means — candidates: a message cap per enquiry thread from a client with no booking; a thread that auto-closes after N days with no booking; or read-only-until-booked.
- **Server-side enforcement**, not UI copy — a client can call the conversation RPC directly, so the limit has to live in `get_or_create_provider_conversation` / the message-insert path, not in the screen.
- A provider-facing switch for whether they accept profile enquiries at all, separate from the locked `in_app` toggle that governs booked clients.
- Abuse/spam considerations before launch: an unlimited, unauthenticated-intent DM channel into a real person's inbox is a moderation surface, not just a feature.

### Related

Scoped out of the 2026-08-20 Get In Touch / Communications source-of-truth split, which fixed *which setting drives which audience* and made the distinction explicit in both screens' copy, but deliberately changed no messaging behaviour.

---

## Signup Step 2b: "Take bookings here, or link out?" (provider path)

### What it means

Right after someone picks **provider** at signup, offer a second page asking how
they want to take bookings:

- **Use Cerviced's booking system** — the current, only path. Availability,
  services, slots, cart/checkout, the whole flow.
- **Link to my existing booking system** — they already run Acuity/Fresha/their
  own site, and want a Cerviced profile that discovers them and hands off.

The same fork could later be offered to a client-account signup, but the
decision only means something on the provider side, so scope it there first.

### Why it's worth building

The app already has half of it. `acuityTransferService.ts` + the
`extract-provider-profile` edge function import a provider's services from an
Acuity link, and `ClaimProviderScreen` exists for unclaimed listings. Both
assume the provider then *migrates onto* Cerviced bookings. A provider who
wants to keep their existing system has no honest option today — they either
fake availability they won't honour, or they don't sign up. The second is
what's actually happening.

An externally-linked provider is still worth having: they're discoverable in
Explore/Search, they carry a portfolio, and the handoff is measurable.

### What has to exist

**1. A mode on the provider, not a screen flag.** Something like
`providers.booking_mode: 'cerviced' | 'external'` plus
`providers.external_booking_url`. It must be a real column — the client-hat bug
fixed on 2026-08-20 is exactly what happens when a mode is inferred from
whatever field happens to be filled in (see the auto-memory
`hat-switch-dob-is-the-client-hat-marker`).

**2. The go-live gate has to branch.** `check_and_set_provider_live()` currently
requires schedule + service + address-with-lat/lng. An external provider has no
schedule and may have no services in our sense — that gate would permanently
hold them at "not live". Either the gate takes the mode into account, or
external providers go live on a different, smaller set of conditions.

**3. Every client-facing booking affordance has to know.** "Book now", the
booking sheets, the cart, Becca's booking capabilities, availability badges,
waitlist — all of it currently assumes an internal booking is possible. For an
external provider these become a single outbound link. A half-wired version of
this is worse than none: a Book button that opens a sheet with no slots reads
as broken, not as "they book elsewhere".

**4. Legal/consent check before shipping.** Sending a user off-platform to
transact means the booking, payment, cancellation and data handling all happen
outside our Terms. That needs wording, not an assumption — see
`LEGAL-COMPLIANCE-NOTES.md`. It also interacts with the deposit/liability
boundary the product has deliberately drawn.

**5. Migration path both ways.** A provider who starts external and later wants
Cerviced bookings (or the reverse) must be able to switch without rebuilding
their profile — which is the whole reason this is a column and not a signup-only
answer.

### Where it would go

`SignUpStep3Screen` is already the branch point (it renders the client DOB block
or the business-details block, and since 2026-08-20 both, on the upgrade path).
The mode question is better as its own short page immediately after the account
type is chosen, so it can set the mode *before* the rest of the provider
questions — several of which (availability, services) are only meaningful in
`cerviced` mode.

### Related

- `acuityTransferService.ts` — existing import-from-Acuity path.
- Go-live gate: auto-memory `go-live-gate-is-three-things-not-four`.
- `hat-switch-dob-is-the-client-hat-marker` — why this must be a real column.

---

## "Slots out every Nth" — a release day that doesn't release anything

### What it means

Lots of real beauty providers (braiders, lash techs, barbers) open their books
in monthly batches: "slots out on the 30th." Clients wait for the drop. The app
has UI for this on both sides — a provider picks a day of the month, a client
sees "New slots drop on the 20th" and taps a bell to be told when it happens.

### What currently happens

The notification half is fully built and live. The release half does not exist.

**Live and working:** provider sets a day in `ProviderAutomationsScreen`
("Notify followers on schedule release day") → `providers.automation_settings.
scheduleReleaseDay` (1–31). Cron **jobid 150**
`provider-follow-schedule-release-nudges`, daily 09:00 UTC, runs
`process_follow_schedule_release_nudges()`, which notifies every
`provider_follows` row with `notify_enabled = true` whose provider's day matches
today — once per calendar month (`last_notified_at` guard), clamping a day past
month-end (31 in a 30-day month) down to the actual last day. Inserts an
`announcement` notification, which the `send_push_on_notification` trigger turns
into a real push. Client-side the day renders as the profile pill
(`ProviderProfileScreen`, `provider.scheduleReleaseDay`) and shapes the bell
toast copy.

**The gap:** nothing is released on that day, because availability has no
monthly shape at all. `provider_availability` / `provider_availability_windows`
are a **recurring weekly template** keyed on `day_of_week` with no date range and
no end date — it repeats forever. The only thing bounding how far out a client
can book is `providers.booking_window_days`, enforced in the bookability trigger
as `NEW.booking_date > CURRENT_DATE + v_window_days → reject`. That is a
**rolling** horizon: one more day becomes bookable every night at midnight. There
is no batch, no event, nothing to release.

So the push on the 20th says *"just released new availability — check their
latest slots"* and what's actually there is one day more than the 19th. It
asserts a fact the app never verified — the same failure mode as the
"Payment Not Collected" notifications removed in `ff2be62` (auto-memory
`unverifiable-notifications-removed`).

Live at time of writing: 6 providers, 1 with a release day set; all 6 on
`booking_window_days = 30`; 4 follows, 1 with the bell on. So this has almost
certainly never misled a real user yet — but it will the moment it's used.

**Second-order problem, same root cause.** Because the window rolls, every date
a client can book is always live, so a provider has **nowhere to draft**. Any
edit to the weekly template in `ProviderScheduleScreen` (Working Hours) applies
instantly to every future date, including dates already booked.
`findScheduleIssues()` flags the resulting clashes after the fact (auto-memory
`schedule-issue-highlighting`), which is a mitigation, not a fix. There is no
"work on next month privately" state.

### What needs to exist

**1. An explicit horizon, as an alternative to the rolling one.**
Add `providers.bookable_through_date DATE` plus a mode (`rolling` — today's
behaviour, the default and what every existing provider keeps — or `monthly`).
The bookability trigger gains a branch: `monthly` providers are bounded by
`booking_date > bookable_through_date` instead of `CURRENT_DATE +
booking_window_days`. This touches the check **every booking in the app passes
through**, so it needs `cerviced-booking-domain` and a real migration, not an
inline edit.

**2. The cron advances the horizon, then notifies — in that order, one
transaction.** `process_follow_schedule_release_nudges()` currently only sends.
It should first push `bookable_through_date` forward a month for that provider,
and only send if that succeeded. That is what makes the message true: the push
is *caused by* the release rather than merely coinciding with it. The horizon
must advance whether or not the provider edited anything — "release day" means
"next month is now bookable," not "I did my homework." A provider who never
touches their diary must not silently go unbookable.

**3. Merge the two controls onto one screen.** Today the release day is in
`ProviderAutomationsScreen` (Automations) and the window is in
`SchedulingScreen` (Booking Rules → "How far ahead clients can book",
`BOOKING_WINDOW_OPTS`). They describe the same real-world thing and have never
met — that split *is* the bug. "How far ahead clients can book" should become a
choice of shape (a rolling window of N days, **or** a monthly release on the
Nth), with the day-of-month picker moving there from Automations, because it is
now a booking rule rather than a notification setting. Automations loses the
toggle entirely.

**4. Show the wall on both sides.** Provider, in Working Hours: a visible line —
"clients can book up to here · next release: 20th" — with everything past it
theirs to edit freely. Client, in the date picker: instead of the picker
silently ending, an end-cap reading "Books open on the 20th" with the bell
attached. Without that end-cap the drop does nothing for discovery, which is
most of the point.

**5. Emergency requests already fit.** `allow_beyond_window_requests` (auto-memory
`emergency-booking-requests`) would simply mean "past the released horizon" for
`monthly` providers — a clean reuse, no new opt-in.

### Cheaper alternative, if the trigger stays untouched

Leave the mechanism alone and fix only the claim: "Ivy usually updates her diary
around the 20th" instead of "just released new availability." Honest, zero
schema, zero risk — but gives up both the drop and the drafting space. Worth
doing *now* as a stopgap regardless, since the current copy is the untrue part.

### Related

- Auto-memory `unverifiable-notifications-removed` — the standing rule this
  currently violates.
- Auto-memory `schedule-issue-highlighting` — the after-the-fact mitigation for
  the no-drafting-space problem.
- Auto-memory `emergency-booking-requests` — the beyond-window opt-in.
- `## Provider Deactivation / Pause Bookings` above — another case of provider
  availability needing a state the weekly template can't express.

## No-Show Disputes — the two options NOT taken (2026-08-27)

A no-show is an accusation about someone who isn't in the room to answer it,
and it is terminal: `provider_update_booking_status()` and
`client_mark_provider_no_show()` both refuse to write over `no_show` /
`provider_no_show`, so nothing in the app moves a booking back out of one.

**What was built** (migration `20260827154500_no_show_disputes.sql` + the
dispute button on both booking detail screens): the accused party can record
that they say it's false, within 7 days. That does three things — the other
party is notified, a support ticket is filed with the booking reference and
their own words, and the no-show stops on its way to becoming a permanent
`client_provider_reliability.no_show_count`. `settle_no_show_reliability()`
only counts a no-show after the window closes undisputed, so a contested
accusation never quietly scores against someone.

**What it deliberately is not:** an adjudication system. Cerviced does not
decide who is right, and no code path reverses a no-show. Resolution today
means a human reads the support ticket and, if warranted, edits the row by
hand. That is the honest description of the current state.

Two options were weighed against this one and deferred. Revisit when there is
enough real dispute volume to know which failure actually costs more — false
accusations, or honest mistakes nobody can take back.

### Option 2 — reversal within a window

Let whoever *marked* the no-show undo it themselves, within some window
(the appointment day, or 24-48h). No one has to arbitrate: it just handles the
honest-mistake case, which is probably the most common one — a provider marks
the wrong booking of two that day, or marks it before the client walks in ten
minutes late.

- Needs an RPC that can write over a terminal status, which is the whole
  reason the terminal guard exists. Scope it hard: only the actor who set it,
  only back to the status it came from, only inside the window, and never
  after `no_show_counted_at` is stamped.
- Interacts with the settle job: a reversal after settlement would need to
  decrement the counter, which the counter table has no per-booking record to
  support. Simplest answer is to forbid reversal once counted — the 7-day
  settle window is already longer than any sane reversal window.
- Cheapest of the three to build, and complements rather than replaces what
  was built: reversal handles mistakes, disputes handle disagreements.

### Option 3 — real adjudication

Someone at Cerviced reviews a dispute and rules on it, with the outcome
written back to the booking and (for a client) to their reliability count.

- Needs a real queue and an admin surface — there is no admin app at all
  today, so this is the largest of the three by a wide margin. `support_requests`
  has `status` and `resolved_at` columns but nothing reads or writes them.
- Needs an evidence standard and a stated turnaround, both of which are
  T&Cs questions, not engineering ones: who decides, on what basis, in what
  time, and what a ruling actually changes. **Run this past
  `cerviced-legal-flagger` before building anything** — the moment Cerviced
  rules on a disagreement between two users it is taking a position it
  currently disclaims (see the Terms' "not liable for disputes arising from
  cancellations" clause).
- Only worth it at volume. Below that, a person reading support email *is*
  the adjudication system, and a queue would just be a worse inbox.

### Also open

- **`no_show_count` is per-provider, not global.** A client with ten no-shows
  across ten providers looks clean to every one of them. Deliberate for now
  (a provider seeing a stranger's history with someone else is its own
  privacy question), but it means the counter is weaker evidence than it
  looks — worth remembering before anything is ever gated on it.
- **Nothing surfaces a dispute to the provider outside the notification and
  the booking detail screen.** If disputes become common, the clientele
  screen's reliability badge should probably say "1 no-show, 1 disputed"
  rather than showing a bare count that a dispute silently held back.

---

## Notification Threading (group related notifications by booking)

### What it means

`NotificationsScreen` today is one flat, reverse-chronological list. A single
booking that gets confirmed, has a reschedule requested, then answered, then
reminded-about can produce four or five separate rows scattered through the
list rather than reading as one story. Grouping the notifications that share a
booking into a single collapsible thread — most recent state up front, the
rest expandable — would read the way a real conversation does instead of a
flat feed.

### What currently exists that this could build on

Every notification row already carries the key a thread would group on:
`notifications.booking_id`, read into `Notification.bookingId` in
`NotificationsScreen.tsx` (`mapDbNotificationToLocal`-equivalent around line
231) and already used for tap-to-navigate ("View Booking" opens
`BookingDetail`/`ProviderBookingDetail` with that id). Not every notification
type carries one — `schedule_fully_booked` and similar provider-wide types are
about the whole diary, not a booking — so a threading pass only ever groups
the subset that already has `bookingId` set; the rest stay as standalone rows
same as today.

### What needs to happen

- Group `notifications` client-side by `bookingId` (nothing server-side
  changes — this is a presentation grouping, not a new table) into a thread
  entry: latest notification's title/preview shown collapsed, full list on
  expand.
- Unread state has to work at both levels — a thread with any unread member
  shows the unread treatment (see the accent-tinted/bordered card just built),
  and expanding a thread should mark its members read the same way opening a
  single notification does today (`markNotificationRead`).
- Swipe-to-delete and the read/unread filter tabs both need to decide whether
  they act on the thread as a whole or drill into a single member — deleting
  a whole thread is probably right (mirrors "delete conversation"), but needs
  a decision, not an assumption.
- The standalone (no `bookingId`) notifications keep rendering exactly as
  they do today, interleaved with threads in the same chronological list.

### Why it's deferred

Not requested yet as a build — noted here as a live idea to revisit, not a
spec ready to implement. The read/unread visual treatment and the
Apple-Mail-style swipe-to-delete (both landed 2026-08-28) are natural
prerequisites this would sit on top of, so it belongs after those had a chance
to be used for a while, not bundled into the same change.

---

## Search/Explore/Becca Matching on Per-Service Audience

### What it means

`services.audience` ('women' | 'men' | 'kids' | 'everyone', nullable = not
stated) was added 2026-08-28 — a per-service demographic tag, editable via a
"Who's This For?" chip section in the provider's Add/Edit Service modal
(`InfoRegScreen.tsx`'s `ServiceModal`). The stated motivation was "so the app
can suggest better." As of 2026-08-28, Home, Search, and Becca's two main
capabilities all read it. Explore's own filter tabs do not yet.

### What currently happens

- **HomeScreen's Male/Kids sections** widen `maleProviders`/`kidsProviders`
  to include any provider with ≥1 active service tagged `audience='men'`/
  `'kids'` (via `getProviderIdsByServiceAudience()`, which doesn't require a
  photo — a provider must qualify from the tag alone). This part is live.
  The "Popular Men's/Kids' Services" photo rail of actual matching services
  (via `getDiscoverServices(undefined, 15, audience)`) is a separate piece,
  pulled behind `AUDIENCE_SERVICE_PHOTOS_ENABLED` — see the dedicated
  "deferred" section below. The section itself no longer hides outright for
  a client whose stated gender/interests don't match (2026-08-28) — it's
  always shown when there's matching data, just deprioritized to the bottom
  of the feed (just above Book Again) instead of its normal early slot
  between Near You and Book Again.
- **SearchScreen** has a "Who It's For" filter (Women/Men/Kids) in
  `FilterOptions.audience`, resolved via a new batched
  `getProviderAudienceMatches(providerIds, audience)` scoped to the
  already-searched candidate set — same shape as the existing `hairType`
  filter, same "qualifies via any matching service" rule as Home.
- **Becca** — `src/services/becca/entityResolver.ts`'s `AUDIENCE_OVERRIDES`
  now attaches an `audience` field to the resolved `ServiceRef`
  (`types.ts`) whenever an audience phrase is detected ("men's haircut",
  "for my daughter"), independent of whether that phrase also overrode the
  resolved category to MALE/KIDS. Two capabilities in
  `capabilities/client.ts` use it: the main "find a provider" capability
  narrows `dbProviders` via `getProviderAudienceMatches` before replying, and
  the inspiration/gallery capability passes `audience` through to
  `getDiscoverServices()`. **Not yet wired**: the price-lookup capability
  ("how much are nails") and the availability capability ("who's free this
  week") still call plain `getProviders(category)` with no audience
  narrowing — lower-value additions, left for a follow-up rather than
  touching every capability that calls `getProviders` in one pass.
- **Explore still has no audience filter.** `getDiscoverServices()` accepts
  `audience` as of 2026-08-28, but Explore's own filter tabs (`filterMap` in
  `ExploreScreen.tsx`) have no UI entry point for it yet, distinct from the
  existing Hair/Nails/Makeup/etc. category tabs.
- `audience` is nullable and had zero live rows as of 2026-08-28 (brand new
  column) — a provider has to actually pick a chip for any of the above to
  surface anything for them.

### What would need to happen for Explore

Explore's own filter tabs (`filterMap` in `ExploreScreen.tsx`) would need a
UI entry point for `audience`, then thread it into its existing
`getDiscoverServices(category)` call the same way Becca's gallery capability
now does (`getDiscoverServices(category, limit, audience)`).

### Why the rest is deferred

Price-lookup and availability-search capabilities in Becca weren't wired
because narrowing a price average or a "who's free" list by audience is a
smaller win than narrowing the main "find me a provider" answer, which is
already done. Noted here so the next pass doesn't have to re-derive which
capabilities were touched and which weren't.

---

## Home's "Popular Men's/Kids' Services" photo rail — deferred (client-facing)

### What it means

Within HomeScreen's Male/Kids sections, a "Popular Men's Services" /
"Popular Kids' Services" horizontal rail of `PortfolioCard` photo tiles for
the actual `services.audience`-tagged services (not just provider tiles) —
tapping one opens that specific service's booking modal. Built alongside the
rest of the `services.audience` work on 2026-08-28 (see the section above),
but held back from shipping on the same pass.

### What was done

A single flag, `AUDIENCE_SERVICE_PHOTOS_ENABLED` in
`src/constants/featureFlags.ts`, gates:
- The `getDiscoverServices(undefined, 15, 'men'/'kids')` fetches in
  `HomeScreen.tsx`'s initial-load effect, so no service-photo data is even
  fetched while the flag is off.
- The "POPULAR MEN'S SERVICES" / "POPULAR KIDS' SERVICES" render block
  inside `renderMaleSection`/`renderKidsSection`.

Nothing else in the Male/Kids sections is touched — the provider-tile
widening via `getProviderIdsByServiceAudience()`, the sections' own
presence/position, Search's "Who It's For" filter, and Becca's audience
matching are all unaffected and stay live.

### To bring it back

Flip `AUDIENCE_SERVICE_PHOTOS_ENABLED` to `true` in
`src/constants/featureFlags.ts`. No other changes needed unless
`getDiscoverServices` or `PortfolioCard` have drifted in the meantime.
