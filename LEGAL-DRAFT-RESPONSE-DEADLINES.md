# Response Deadlines — Facts & Draft Clauses

**NOT LEGAL ADVICE. Written by an engineer, not a lawyer, at the user's
explicit request (2026-08-27).** `CLAUDE.md`'s standing rule is to flag
legal-adjacent gaps rather than draft copy unilaterally; this file exists
because that rule was overridden deliberately for this one document. Nothing
here has been reviewed by anyone qualified. Treat Part B as a **starting point
to hand to a lawyer**, not as wording to publish.

Companion to [LEGAL-COMPLIANCE-NOTES.md](LEGAL-COMPLIANCE-NOTES.md) §12, which
raises the gap this document tries to fill. Engineering detail for the
reschedule half is [BOOKINGS.md](BOOKINGS.md) §7a.

> ⚠️ **The numbers below are moving.** Several were changed on 2026-08-26 and
> 2026-08-27 (the waitlist hold went from 3 hours to 15 minutes on the 27th
> alone). Every figure in Part B is marked with where it is actually enforced.
> **Re-verify each one against live before publishing anything**, and prefer
> wording that doesn't hard-code a number where the product may still move it.

---

## Part A — What the app enforces today

The problem in one line: **the app already applies deadlines to users that no
user-facing document mentions.** A deadline enforced but never stated is the
wrong way round — people should be told the rule before it is applied to them,
and it should be the same number in both places.

| # | Deadline | Applies to | What happens when it passes | Enforced by | Told to the user? |
|---|---|---|---|---|---|
| 1 | **48 hours** from the booking request, or the appointment time, whichever first | A provider who hasn't accepted a booking request | Booking is **cancelled** | `process_expire_stale_pending_bookings()`, cron every 30 min | ❌ Nowhere |
| 2 | The **provider's own reschedule-notice setting** (min 24h), capped at the start of the appointment day (min 4h, never past the appointment time) | A provider who hasn't answered a reschedule request | Request **expires**; booking stays as originally scheduled | `process_expire_stale_reschedule_requests()`, cron `:17`/`:47` | ⚠️ Only after the fact, by notification |
| 3 | Same window as #2 | A client who hasn't picked from the dates their provider offered | Request **expires**; offered times released; both sides told | as #2 | ⚠️ Only after the fact |
| 4 | **10 minutes** | A client at checkout, between reserving times and paying | Held times are released to everyone else | `hold_cart_booking_slots()` TTL + `expire_cart_holds()` | ⚠️ Partially — a countdown is shown at checkout |
| 5 | **15 minutes** (was 3 hours until 2026-08-27) | A client offered a slot from a waitlist | Hold lapses, slot passes to the next person in the queue | `expire_waitlist_holds()`, cron every minute | ✅ In the offer notification |
| 6 | The appointment's **end time** (or start + 1h where no end time is recorded) | Any confirmed/in-progress booking | Automatically marked **completed** | `process_auto_complete_bookings()`, cron every 30 min | ❌ Nowhere |
| 7 | The **provider's cancellation-notice setting** (24h / 48h / 72h) | A client wanting to cancel | Cancellation is **refused** | `cancel_own_booking()` | ✅ Shown on the provider's profile and at booking |
| 8 | The provider's **reschedule-notice** setting and **max-reschedules** cap (default 24h / 1) | A client wanting to reschedule | Request is **refused** | `request_reschedule_own_booking()` | ✅ Shown when refused |

**#1 and #6 are the sharp ones**: both change the state of a user's booking,
automatically, on a timer, with no notice given beforehand and no document
stating the rule.

**Also needs reconciling before any number is published:** account deletion is
documented as a **30-day** grace period ([ACCOUNT_DELETION.md](ACCOUNT_DELETION.md)),
but the live grace period was set to **1 day** for testing and has not been put
back (`PRE-LAUNCH-TODO.md`). A stated deadline that doesn't match the enforced
one is worse than no statement at all — this must be corrected in one direction
or the other before launch.

---

## Part B — Draft clauses

Plain-English drafts, for a lawyer to correct. Each is followed by the fact it
is meant to describe, so the reviewer can check the wording against the
behaviour rather than trusting either.

### B1. Provider response to a booking request

