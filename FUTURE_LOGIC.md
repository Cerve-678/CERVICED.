# CERVICED — Future Logic

Plain English explanations of features not yet built, what they mean, and exactly what needs to happen when we build them. Read this before starting any of these features so you don't have to re-derive the logic from scratch.

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

## Real-Time Calendar Updates

### What it means

If two clients are both looking at the same provider's calendar at the same time, and one of them books the 2pm slot, the other client's screen should update immediately to show 2pm as taken — without them having to refresh.

### What exists

`BookingContext` already subscribes to Supabase Realtime on the `bookings` table. When a booking is inserted or updated, the context reloads the current user's bookings. This handles the provider dashboard updating in real time.

What it does NOT do: update the client-side calendar (ModernBeautyCalendar) when a slot gets taken by someone else. The calendar fetches availability once when it renders and doesn't listen for changes.

### What needs to happen

In `ModernBeautyCalendar`, set up a Supabase Realtime subscription on `bookings` filtered by the current `provider_id`. When a booking INSERT or UPDATE event fires, re-run `generateWeeklyAvailability()` to refresh the slot display. This means a client watching the calendar sees slots disappear in real time as others book them.

---

*Last updated: 2026-06-07*
