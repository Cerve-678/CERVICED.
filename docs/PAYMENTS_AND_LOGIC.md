# CERVICED Payments & Payouts Handbook

The single description of how money moves through CERVICED: what clients pay,
what providers receive, when, and what happens when something goes wrong.

| | |
|---|---|
| **Who this is for** | Everyone who handles money questions: support, operations, finance, engineering |
| **Status as of** | 30 October 2026, checked against the live database and the code on `main` |
| **Stripe mode** | **TEST.** No real money has moved yet. Going live is a key switch (Part 6) |
| **Owner** | The founder, until a payments owner is hired |
| **Rule** | Any change to money logic updates this file **in the same pull request**. A PR that changes fees, holds, payouts, refunds, disputes, deposits, tips or debts without updating this handbook isn't done |

Not legal advice. Anything marked **Legal flag** needs a solicitor before real
money moves.

### How to read this

| You are… | Read |
|---|---|
| New to CERVICED, any role | Part 1 (15 minutes) |
| In support or operations | Parts 1, 2 and 4 |
| An engineer changing money code | All of it, especially Parts 3 and 5 |
| Deciding what to fix next | Part 6 |

### Contents

1. [The basics](#part-1--the-basics)
2. [How each money flow works](#part-2--how-each-money-flow-works)
3. [Rules that never break](#part-3--rules-that-never-break)
4. [Operations runbooks](#part-4--operations-runbooks)
5. [Engineering reference](#part-5--engineering-reference)
6. [Known gaps, risks and launch blockers](#part-6--known-gaps-risks-and-launch-blockers)
7. [Decision log](#part-7--decision-log)

---

## Part 1 — The basics

### 1.1 What CERVICED is, in money terms

CERVICED is a marketplace. A client books and pays a beauty or wellness
provider through the app. **CERVICED takes the client's payment, holds the
provider's share for a short time, then sends it to the provider.** CERVICED
earns a small service fee, which the client pays on top of the price.

All money goes through **Stripe**:

- Clients pay with a card, Apple Pay, Google Pay or PayPal.
- Each provider has their own **Stripe account** (a "connected account"),
  which they set up from the app. CERVICED sends their share into it.
- Stripe then pays the provider's bank on Stripe's own schedule.

CERVICED never sees or stores card numbers.

### 1.2 Who pays whom

| Who | Pays | Receives |
|---|---|---|
| Client | The service price (or a deposit) **plus** CERVICED's service fee | Refunds, when they're owed |
| Provider | Nothing to CERVICED. Stripe's card fee comes out of late/no-show fees only | The service price (or deposit), late/no-show fees, the whole of every tip |
| CERVICED | Stripe's processing costs on bookings and tips, and any losses it can't recover | The service fee |

The provider never pays the service fee and never sees it.

### 1.3 The service fee

There's one fee per checkout, based on the value of what's being paid in full:

| Value of the booking(s) | Fee |
|---|---|
| Under £100 | £1.99 |
| £100 to £300 | £3.99 |
| Over £300 | £5.99 |

- **Deposit-only checkout:** the fee is based on the services' **full
  price**, not the deposit. A £30 deposit on a £100 service pays £3.99.
- **Mixed basket** (some services paid in full, some by deposit): the fee is
  based on the pay-in-full services only and spread across them.
- CERVICED takes **no cut** of late/no-show fees or tips.

### 1.4 The life of one booking's money (worked example)

Amy books a £60 gel manicure with Jo and pays in full. Jo's payout timing is
the default, 24 hours.

| When | What happens | Money |
|---|---|---|
| Checkout | Amy's slot is held for 10 minutes while she pays | — |
| Amy pays | Her card is authorised, then captured | Amy pays **£61.99** (£60 + £1.99 fee) |
| Booking confirmed | A **held payout** is created for Jo | CERVICED holds £60 |
| The appointment ends, Tue 3pm | The hold clock starts | — |
| Wed 3pm (+24h) | The payout job sends Jo's share to her Stripe account | Jo receives **£60** in Stripe |
| A few working days later | Stripe pays Jo's bank | £60 in Jo's bank |
| — | CERVICED keeps the fee | CERVICED earns **£1.99** |

If anything changes before Wed 3pm (a cancellation, a refund request, a
reschedule), CERVICED still holds the money, so it's easy to put right. After
that, putting it right means taking money back from Jo (section 2.8).

### 1.5 Words you'll hear

| Word | Meaning |
|---|---|
| **Checkout batch** | One checkout. It can contain several bookings with several providers |
| **Hold (slot)** | A time slot reserved for 10 minutes while the client pays |
| **Authorise / capture** | Authorise = the bank reserves the money on the card. Capture = the money is actually taken. CERVICED captures straight after authorising |
| **Held payout** | The provider's share, waiting at CERVICED until its release time |
| **Release / transfer** | CERVICED sending a held payout to the provider's Stripe account |
| **Bank payout** | Stripe sending money from the provider's Stripe account to their bank. Stripe does this, not CERVICED |
| **Payout timing** | How long after an appointment the provider's share is held: 24 hours, 3, 7, 14 or 30 days. The provider chooses |
| **Refund** | Money going back to the client |
| **Reversal / take-back** | Money taken back from a provider who has already been paid |
| **Shortfall / debt** | Money a provider owes CERVICED because a take-back couldn't be done in full |
| **Late / no-show fee** | A fixed £ charge a provider can make if the client is late or doesn't turn up |
| **Chargeback / bank dispute** | The client's bank forcibly takes a payment back |
| **Refund request** | A client asking for money back through the app |
| **Off-app payment** | Money paid directly between client and provider outside the app. CERVICED never tracks it |

---

## Part 2 — How each money flow works

### 2.1 Taking a booking payment (checkout)

1. **Reserve and price.** The server checks the basket, holds each slot for
   10 minutes and records the checkout. The server never trusts a price sent
   by the app: every amount is recalculated from the database.
2. **Add the fee** from section 1.3.
3. **Check the provider can be paid.** If any provider in the basket hasn't
   finished setting up their Stripe account, checkout is refused.
4. **Pay.** Payment methods offered:
   - Card, Apple Pay and Google Pay: always.
   - PayPal: only when no late/no-show fees apply, because a fee needs a saved
     card to charge later. PayPal is in **test mode** and needs a new app
     build. Real PayPal money also needs Stripe's marketplace approval.
5. **Late/no-show fee agreement.** If the provider has these fees, the client
   must tick to agree before paying. The agreement is stored (section 2.5)
   and the card is saved for a possible later charge.
6. **Capture and confirm.** The payment is captured and the bookings become
   `pending` (waiting for the provider to accept) or `confirmed`. The payment
   method (card, Apple, Google or PayPal) is stored for the receipt.
7. **Create the held payout**, one per paid booking (section 2.2).

If the card is declined, the client stays on the payment sheet and can try
again. Closing the sheet cancels the unfinished payment, and the slot holds
expire.

**Deposits:** if a service takes a deposit, the client pays the deposit plus
the fee in the app. **The remaining balance is paid to the provider off-app,
and CERVICED never records, collects or confirms it** (section 2.9).

### 2.2 Paying the provider (payouts)

**What the provider gets:** what the client paid, minus CERVICED's fee, minus
any refunds, minus any money the provider owes (section 2.8).

**When:**

```
appointment ends ─► + the provider's payout timing (24h / 3 / 7 / 14 / 30 days)
                 ─► the payout job sends it (runs every 15 minutes)
                 ─► Stripe pays their bank (Stripe's schedule, a few working days)
```

- **Payout timing** is set by the provider in *Payments & payouts → Payment
  settings*. The default is 24 hours, and it's never less. Choosing a
  **longer** time also delays payouts already waiting. Choosing a **shorter**
  time only affects new bookings, so a waiting payout is never pulled forward.
- **If the booking is moved**, the payout moves with it by the same amount of
  time, earlier or later (live since 29 October).

**The payout job** (`release-payouts`, every 15 minutes) checks each due
payout before sending it:

| Check | If it fails |
|---|---|
| Is a refund request open on this booking? | Wait, and try again on the next run |
| Is the booking still confirmed or completed? | Cancel the payout. Nothing is sent |
| Was the payment fully refunded, or is it disputed at the bank? | Skip it |
| Does every refund on the charge match CERVICED's refund ledger? | Skip it (an unexplained refund needs a person) |
| Does the provider owe money? | Take that out first (section 2.8). If it uses the whole payout, nothing is sent and the payout is marked paid |

Then it sends the rest to the provider's Stripe account. Each payout can only
ever be sent once, even if the job runs twice.

**If sending fails:**

| | |
|---|---|
| Automatic retries | About 1, 2 and 4 days after each failure (4 tries in total) |
| Support | Emailed at **support@cerviced.co** every time, with the reason and the next step |
| Provider | Told once, on the first failure, **only if** their Stripe account is the problem ("We couldn't send your £X… finish setting it up") |
| After the 4th failure | Marked **failed**. A person must retry it from the admin Money screen |
| If CERVICED can't tell whether Stripe sent it (for example, a timeout) | Marked **failed** at once, with no retry. A person must check Stripe first |

Each failure is classified as one of three causes:

- CERVICED's Stripe balance was too low. This fixes itself as client payments
  settle.
- The provider's account can't receive money. Only the provider can fix this.
- Something else.

**A bank payout failed** (Stripe → the provider's bank): this is between the
provider and Stripe. Stripe keeps the money and pays it again once the bank
details are fixed. The app is built to tell the provider and support, but
only if Stripe sends CERVICED events from providers' accounts, which **isn't
confirmed** (Part 6).

**What the provider sees** (*Payments & payouts*): the Overview, Booking
payments, Payouts and Payment settings sections. Each held payout shows
"Eligible for release from <date>. This is not a bank arrival date."
Providers never see CERVICED's fee, the client's fee-inclusive total or
CERVICED's revenue.

### 2.3 Cancellations and refunds

Every refund goes back to the original payment method: card, Apple/Google
Pay or PayPal.

| Situation | Who starts it | What the client gets back | What the provider keeps | CERVICED's fee |
|---|---|---|---|---|
| Provider declines or cancels a paid booking | Provider | Everything, automatically | Nothing | Refunded |
| Provider doesn't accept within 48 hours, or before the start time | Automatic (every 30 min) | Everything, automatically | Nothing | Refunded |
| Client cancels **before** the provider's cancellation window | Client | Everything | Nothing | Refunded |
| Client cancels **inside** the window; the provider's policy is "no charge" | Client | Everything | Nothing | Refunded |
| Client cancels inside the window; the policy is **keep the deposit** | Client | Everything except the deposit and the fee | The deposit | Kept |
| Client cancels inside the window; the policy is **keep the full price** | Client | Nothing | Their full share | Kept |
| Provider gives a **full** refund (any reason) | Provider | Everything not yet refunded | Nothing | Refunded |
| Provider gives a **partial** refund | Provider | The amount they choose, from their share | The rest | Kept |
| CERVICED approves a refund request | Admin | Same as the provider's full/partial rules | — | As above |
| Off-app payment | — | Not CERVICED's business. The client is told it's between them and the provider | — | — |

- A booking can be refunded more than once. For example, the policy kept a
  deposit, and later the provider gives it back.
- A client is never charged more than they originally paid.
- **Cancellation window:** set by the provider (none, or 24, 48 or 72 hours
  before the appointment). The policy at the time of booking is frozen onto
  the booking.
- When a late cancellation keeps money, both sides are told: the provider
  ("You kept the £20 deposit…") and the client ("£40 refunded…").
- **PayPal:** the same rules apply. Stripe allows PayPal refunds up to 180
  days after payment.

**Worked example.** Amy pays £61.99 for a £60 service whose deposit is set at
£20, then cancels 3 hours before. Jo's policy is a 24-hour window, keep the
deposit. Jo keeps £20 (sent straight away), CERVICED keeps £1.99, and Amy
gets £40 back.

**Where the provider's money comes from in a refund:**

- If the payout is still held, it's simply lowered or cancelled.
- If the provider has already been paid, the transfer is reversed (taken back
  from their Stripe balance). If the balance can't cover it, the rest becomes
  a debt (section 2.8).

### 2.4 Refund requests (client → provider → CERVICED)

These cover "I want my money back" situations that aren't a simple
cancellation.

```
Client asks  ──►  WITH PROVIDER  ──► provider refunds ───────────────► REFUNDED
(6 fixed reasons)      │
                       └─► provider passes it to CERVICED, with a note ──► UNDER REVIEW
                                                                            │
                                           admin approves (refund) ◄────────┤──► REFUNDED
                                           admin declines (note to client) ◄┘──► DECLINED
```

- **The reasons a client can pick:** the provider cancelled; the provider
  didn't turn up; the service wasn't what I booked; I was charged the wrong
  amount; I cancelled within their policy; something else. They can add their
  own message, which stays in the app.
- Requests are only for bookings paid through the app, with one open request
  per booking.
- **While a request is open, the provider's payout for that booking is
  held.** The provider is told so in the notification, the email, on the
  booking and on Payments.
- The provider can't decline a request. They either refund it or pass it on
  with a note saying why.
- Any refund on the booking automatically closes the request as refunded.
- CERVICED can only decline a request the provider has passed on, and must
  write the reason the client will see.
- **There's no deadline:** a request can sit with the provider indefinitely
  (Part 6).

### 2.5 Late and no-show fees

A provider can set two fixed £ fees in their policy: **late arrival** (after
their grace period) and **no-show**. Each is capped at **50% of the service
price**.

| Rule | Detail |
|---|---|
| Agreement | The client ticks to agree at checkout. CERVICED stores a record of who agreed, when, which wording version (checked by fingerprint), the amounts per provider and the app version. Records are kept **six years**, even after the account is deleted |
| Amount | Frozen onto the booking when it's made. The app can never send a different figure |
| When | Once per booking, from the start of the appointment until **24 hours after it ends** |
| No-show | Only after the provider marks the booking a no-show, and only after their grace period |
| Late | Only on a booking that went ahead |
| How it's paid | Charged to the card saved at checkout. Card payments only |
| The provider receives | The fee **minus Stripe's actual card fee**, held 24 hours, then sent, less any money they owe (section 2.8) |
| CERVICED | Takes nothing |
| Saved card | The client can't remove it until 24 hours after the appointment |

**If the card is declined** (or the bank wants the client to approve the
payment):

1. The fee becomes a **payment request** to the client, in the app and by
   email, open for **7 days**. Paying in the app and paying on the emailed
   Stripe page pay the same invoice, so it can't be paid twice.
2. If the card was **declined** (rather than needing approval) and the client
   agreed to the newer wording (`2026-10-19-retries`), the card is tried
   again automatically about **1, 3 and 6 days** in.
3. After 7 days unpaid, the request lapses and the provider is told. The
   provider can also cancel a request early.

**If the client disagrees with a fee:** they dispute it **with the
provider**, who refunds it or keeps it. CERVICED doesn't judge fee disputes.
The fee's payout is paused while a dispute is open.

**Legal flag:** the Terms §6 wording and the checkout tick box were written as
directed, not by a lawyer. A fee must read as a genuine estimate of loss, not
a penalty (LEGAL-COMPLIANCE-NOTES §17).

### 2.6 Tips

| Rule | Detail |
|---|---|
| When | After a **completed** appointment, until **48 hours** after it ends (UK time). After that the app shows "Tip closed" and the server refuses. One tip per booking |
| Amount | £1 to £500 |
| How | Card only, through the app |
| The provider | Must have a working Stripe account; otherwise tipping isn't offered |
| The provider receives | The **whole tip**, held 24 hours (not their chosen payout hold), then sent |
| CERVICED | Takes nothing, and **pays Stripe's card fee** on the tip (about 1.5% + 20p on a UK card). The fee is recorded in `booking_tips.stripe_fee_pence` for CERVICED's books |
| Refunds | **Non-refundable.** The client Terms and the tip sheet say so, and no refund path touches `booking_tips` |
| Tip notice | The database writes a `tip_received` notification (trigger `on_booking_tip_succeeded`, live). The app can't show or push it until PR #163 merges and `send-push-notification` is redeployed |

- **Changing the amount** before paying updates or replaces the open payment,
  so an old payment sheet can never charge the old amount.
- The app says "paid" only once the tip is recorded; until then it says
  "processing" and the Stripe webhook finishes it.
- The payout never waits on Stripe's fee: the provider's amount is the tip
  itself, so it's held from the moment the tip is recorded.

**Gaps:** a client can still dispute a tip with their bank. A chargeback
after the payout lands on CERVICED and isn't taken back from the provider. A
disputed tip still on hold is skipped rather than marked reversed. Providers
can't see a list of their tips in the app yet (PR #159).

### 2.7 Chargebacks (bank disputes)

When a client's bank forcibly reverses a payment:

1. Stripe takes the disputed amount from CERVICED's balance and tells
   CERVICED.
2. CERVICED immediately takes back what the provider was paid for that
   payment, for booking payouts and late/no-show fee payouts alike. Each is
   taken back once only, even if Stripe repeats the event.
3. If the provider's balance can't cover it, the rest becomes a debt
   (section 2.8).
4. A payout not yet sent is skipped by the payout job while the dispute is
   open.

**Not automated:** responding to the dispute with evidence is done by hand in
the Stripe Dashboard (runbook R6). Stripe's own dispute fee is **not** passed
on to the provider; CERVICED absorbs it.

### 2.8 When a provider owes money (debts)

**How it happens.** Jo was paid £40. Later the client is refunded, or their
bank charges back. CERVICED reverses Jo's £40 transfer, but most of it has
already gone to Jo's bank: only £10 is left in her Stripe account. CERVICED
takes the £10. **Jo now owes £30.**

**What happens next** (decided 29 October: tell them, then take it):

1. Jo is told straight away: *"£30.00 will come out of your next
   payments"*, with which booking and why, and her total if she owes more.
2. Her next payouts pay it off, oldest debt first. That includes **booking
   payouts, late/no-show fee payouts and cancellation payouts**. A payout
   smaller than the debt goes to it entirely. A bigger one pays it off and
   the rest is sent.
3. Each time, she's told: *"£15.00 went towards what you owe… The other
   £35.00 has been sent to your Stripe account. You still owe £15.00"*, or
   *"That's everything paid off"*.
4. If a payout fails to send, the amount it would have paid off goes back on
   the debt. A debt is never forgiven by money the provider didn't receive.

These notices always reach the provider's phone; the Payment Updates switch
can't mute them. There's no "pay it back now" button. Tips are **not** used
to pay off debts.

**If the provider never earns again** on the app, the debt is never recovered
automatically. It shows on the admin Money screen and in the daily email
until someone deals with it (runbook R5).

### 2.9 Money CERVICED deliberately doesn't track

CERVICED never collects, stores, verifies or confirms money paid between a
client and a provider outside the app. The main example is **a deposit's
remaining balance**. This is a deliberate liability boundary (Terms,
"Deposits & Remaining Balances"). Never build a feature that records such
payments, and never tell a client or provider that CERVICED knows whether one
was made.

---

## Part 3 — Rules that never break

These are enforced by the database or the server, not by people. If you find
one broken, it's a top-severity bug: stop and escalate.

| # | Rule | Enforced by |
|---|---|---|
| 1 | The app never decides an amount. Every price, fee, refund and payout is recalculated on the server | Server functions; the app sends only ids |
| 2 | A provider's payout is never more than what the client paid minus CERVICED's fee | Database check |
| 3 | Each booking has at most one payout, and each payout is sent at most once, even if a job runs twice | Unique keys + Stripe idempotency keys |
| 4 | Nothing is paid out for a cancelled, fully refunded or disputed booking | Re-checked at release |
| 5 | Nothing is paid out while a refund request is open | Re-checked at release |
| 6 | Every payout is held at least 24 hours after the appointment ends | Database check + allowed values |
| 7 | Money taken back from a provider is never lost or taken twice. What Stripe won't reverse becomes a recorded debt, and a deduction is given back if its payout fails | Debt ledger + idempotent take-back |
| 8 | A refund can't cancel a fee payout that's in the middle of being sent | Release claim: the refund is refused for a minute, then retried |
| 9 | A client is never charged more than they paid when cancelling | Cancellation settlement maths |
| 10 | A late/no-show fee is never charged without a stored agreement covering that provider | `booking-fee` checks the consent record |
| 11 | Card data never touches CERVICED | Stripe's own card fields; only brand, last 4 and expiry are read from Stripe |
| 12 | Only the server can move money. App users can't call any payout, debt or refund function directly | Function permissions (service role only) |
| 13 | Off-app payments are never tracked | Product rule (section 2.9) |

---

## Part 4 — Operations runbooks

### 4.0 Daily routine

1. **Check the money summary email** at support@cerviced.co, sent at 08:00
   UTC (08:00 UK time in winter, 09:00 in summer). It's only sent when
   something needs attention: payouts that failed or are being retried,
   unpaid provider debts, and open refund requests.
2. **Check the admin Money screen** in the app: the **Money (admin)** row in
   account settings, visible to admins only. It has three lists: failed
   payouts, money owed and refund requests.
3. **Check support@ for live alerts.** Every failed payout sends one
   immediately.

**Who is an admin:** anyone with a row in the `admin_users` table. There's no
in-app way to add one; an engineer adds them in SQL (runbook R10). **There
is one admin (the founder), added 2026-10-30.** Support staff need their own
rows before they can use the Money screen. Every admin action (retry, approve, decline) is permanently logged in
`admin_actions` and can't be edited or deleted.

### R1. A payout failed

1. Read the alert. It says the provider, amount, booking, reason, try number
   and next step.
2. Act on the reason:
   - **"The app's Stripe balance was too low to send it":** nothing to do. It
     retries automatically as client payments settle. If it keeps failing,
     check the Stripe balance and when funds become available.
   - **"The provider's Stripe account can't receive money yet":** the
     provider has been told. If it reaches the last try, contact them and ask
     them to finish setting up in *Payments & payouts*.
   - **"Stripe refused the transfer":** look up the transfer attempt in
     Stripe and find the real reason.
   - **"We couldn't tell whether Stripe sent it":** **don't retry yet.** In
     the Stripe Dashboard, look under Connect → the provider → Transfers for
     a transfer in the group `payout_<payout id>`. If it exists, the provider
     was paid: escalate to engineering to record it. If not, retry.
3. To retry: admin Money screen → the payout → **Try payment again now**. It
   goes out on the next 15-minute run.

### R2. A provider asks "where's my money?"

1. Find the booking. When did the appointment end, and what's their payout
   timing?
2. On their Payments screen, "Eligible for release from <date>" is when
   CERVICED sends it. It reaches their bank a few working days later, on
   Stripe's schedule.
3. If it's past the release date and still not sent, check in this order:
   1. Is a refund request open? It holds the payout, so ask them to resolve
      it.
   2. Did a payout attempt fail? Go to R1.
   3. Do they owe money? Part of it may have paid off a debt; they'll have
      had a notice.
   4. Is the booking cancelled or fully refunded? Then nothing is owed.
4. If it was sent but isn't in their bank, it's in their Stripe account.
   Point them to their Stripe Express dashboard, or to Stripe support if a
   bank payout failed.

### R3. A refund request was passed to CERVICED

1. Admin Money screen → refund requests → the request. Read the client's
   reason and message, and the provider's note.
2. Decide. If it's unclear, contact both sides first.
3. **Approve:** choose a full refund (returns CERVICED's fee too) or a
   partial amount (from the provider's share; CERVICED keeps its fee).
4. **Decline:** write the note the client will see. Be factual and polite;
   it's final in the app.
5. Either way, the provider's held payout (whatever is left of it) is
   released on the next run.

**There's no written refund policy for these decisions yet** (Part 6, item
10). Until there is, take any case you're unsure about to the founder rather
than deciding it alone. **Legal flag:** consumer-rights law may override a
provider's own policy, so the policy needs a solicitor's input.

### R4. A client says they were charged the wrong amount

1. Open the booking. Compare the service price, the fee and what Stripe says
   was captured.
2. The fee follows the tiers in section 1.3, and deposits are tiered on the
   full price. Most "wrong amount" reports turn out to be the fee or the
   deposit.
3. If it's genuinely wrong, the provider (or an admin, through a refund
   request) refunds the difference as a partial refund. Escalate to
   engineering: the server should never charge a wrong amount (Part 3,
   rule 1).

### R5. A provider owes money

1. Admin Money screen → money owed shows the provider and the amount.
2. Usually there's nothing to do. It comes out of their next payouts
   automatically, and they've been told.
3. If they haven't earned anything for a while, contact them. There's no
   in-app way for them to pay it back yet. Agree how it'll be settled, keep a
   record, and escalate to engineering to mark it settled in the ledger.
4. If it's large or the provider has left, treat it as a loss and decide on
   recovery outside the app.

### R6. A chargeback (bank dispute) arrives

1. Stripe emails the account owner, and the dispute appears in the Stripe
   Dashboard. The provider's share has already been taken back automatically
   (section 2.7).
2. In the Stripe Dashboard, respond **before the deadline Stripe shows**,
   with evidence: the booking details and confirmation, any messages, the
   cancellation/fee policy and the client's agreement to it, and proof the
   service happened.
3. If CERVICED wins, the money comes back to CERVICED. Paying the provider
   back is **manual** today: escalate to engineering.
4. If CERVICED loses, there's nothing more to do. A provider debt may now
   exist (R5).

### R7. A client disputes a late/no-show fee

Tell them it's handled by the provider: they dispute it from the booking, and
the provider refunds it or keeps it. CERVICED doesn't decide fee disputes. If
the client goes to their bank instead, it becomes a chargeback (R6).

### R8. A provider's bank payout failed (Stripe → bank)

The money is safe in their Stripe account. They need to fix their bank
details in their Stripe Express dashboard, and Stripe then pays it again.
There's nothing to do in CERVICED.

### R9. A provider can't take bookings: "not set up for payments"

Checkout refuses providers whose Stripe account can't receive payouts. Ask
them to open *Payments & payouts* and finish Stripe setup (identity and bank
details). Opening that screen refreshes their status.

### R10. Add or remove an admin (engineering)

```sql
-- add (their user id from auth.users)
insert into public.admin_users (user_id) values ('<user uuid>');
-- remove
delete from public.admin_users where user_id = '<user uuid>';
```

Keep the list short and review it monthly.

### Escalate to engineering immediately if

- Any rule in Part 3 looks broken.
- A payout failed with "couldn't tell whether Stripe sent it".
- There's money in Stripe that the app doesn't explain, such as an unknown
  refund or a transfer with no payout behind it.
- A chargeback was won and the provider needs paying back.
- A client or provider is shown an amount that disagrees with Stripe.

---

## Part 5 — Engineering reference

### 5.1 Architecture

- **Stripe Connect, "separate charges and transfers".** The client's payment
  is a PaymentIntent on **CERVICED's** Stripe account (`capture_method:
  manual`, captured in `finalize-payment-intent`). Provider shares are moved
  later with **Transfers** (`source_transaction` = the charge) to the
  provider's connected account.
- **Connected accounts:** Express-dashboard recipient accounts, country GB,
  created with Accounts v2 (`_shared/createConnectedAccount.ts`).
  `providers.stripe_payouts_enabled` gates checkout and tips.
- **Money is server-owned.** Every money action is a Supabase Edge Function
  or a `SECURITY DEFINER` database function. The app reaches them only
  through `src/services/databaseService.ts` (CLAUDE.md).
- **Idempotency everywhere.** Transfers use `payout_<id>` and
  `fee_payout_<id>` keys and transfer groups. Refunds and reversals are keyed
  on their source. Debts are unique on `source_key`.

### 5.2 Components

**Edge functions**

| Function | Called by | What it does |
|---|---|---|
| `create-payment-intent` | App (checkout) | Re-prices the batch, checks providers are payout-ready, enforces fee consent, creates the PaymentIntent |
| `finalize-payment-intent` | App | Captures; moves bookings `on_hold` → `pending`/`confirmed`; records the payment method |
| `stripe-webhook` | Stripe (signature-checked, no JWT) | Payment success, refunds, account status, transfers and reversals, disputes, bank payout failures |
| `release-payouts` | Cron, via `process_due_payouts()` (service role only) | Releases booking, fee and tip payouts; retries; fee pay-request retries and lapses; support alerts |
| `refund-payment` | Provider, admin, or the server (`refund_booking_async`) | Full and partial refunds; reconciles the payout |
| `apply-cancellation-refund` | App, after a client cancels | Applies the frozen cancellation policy and settles the provider directly |
| `booking-fee` | Provider app | Charges, refunds and cancels late/no-show fees; records a client paying a fee request |
| `booking-tip` | Client app | Starts and records a tip |
| `client-saved-cards` | Client app | Lists, adds and removes saved cards (blocks removal inside a fee window) |
| `create-connect-account` | Provider app | Creates the connected account and onboarding links; refreshes status |
| `stripe-connect-return` | Stripe onboarding redirect | Returns the provider to the app |
| `money-daily-summary` | Cron (service role only) | The 08:00 UTC email to support@ |
| `send-support-request` | App | Refund request emails, including the payout-on-hold notice |

**Scheduled jobs (pg_cron)**

| Job | Schedule (UTC) | What it does |
|---|---|---|
| `release-due-payouts` | Every 15 min | `process_due_payouts()` → `release-payouts`, only when something is due |
| `expire-cart-holds` | Every 5 min | Frees unpaid 10-minute slot holds |
| `expire-stale-pending-bookings` | Every 30 min | Cancels unaccepted bookings (after 48h, or once past the start time) and fully refunds them |
| `auto-complete-bookings` | Every 30 min | Marks finished bookings completed, which makes tipping available |
| `money-daily-summary` | 08:00 daily | Triggers the summary email when anything needs attention |

**Key database functions and triggers**

| Name | Kind | What it does |
|---|---|---|
| `prepare_checkout` | RPC | Validates the basket and places 10-minute holds |
| `apply_checkout_platform_fee` / `calculate_platform_fee` | Trigger / function | The fee in section 1.3 |
| `create_held_payout_on_finalize` | Trigger on `bookings` | Creates the held payout: `amount_paid − service_charge`, released at appointment end + hold days |
| `after_booking_move_held_payout` → `move_held_payout_with_booking` | Trigger on `bookings` | Shifts a held, unclaimed payout when the date or time changes |
| `set_payout_hold_days` | RPC | The provider's timing choice (1/3/7/14/30); lengthens payouts already waiting |
| `apply_provider_shortfalls` / `apply_fee_payout_shortfalls` | RPC (service role) | Claim the payout and deduct debts, using the shared `take_provider_shortfalls` |
| `release_provider_shortfalls` / `release_fee_payout_shortfalls` | RPC (service role) | Give deductions back when nothing was sent |
| `after_shortfall_notify_provider`, `after_payout_sent_notify_debt_recovered`, `after_fee_payout_sent_notify_debt_recovered` | Triggers | The two debt notices |
| `request_booking_refund`, `pass_refund_request_to_cerviced`, `close_refund_request_on_refund` | RPCs / trigger | The refund request flow |
| `admin_retry_payout`, `admin_decline_refund_request`, `admin_money_overview`, `is_cerviced_admin` | RPCs (admins) | The admin Money screen |
| `money_needing_attention`, `process_money_daily_summary` | Functions | The daily email's data, and its trigger |
| `refund_booking_async` | Function | A server-initiated full refund (provider cancel, expiry) |
| `provider_cancel_own_booking` | RPC | A provider declining or cancelling; fires the full refund |

**Stripe webhook events handled:**

- `payment_intent.succeeded` and `payment_intent.amount_capturable_updated`
  (bookings, fee payments, tips)
- `refund.created` and `refund.updated`
- `account.updated`
- `transfer.created`, `transfer.updated` and `transfer.reversed`
- `charge.dispute.created`, `charge.dispute.updated` and
  `charge.dispute.closed`
- `payout.failed`

Every other event is acknowledged and ignored. A handler error returns 500,
so Stripe retries.

### 5.3 Data model and states

| Table | Holds | Statuses |
|---|---|---|
| `checkout_batches` | One checkout: amount due, platform fee | Starts `prepared` |
| `bookings` (money columns) | `base_price`, `add_ons_total`, `deposit_amount`, `service_charge` (its share of the fee), `amount_paid`, `remaining_balance`, `payment_type` (`full`/`deposit`), `payment_intent_id`, `payment_method`, `refunded_amount`, `stripe_refund_id` | `payment_status`: `pending`, `deposit_paid`, `fully_paid`, `refund_pending`, `partially_refunded`, `refunded`, `failed` |
| `provider_payouts` | One per paid booking: `gross_amount`, `platform_fee`, `payout_amount`, `deducted_pence`, `release_after`, `release_claimed_at`, `attempt_count`, `failure_cause` | `held` → `transferred` / `cancelled` / `reversed` / `failed` |
| `booking_refunds` | A ledger of every refund (pence, and whether it has been applied to the payout) | — |
| `refund_requests` | Client requests | `with_provider` → `under_review` → `refunded` / `declined` (a decline needs a note) |
| `booking_fee_charges` | Late/no-show fees: `kind`, `amount_pence`, `stripe_fee_pence`, `payout_pence`, `deducted_pence`, `release_claimed_at`, dispute fields, pay-request fields | `status`: `processing`, `awaiting_client`, `succeeded`, `failed`, `refunded`. `payout_status`: `pending`, `held`, `transferred`, `cancelled`, `reversed`, `failed` |
| `fee_consent_records` / `fee_terms_versions` | Fee agreements, and the exact wording versions | — |
| `booking_tips` | Tips (£1–£500) | `pending`, `succeeded`, `failed`, `refunded`; payouts work like fee payouts |
| `provider_shortfalls` | Debts: `amount_pence`, `recovered_pence`, `source` (`refund`, `cancellation`, `fee_refund`, `bank_dispute`) | Open while `recovered_pence < amount_pence`; `settled_at` is set when paid off |
| `provider_shortfall_recoveries` | Each deduction: the debt plus exactly one of `payout_id` / `fee_charge_id` | — |
| `client_stripe_customers` | Client ↔ Stripe Customer (service role only) | — |
| `admin_users` / `admin_actions` | Admins, and an append-only log of their actions (`retry_payout`, `approve_refund`, `decline_refund_request`) | — |

### 5.4 Money notifications

| Type | To | When |
|---|---|---|
| `payment_success` | Client | Payment taken |
| `cancellation_settled` | Both | A late cancellation kept money |
| `refund_requested` / `refund_request_updated` | Provider / client | A refund request was opened / moved on |
| `fee_charged`, `fee_disputed`, `fee_dispute_resolved` | Client / provider | The late/no-show fee lifecycle |
| `fee_payment_requested`, `fee_paid_by_client`, `fee_payment_lapsed` | Client / provider | The card couldn't pay a fee |
| `payout_failed` | Provider | The first failed transfer caused by their Stripe account |
| `payout_debt_recorded`, `payout_debt_recovered` | Provider | A debt was recorded / paid down. **Always pushed**; the provider can't mute it |

Adding a notification type touches four places, including the database CHECK
constraint (auto-memory `new-notification-type-is-four-places`). Rebuild that
constraint **from the live list**, never from a copied one.

### 5.5 Configuration

| Setting | Where | Value now |
|---|---|---|
| `STRIPE_SECRET_KEY` | Edge Function secrets | **Test** key |
| `STRIPE_WEBHOOK_SECRET` | Edge Function secrets | The platform endpoint's secret |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Edge Function secrets | **Not set** (Part 6) |
| `RESEND_API_KEY` | Edge Function secrets | Sends email (alerts, summaries, receipts) |
| `service_role_key` | Supabase Vault | Lets cron call the functions |
| `STRIPE_CONNECT_PAYOUTS_ENABLED` | `src/constants/featureFlags.ts` | `true` (build-time) |
| `EXPO_PUBLIC_STRIPE_PAYMENTS_ENABLED` | App environment | Turns real Stripe checkout on in a build |
| Support address | `_shared/supportAlert.ts` | support@cerviced.co |

### 5.6 Changing money logic safely

1. **Branch** off `main`, one unit of work per branch (CLAUDE.md).
2. **Write the change and update this handbook** in the same PR.
3. **Test:** run `npx tsc --noEmit` and `npm test`. Put pure money maths in
   `supabase/functions/_shared/*Plan.ts`-style files so jest can test it.
4. **Review:** run the security review agent on anything that moves money,
   and the legal flagger on anything clients or providers read about money.
5. **Migrations:** check `supabase/MIGRATION_OWNER.md`. Number your
   migration above the live `max(version)` **and** above any unapplied
   migration in an open PR. Apply after review, verify with read-only
   queries, and record it in `MIGRATION_OWNER.md`.
6. **Deploy** edge functions from `main` after merging, and only after
   comparing the live version with `main`. Deploying an older branch can
   silently remove someone else's live change.
7. **Test in Stripe test mode** (`docs/STRIPE_TESTING.md`) through every path
   you touched.

---

## Part 6 — Known gaps, risks and launch blockers

Ranked, most important first.

| # | Gap | Impact | Next step |
|---|---|---|---|
| 1 | **Stripe is in test mode.** No real money has moved | Launch blocker | Switch one project to live keys (PRE-LAUNCH-TODO §24), after the items below |
| 2 | **Only one admin exists** (the founder, added 2026-10-30) | If they're away, nobody can retry payouts or answer refund requests | Add a second admin before launch (runbook R10) |
| 3 | **Legal flag:** holding provider money for up to 30 days isn't covered in the Terms, and Stripe may limit how long a platform can delay transfers | A possible breach of Stripe's terms or consumer law | Ask a solicitor and Stripe before the 14- and 30-day options are used with real money |
| 4 | **Rescheduling can dodge a late-cancel charge.** A client already inside the cancellation window can reschedule (a separate, often looser setting), then cancel the new date for a full refund | The provider loses money they're owed | Decided 25 October that the late-cancel rule still applies. Not built (PRE-LAUNCH-TODO §26) |
| 5 | **Events from providers' Stripe accounts may not arrive** (`STRIPE_CONNECT_WEBHOOK_SECRET` isn't set) | Bank payout failures and account status changes aren't pushed to the app. A provider's status only refreshes when they open Payments | Set up a Connect webhook endpoint in Stripe and add the secret |
| 6 | **Chargeback responses are manual**, and a won dispute isn't paid back to the provider automatically | A missed deadline loses money, and providers could be left out of pocket | Runbook R6 for now; automate later |
| 7 | **Refund requests have no deadline** for the provider | The client waits indefinitely and the provider's payout stays held | Decide a deadline, e.g. pass it to CERVICED automatically after a set number of days |
| 8 | **A provider can only pay back a debt from future earnings** | Debts from providers who stop working are never recovered | Decided 29 October; revisit if losses appear |
| 9 | **Tip chargebacks land on CERVICED**, and providers can't see their tips in the app (PR #159) | Small losses; provider confusion | Decide whether to take a lost tip dispute back from the provider; merge #159 |
| 10 | No written refund policy for admins deciding requests | Inconsistent decisions | Write one (Legal flag) |
| 11 | `users.stripe_customer_id` and its two guard triggers are unused | Dead schema | Drop them in a migration |
| 12 | Fee agreement records are kept six years, but nothing deletes them afterwards | Data retention | Add a purge job before 2032 |
| 13 | Edge functions aren't type-checked with Deno in CI | Type errors in money code can reach review | Add `deno check` to CI |

---

## Part 7 — Decision log

Why things are the way they are. Add a row whenever a money decision is made.

| Date (2026) | Decision | Why |
|---|---|---|
| 29 Sep | Stripe Connect with separate charges and transfers, and Express accounts | CERVICED holds the funds and controls payout timing |
| 29 Sep | Full refunds return CERVICED's fee; partial refunds keep it | Keeping the fee on a full refund was judged likely unlawful in the UK |
| 3 Oct | Client cancellations follow the provider's frozen policy: no charge, keep the deposit, or keep the full price | Predictable for both sides; a client is never charged more than they paid |
| 12–13 Oct | Late/no-show fees: in-app, 50% cap, 24-hour window, no CERVICED cut | Protects providers without CERVICED profiting from penalties |
| 13 Oct | Fee disputes go to the provider, not CERVICED | CERVICED doesn't judge fees |
| 18 Oct | Providers choose payout timing: 24 hours, or 3, 7, 14 or 30 days | Provider control; the 24-hour minimum protects against early refunds |
| 18 Oct | A payout is held while a refund request is open | A refund can then come out of money CERVICED still has |
| 18 Oct | A provider who can't cover a reversal owes it from future payouts | Keeps the books whole without charging the provider directly |
| 19 Oct | Fee agreement records are kept six years, including after account deletion | Evidence for disputes and claims |
| 19 Oct | A fee the card can't pay becomes a 7-day payment request, with up to 3 automatic retries on declines | A fair chance to pay before it lapses |
| 19 Oct | A saved card can't be removed until 24 hours after its appointment | It may be needed for a fee |
| 21 Oct | Failed payouts are retried after about 1, 2 and 4 days, then wait for a person | Most failures are temporary |
| 21 Oct | Tips are real money. The provider gets 100%, CERVICED pays the card fee, tipping closes 48 hours after the appointment, tips are non-refundable | A tip is a gift to the provider; CERVICED shouldn't profit from it or shrink it |
| 22 Oct | A moved booking moves its payout, earlier or later | Never pay before the work is done |
| 25 Oct | Rescheduling inside the cancellation window keeps the late-cancel rule | Closes a loophole (not built yet) |
| 29 Oct | Provider debts: tell them, then take it from future payouts, including fee payouts. No pay-back button | Simple, transparent, and uses what's already built |
| Standing | Off-app payments are never tracked | A liability boundary (Terms, "Deposits & Remaining Balances") |
| Standing | CERVICED's fee is never taken from the provider and never shown to them | Clear, simple provider earnings |

---

*This replaces the 3 October 2026 PDF snapshot and earlier versions of this
file. Testing steps are in `docs/STRIPE_TESTING.md`, legal gaps in
`LEGAL-COMPLIANCE-NOTES.md`, and launch tasks in `PRE-LAUNCH-TODO.md`.*
