# CERVICED agent backlog

The workforce director uses this as the single queue for autonomous work. Do
not put half-formed ideas here: every Ready ticket must be small enough for one
owner to complete in a dedicated branch.

## P0 — launch integrity

### BKG-001 — Reconcile payment capture with booking finalisation

- **State:** Research
- **Owner:** `cerviced-booking-platform-integrity`
- **Scenario:** A client completes card authorisation; a network or capture
  failure occurs after the checkout is finalised.
- **Outcome required:** The app can determine whether the card was captured,
  whether booking rows became active and what each hat is told. No path may
  confidently say “not charged” when the result is unknown.
- **Acceptance criteria:** Define the idempotent state machine, recovery path,
  persistence/observability needs and user-facing states. Add a narrowly scoped
  implementation ticket only after the failure paths are evidenced.
- **Validation:** Repository trace plus a production-safe test plan; no live
  payment or capture without authorisation.
- **Dependency:** None for research. Any monetary compensation policy remains
  a separate decision.

### BKG-002 — Decide and implement refund outcomes

- **State:** Needs decision
- **Owner:** `cerviced-booking-lead` with legal/product direction
- **Scenario:** A paid appointment is cancelled, declined, rescheduled or
  removed after payment capture.
- **Decision needed:** Refund eligibility, amount, fees, provider-cancel
  outcome, who can initiate it and the customer wording.
- **Why blocked:** The app cannot safely invent money or legal policy.

### BKG-003 — Give payment and booking success screens truthful final states

- **State:** Ready
- **Owner:** `cerviced-booking-client-experience`
- **Scenario:** The same checkout contains auto-accepted and provider-pending
  appointments.
- **Outcome required:** The client sees each appointment’s real confirmed or
  awaiting-provider state, its next action and where it appears; the provider
  sees the matching booking.
- **Acceptance criteria:** No generic success copy that contradicts a status;
  clear error/retry state; no app-side duplicate notifications; regression
  tests cover mixed outcomes.
- **Validation:** Client/provider/database truth table and local checks.

## P1 — booking and discovery reliability

### BKG-004 — Make search failure and filter claims truthful

- **State:** Ready
- **Owner:** `cerviced-discovery-lead`
- **Scenario:** Search, price, suitability or availability lookup fails while
  a client filters providers.
- **Outcome required:** A failed lookup never presents as “no providers found”
  or a treatment-specific availability claim when only provider-level data was
  checked.
- **Acceptance criteria:** Distinct loading/error/empty states; retry; filter
  semantics documented and regression-tested; booking handoff remains valid.
- **Validation:** Failed secondary-fetch cases plus normal result path.

### BKG-005 — Make provider settings save as one coherent business rule

- **State:** Ready
- **Owner:** `cerviced-provider-management-lead`
- **Scenario:** A provider edits availability, deposit/payment preferences or
  policies and a partial/multi-device save occurs.
- **Outcome required:** The provider knows which state actually saved and a
  client never receives an accidental mixture of old/new booking rules.
- **Acceptance criteria:** Identify the canonical owner for each setting,
  preserve unrelated fields, surface partial failure and add targeted tests.
- **Validation:** Save/reload plus a client-facing read of the affected rule.

### BKG-006 — Make waitlist delivery failures visible and recoverable

- **State:** Ready
- **Owner:** `cerviced-booking-platform-integrity`
- **Scenario:** A cancellation opens a slot for a matching waitlist entry but
  the invitation, notification or hold creation fails.
- **Outcome required:** Operations can distinguish “no eligible entry” from a
  failed invite; a client does not silently lose their place.
- **Acceptance criteria:** Remove/surface swallowed failure, define safe retry
  behaviour and create an end-to-end test runbook for invite, claim, decline
  and expiry.
- **Validation:** Database-level test plan and lifecycle-QA review.

### BKG-007 — Establish a two-hat booking regression matrix

- **State:** Ready
- **Owner:** `cerviced-booking-lifecycle-qa`
- **Scenario:** A client and provider complete every lifecycle action across
  booking types and error paths.
- **Outcome required:** A maintained matrix ties each scenario to expected
  client UI, provider UI, database/slot state, notification and evidence.
- **Acceptance criteria:** Cover the branches listed in the booking QA role;
  identify which tests can run locally and which require authorised accounts.
- **Validation:** Matrix reviewed by `cerviced-booking-lead`.

## P1 — release process

### REL-001 — Formalise build-to-store release evidence

- **State:** Ready
- **Owner:** `cerviced-release-lead`
- **Scenario:** A production iOS build finishes or errors.
- **Outcome required:** The user can tell whether it built, was submitted to
  App Store Connect or was released; failures link to the exact fix.
- **Acceptance criteria:** A documented evidence checklist, build-log
  diagnostic flow and auto-submit instructions without automatic publishing.
- **Validation:** Inspect the most recent EAS build state; do not submit one.