> When you request a booking, the provider has **48 hours** to accept it. If
> they have not accepted within that time, or if the appointment time arrives
> first, the request is automatically cancelled and you are not charged. We
> will tell you when this happens.

*Describes #1. Note: "you are not charged" needs checking against the payment
flow — a booking request that took a deposit and is then auto-cancelled has no
refund path in the app today (see Part C).*

### B2. Provider response to a reschedule request

> If you ask to move an appointment, your provider has a limited time to
> respond — the same amount of notice they ask you to give when rescheduling,
> and never later than the start of your appointment day. If they do not
> respond in time, your request expires and **your original appointment stands
> unchanged**. We will tell you when this happens.

*Describes #2. Deliberately doesn't quote a fixed number of hours, because the
window is derived from each provider's own setting.*

### B3. Your response to dates a provider offers

> If your provider offers you alternative times, those times are held for you
> until the same deadline. If you have not chosen one by then, the offer
> expires, the times are released, and your original appointment stands
> unchanged.

*Describes #3.*

### B4. Times held during checkout and from a waitlist

> Times are reserved for you for a limited period — while you complete payment
> at checkout, and when a place is offered to you from a waitlist. The app
> shows you how long you have. If the time runs out, the reservation is
> released and the time becomes available to other clients again.

*Describes #4 and #5. Deliberately doesn't quote minutes: both numbers have
changed recently, and #5 changed by an order of magnitude in one day.*

### B5. Appointments marked as completed

> After an appointment's scheduled end time has passed, it is automatically
> marked as completed. If an appointment did not go ahead, contact your
> provider — completion is a record of the scheduled time passing, not
> confirmation that the service was provided.

*Describes #6. The second sentence matters: the app cannot verify attendance,
and "completed" should not be read as the platform asserting the service
happened.*

### B6. Cancelling and rescheduling

> Each provider sets their own notice periods for cancelling and rescheduling,
> and how many times a booking may be rescheduled. These are shown on their
> profile before you book. Requests made with less notice than the provider
> requires will not be accepted.

*Describes #7 and #8. This one largely restates what the T&Cs already say about
provider-set policies — included so all deadlines appear in one place.*

---

## Part C — What the wording cannot fix

Three things a lawyer should see, because no drafting resolves them:

1. **Reschedule expiry can consume a client's cancellation right.** A client
   who asks to reschedule while they still have the right to cancel can find
   that right gone by the time the provider's silence resolves — the two
   windows are unrelated and nothing connects them. Full worked examples in
   `FUTURE_SCALE.md` ("Reschedule expiry eats the client's cancellation
   right"). The mitigation now planned is a **warning notification** before
   the cancellation window closes, which restores the client's choice where
   there is time to warn them — but not where they were already at the
   boundary when they asked. Whether a provider's non-response should also
   entitle the client to cancel without penalty is a product/legal decision,
   not an engineering one.

2. **There is no refund mechanism in the app at all.** Any clause implying
   money comes back (B1's "you are not charged", and anything a lawyer might
   add about penalty-free cancellation) describes behaviour that does not
   exist yet. See `LEGAL-COMPLIANCE-NOTES.md` §6 and `PRE-LAUNCH-TODO.md` §1b.

3. **A no-show inside the notice window counts against the client**
   (`late_cancel_count` on `client_provider_reliability`), including in the
   case above, where the client's inability to cancel was caused by the
   provider's silence. If that is not intended, the reliability tracking needs
   to exclude it — a wording change won't.

---

## Part D — Questions for the lawyer

1. Is a platform-enforced automatic cancellation (#1) and automatic completion
   (#6) something that must be disclosed before it can be applied, and if so,
   where — T&Cs, the booking confirmation, or both?
2. Does "completed", generated automatically from a clock, create any
   implication that the service was delivered? Does B5's disclaimer cover it?
3. Where a provider's non-response consumes a client's cancellation right, does
   UK consumer protection law give the client a remedy regardless of what our
   T&Cs say?
4. Is expiry copy that says a provider "did not respond in time" safe as a
   statement of fact about a named business, given it is generated
   automatically from silence?
5. Must deadlines be stated as fixed numbers, or is "the notice period shown on
   the provider's profile" sufficient where the value is per-provider?
