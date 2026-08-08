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

## 10. Accessibility

No specific findings, but a consumer-facing app taking payments should be
checked against WCAG-equivalent accessibility expectations (and the European
Accessibility Act if the user base includes the EU) — screen reader labels,
contrast, tap-target sizing.

---

**Next step:** take this list to an actual lawyer rather than resolving items
by guessing at correct legal language. Items 1–3 look like the highest
priority (no Privacy Policy at all, health data handling, non-compliant
payment collection).
