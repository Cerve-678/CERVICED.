# Legal & Compliance Notes — NOT LEGAL ADVICE

Written by Claude at the user's request, from reading the codebase. This is a
punch-list of gaps and risk areas to raise with an actual solicitor/lawyer
before launch or at the next review — not a legal opinion, not a substitute
for one, and not something to treat as "handled" just because it's written
down. Update this file as items get resolved or reviewed; don't let it go
stale into a false sense of completeness.

Business context as understood from the code: **Cerviced Ltd**, UK-based
(£ pricing), a two-sided marketplace app connecting clients with independent
beauty/wellness providers. Some data collected is health-adjacent.

---

## 1. Missing Privacy Policy

There's a Terms & Conditions screen (`src/screens/TermsScreen.tsx`) but no
Privacy Policy screen anywhere in `src/screens/`. A UK-facing app processing
personal data — and especially the health-adjacent data below — needs a
Privacy Policy covering: what's collected, lawful basis for processing,
retention periods, which third parties process data on the app's behalf
(Supabase, Sentry, push notification delivery, any AI chat provider, payment
processor once real payments exist), international data transfers if any of
those process outside the UK/EEA, and how a user exercises access/erasure
rights. UK GDPR requires this regardless of app size.

## 2. Health-adjacent data may be "special category" data

The `services` schema includes `is_pregnancy_safe`, `patch_test_required`,
`contraindications`, `min_age`, and `aftercare_notes`, and client intake forms
likely capture some of this about the *client* (allergies, pregnancy status,
skin conditions). Under UK GDPR Article 9, health data is a special category
requiring an explicit lawful basis (typically explicit consent) beyond what's
needed for ordinary personal data. Worth confirming with counsel whether the
current intake-form consent flow meets that bar, and whether it needs its own
explicit opt-in separate from general Terms acceptance.

