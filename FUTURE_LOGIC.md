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

## Emergency / Same-Day Bookings

### What it means

Right now `min_booking_notice_hrs` is a hard wall — if a provider requires 24 hours' notice, a client who wants (and the provider would actually accept) a same-day slot has no path to book one in-app. There's no concept of a provider opting into "I'll take emergency/last-minute bookings under my normal notice window."

### Rough shape of what's needed

- A way for a provider to mark themselves as accepting emergency/same-day bookings at all (a new provider-level flag, e.g. `accepts_emergency_bookings boolean`), separate from their normal `min_booking_notice_hrs`.
- A client-facing path to request one — likely not the normal calendar/time-picker (which should keep hiding times outside the provider's stated notice window, not surface them as if they were normal availability), but a distinct "Request Emergency Appointment" action on the provider's profile that goes through a different flow — a request the provider explicitly approves, rather than an instant-book slot the calendar just shows.
- Provider-side: needs to see and act on incoming emergency requests (accept/decline), and the app needs a booking status or flag that distinguishes an emergency booking from a normal one, since it bypassed the normal notice-window check on purpose.
- This is explicitly a provider-opt-in feature, not a client-side toggle — a provider who hasn't opted in should never show any emergency-booking path at all.

### Not scoped yet

No decision made on the request/approval flow's exact screens, whether emergency bookings carry different cancellation-policy terms, or how this interacts with the provider's normal calendar once approved (presumably it just becomes a normal confirmed booking at that point). This is a feature idea flagged from user feedback during 2026-08-04 cart-checkout testing, not a spec — needs product direction before implementation starts.

---

---

## Offers / Promotions — deferred (client-facing browse)

### What it means

Offers/Promotions are temporarily pulled from BOTH sides of the app as of 2026-08-09: the "CURRENT OFFERS" carousel on the client Home screen (and the full-browse `OffersScreen` it links to), and every provider-side entry point into `ProviderPromotionsScreen` (creating/editing/managing promotions). Nobody — client or provider — can currently reach promotions through the UI. This is a UI-visibility decision, not a data/backend change.

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

Flip `OFFERS_ENABLED` to `true` in `src/constants/featureFlags.ts`. No other changes needed unless the underlying screens/data have drifted in the meantime.

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

*Last updated: 2026-08-09*