**2026-08-17 update**: added a checkout-time acknowledgement for
`patch_test_required`/`is_pregnancy_safe` (see
`supabase/migrations/20260817085443_safety_acknowledgement_checkout.sql` —
`bookings.safety_ack_required`/`safety_ack_at`, enforced server-side in
`prepare_checkout` and `provider_create_manual_booking`, surfaced client-side
folded into `CartScreen.tsx`'s existing Terms checkbox and as its own
checkbox on the provider's `AddBookingScreen.tsx`). Deliberately framed as
relaying the *provider's* stated requirement, not a CERVICED safety
determination — not a hard block on booking. This makes the gap above
*more* pressing, not less: there is now a new client-identity-linked record
(timestamp + which flags were active) with **no corresponding Terms/Privacy
language describing it exists yet** — same missing-Privacy-Policy problem as
item 1, now with a concretely-shipped feature sitting on top of it. `min_age`
was deliberately excluded from this pass (see the migration's own comment) —
it can be a statutory minimum (item 5) and needs a DOB-verified mechanism,
not a soft acknowledgement checkbox; folding it into this same pattern would
be the wrong legal posture.

**2026-08-21 correction — the 2026-08-17 update above overstated what is
live.** The safety-acknowledgement gate it describes was only ever in
`prepare_checkout`, which is reachable only when `USE_STRIPE_PAYMENTS` is on
— and `EXPO_PUBLIC_STRIPE_PAYMENTS_ENABLED` is set in no `.env` file and no
`eas.json` profile, so it is **off in every build**. Real bookings went
through `hold_cart_booking_slots` -> `claim_cart_booking_slots`, neither of
which referenced `safety_ack_required`/`safety_ack_at` at all. Three live
bookings exist against a service the provider flagged **not pregnancy-safe**
with `safety_ack_required = false` and `safety_ack_at` NULL: nothing rejected
them and nothing recorded that anyone was shown the flag. All affected rows
are the developer's own test accounts (confirmed 2026-08-21), so no real
person's record is involved — but the enforcement described above should not
have been read as live, and this file said it was.

Separately, `bookings.policy_accepted_at` — the record that a client agreed
to CERVICED's Terms and the provider's cancellation policy — was NULL on 45
of 59 live bookings, carried the *previous* checkout attempt's timestamp on a
retry, and on 4 rows sat NULL beside a populated `policy_snapshot` (which
reads as "consent on file" to anything checking only for a snapshot). Cause:
the app stamped the live cart items but booked from a snapshot captured
before the stamp.

Both are closed by
`supabase/migrations/20260823180000_consent_recorded_before_payment.sql`,
which moves both records server-side into `hold_cart_booking_slots` — the
last step before the client is charged. The database now derives *whether* an
acknowledgement is required from the service row rather than trusting the
payload, refuses the batch without the client's acknowledgement, and stamps
*when* consent happened from its own clock. A client-supplied consent
timestamp is no longer representable.

**Still open**: `prepare_checkout` (Stripe path) records the safety
acknowledgement but still writes no `policy_accepted_at`. Harmless while that
path is unreachable; it must be closed before `USE_STRIPE_PAYMENTS` is turned
on, or the consent-record gap returns on the path that handles real money.

**Not done, on purpose**: the pre-fix rows were left as they are. Backfilling
a `policy_accepted_at` would assert that a client agreed at a time nobody can
evidence — fabricating a consent record, which is a worse position than an
honest NULL. Left for a lawyer to direct if it ever matters.

**2026-08-18 update — three non-agreeing definitions of "unset"**: Becca can
now report these flags conversationally (`provider.safety` in
`src/services/becca/capabilities/client.ts`). Building it surfaced that the
codebase has **three different conventions for what an unset
`is_pregnancy_safe` means**, with no single source of truth:

| Where | Test | Unset (`null`) treated as |
|---|---|---|
| `ProviderProfileScreen.tsx` (display) | `!service.isPregnancySafe` | **Not safe** — renders the warning |
| `databaseService.ts` (checkout gate) | `is_pregnancy_safe !== false` | **Safe** — no acknowledgement required |
| Becca `provider.safety` | `=== false` / `== null` handled separately | **Unknown** — states it as not recorded |

These disagree on the most common real-world state, since the field is opt-in
and a provider may simply never touch it. The checkout gate is the one worth
scrutiny: it treats "never filled in" as safe and collects no acknowledgement,
which is the most permissive of the three and the only one attached to a
booking record. Becca's posture (a blank is neither a yes nor a no — ask the
provider) was chosen deliberately after a legal-flagger review flagged that
omitting an unset field from an otherwise-populated safety answer reads as
reassurance-by-silence. **Worth deciding one convention and applying it in all
three places** — not something to resolve unilaterally, since "unset = safe"
vs "unset = unknown" is a liability posture, not a coding-style choice.

Also from that review: Becca relays provider-authored `contraindications` free
text verbatim, exactly as `ProviderProfileScreen.tsx` already does. Not a new
exposure channel, but an AI assistant answering a direct question carries
different implied authority than a profile page a user reads passively — worth
raising with counsel if the assistant's framing is ever questioned.

## 3. Payment flow is not production-ready

`CartScreen.tsx`'s `PaymentModal` collects raw card number/expiry/CVC directly
into component state via a custom form — this is not a PCI-DSS-compliant flow
(card data should be tokenized by a processor like Stripe/Adyen and never
touch app-controlled state in the clear). Per existing project notes, no real
payment provider is wired up yet and tips record an amount with no money
actually moving. Before this handles real transactions: integrate a proper
processor, remove raw card-field collection from app state entirely, and make
sure marketing/T&Cs copy doesn't imply a payment guarantee that isn't real yet.

## 4. Deposit / remaining-balance boundary (addressed, keep it that way)

Terms & Conditions now states (`TermsScreen.tsx`, "Deposits & Remaining
Balances") that any balance remaining after a deposit is settled directly
between client and provider — Cerviced doesn't collect, verify, or mediate
it. The in-app "mark balance collected" feature was removed for the same
reason (see `src/screens/ProviderBookingDetailScreen.tsx` history). Keep this
consistent: don't reintroduce any UI/notification that implies the app
verifies or guarantees that payment.

Two provider reminders that breached exactly this were removed on
2026-08-21: **"Payment Not Collected"** (fired off `payment_status`, which
isn't evidence of whether anyone was actually paid, and offered a "Collect
Payment" action) and **"Appointment Not Started"** (asserted an appointment
hadn't happened because a button hadn't been tapped — a claim the app would
have had to defend in any client/provider dispute). See
`docs/vault/Notifications.md`. The generalised rule: a notification must not
assert a fact the app has no way to verify.

## 5. Age verification and cosmetic-treatment minimum ages

Per `APP_STATE.md`, sign-up enforces 16+ generally. Two separate legal questions
worth checking: (a) whether 16 is an appropriate age for entering a paid
contract via the app under UK law, and (b) whether any service categories
offered (fillers, botulinum toxin / "Botox"-type treatments, tattooing,
piercing) are subject to their own statutory minimum age — e.g. the UK's
Botulinum Toxin and Cosmetic Fillers (Children) Act 2021 restricts those
specific treatments for under-18s regardless of general sign-up age. If any
such categories exist or could be added by providers, age-gating needs to be
enforced per-service, not just at account creation.

## 6. Cancellation/refund policy delegation

T&Cs state cancellation/refund policy is "set by individual providers" with
Cerviced disclaiming liability for disputes. Reasonable as a marketplace
model, but confirm this holds up against UK consumer protection law (Consumer
Rights Act 2015, Consumer Contracts Regulations 2013) — some of those
protections attach to the transaction regardless of what a platform's T&Cs
say, particularly if bookings could be characterized as distance/off-premises
contracts.

**Added 2026-08-20 — the delegation is currently to nothing.** Verified against
the live functions: `cancel_own_booking()` only sets `status='cancelled'`; it
never touches `payment_status`, `amount_paid`, or Stripe, and no refund code
exists anywhere in the app. `refundPolicyNote` is free text on the provider's
profile enforced by nothing, and all 4 live providers had it blank on that date.
So a paying client who cancels currently gets nothing back, no screen says so,
and the provider has no in-app way to issue a refund even if they wanted to.
Deposits are non-refundable purely by omission. This becomes live exposure the
moment Stripe is enabled — see `PRE-LAUNCH-TODO.md` item 1b for the engineering
work and the product/legal decisions it's blocked on.

## 7. Reviews and user-generated content

T&Cs already prohibit "false reviews" and fraudulent activity (good). Worth
confirming there's a moderation/reporting path for defamatory or abusive
reviews, since marketplace platforms carry some responsibility for
user-generated content moderation under UK online safety expectations.

## 8. Marketing vs transactional notifications

Push notifications (booking confirmations, reminders, promotions) should keep
transactional and marketing consent separate under PECR (Privacy and
Electronic Communications Regulations) — a user should be able to opt out of
promotional pushes without losing booking-critical ones. Worth confirming the
notification preference settings actually separate these.

## 9. Account deletion

Per existing project notes, there's a per-hat deletion flow with a 30-day
grace period and reactivation-on-login, with transactions surviving
pseudonymised. This is a reasonable pattern for GDPR "right to erasure" vs.
legitimate record-keeping (tax/accounting) — flag to counsel for sign-off
rather than re-litigating, since the mechanism already exists.

## 10. Provider Terms acceptance has no versioning/re-consent

As of 2026-08-10, providers must check "I agree to the Terms & Conditions"
during first-time profile setup (`InfoRegScreen.tsx`) before they can publish
— `providers.terms_accepted_at` records when. This closes the previous gap
where nothing recorded a provider ever having seen/agreed to the Terms. Two
things worth flagging to counsel: (a) it's a single undifferentiated checkbox
covering every clause in `TermsScreen.tsx`, including the deposit/remaining-
balance liability language in item 4 above and the age-related questions in
item 5 — no separate opt-in for those; (b) it's asked once, at first publish,
and never again — if the Terms content is later revised, existing providers'
`terms_accepted_at` still points at whatever version they originally saw,
with no re-prompt and no record of *which* version they accepted. Fine for a
v1, but not durable evidence of "accepted the current Terms" once the
document changes.

As of 2026-08-10, clients now have a persisted counterpart too, but scoped
narrower: `bookings.policy_accepted_at`/`policy_snapshot` record when a
client agreed to the specific PROVIDER's cancellation/booking policy at
checkout (`BookingSheet.tsx`/`MultiBookingSheet.tsx` — the general Cerviced
Terms & Conditions checkbox on `CartScreen.tsx`'s cart summary is a separate,
still-deferred item, deliberately left untouched; that one remains local UI
state only, never persisted). Same versioning caveat as the provider side:
the snapshot freezes the policy text at booking time (by design — so a
provider can't retroactively change what a client agreed to), but there's no
equivalent record for the general Terms & Conditions on either side. A
`policy`-type intake-form question (`ProviderIntakeFormScreen.tsx`) also now
lets a provider send a client the same policy as a document to read and
sign via the existing typed-name-signature flow — this is a second,
independent acceptance record (a signed intake-form answer/signature) for
providers who want a more explicit paper trail than the checkout checkbox
alone; it wasn't reconciled or deduplicated against `policy_accepted_at`,
since they serve different purposes (implicit checkout consent vs. an
explicit, provider-initiated signed document) — worth flagging to counsel
whether both are needed or whether that's confusing to have two records of
"agreed to the policy" that don't reference each other.

## 11. Accessibility

No specific findings, but a consumer-facing app taking payments should be
checked against WCAG-equivalent accessibility expectations (and the European
Accessibility Act if the user base includes the EU) — screen reader labels,
contrast, tap-target sizing.

## 12. Unanswered requests have no expiry, and no stated deadline

**Raised 2026-08-21.** Verified live: a `booking_reschedule_requests` row has
no deadline and no expiry job — it stays `pending` (waiting on the provider) or
`provider_responded` (waiting on the client) indefinitely. See
[BOOKINGS.md](BOOKINGS.md) §7a for the engineering detail and the rule agreed
but not yet built.

Why it belongs on this list rather than being purely an engineering fix:

- **Nothing in the T&Cs says how long a provider has to respond to anything** —
  not a reschedule request, not a booking request. The 48-hour auto-cancel of
  an unaccepted booking request is enforced in a cron job (`process_expire_
  stale_pending_bookings()`) that no user-facing document mentions. A deadline
  the app enforces but never states is the wrong way round: users should be
  told the rule before it's applied to them, and it should be the same number
  in both places.
- **Provider silence currently penalises the client.** While a request is open
  the client cannot submit another one, the appointment auto-completes on
  schedule regardless (recorded as attended), and the provider's own notice
  window can lapse in the meantime — so a client who asked in good time can end
  up with no reschedule, no refund path, and a "completed" appointment they
  didn't attend. If the intended answer is that the client gets a no-penalty
  cancellation when a provider never responds, that's a consumer-facing promise
  and needs stating in the T&Cs, not just coding.
- **Wording of the expiry notice matters.** The intended message is that the
  provider was unable to meet the request. That's a statement the platform
  makes about a provider, generated automatically from silence — worth a
  lawyer's eye on the phrasing so it reads as "this request expired without a
  response" rather than an assertion about the provider's conduct.
- Interacts with §6 (cancellation/refund delegation): if expiry is going to
  entitle a client to anything, that entitlement lands in the same gap where
  no refund mechanism currently exists.

Decisions needed from you (not to be guessed at): the response deadline itself,
whether it varies per provider, whether expiry entitles the client to a
no-penalty cancellation or refund, and the exact notice wording.

## 13. The contact addresses in the legal copy don't exist (2026-08-24)

A real support address now exists — `support@cerviced.co` — and the app's
support links point at it. The legal copy does not:

- `src/screens/shared/AboutScreen.tsx:95,97` — the Privacy Policy text names
  `privacy@cerviced.app` twice: once as the address to request the list of
  third-party processors, once as the address for access/correction/erasure
  requests and data exports.
- `src/screens/shared/TermsScreen.tsx:54` — the Terms name
  `legal@cerviced.app` for questions about the terms.

`cerviced.app` is not a domain this project controls; the real one is
`cerviced.co`. So both addresses are unreachable. This was left as-is
deliberately on 2026-08-24 rather than silently rewritten, because it's legal
copy — but it should not stay this way:

- A Privacy Policy that names an unreachable contact for data-subject access
  and erasure requests means those requests cannot actually be made, which is
  a UK GDPR problem in itself, on top of §1's missing Privacy Policy screen.
- The decision needed is only whether to point both at `support@cerviced.co`
  (one working inbox) or to create real `privacy@` and `legal@` aliases on
  `cerviced.co`. Either is fine; leaving dead addresses is not.

Separately (not legal, but the same wrong-domain root cause): the booking
receipt in `src/screens/provider/ProviderBookingDetailScreen.tsx:210,1853`
prints `cerviced.app` as the footer on both the HTML and in-app receipt.

---

**Next step:** take this list to an actual lawyer rather than resolving items
by guessing at correct legal language. Items 1–3 look like the highest
priority (no Privacy Policy at all, health data handling, non-compliant
payment collection).
