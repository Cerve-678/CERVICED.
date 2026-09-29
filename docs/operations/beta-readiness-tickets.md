# CERVICED beta-readiness tickets (proposed backlog additions)

**What this is.** The detailed, agent-actionable version of the V1-beta plan.
Every entry below is written in the same ticket standard as
`docs/operations/agent-backlog.md` so the `cerviced-workforce-director` can pick
it up directly. These are the gaps the beta plan surfaced that are **not already
in the backlog** — see the mapping table so nothing gets worked twice.

**How to activate autonomous work on it.** Two options:

1. **Merge into the queue (recommended).** Move the Ready tickets below into
   `docs/operations/agent-backlog.md` under the matching priority heading, then
   run the standard director prompt. Do this on a dedicated branch off `main`,
   not on whatever feature branch is checked out — per the CLAUDE.md git rule.
2. **Point the director here explicitly.** Run the director prompt but swap the
   backlog path for `docs/operations/beta-readiness-tickets.md`. Faster, but the
   director's "single queue" assumption is looser, so prefer option 1 once
   you're happy with the tickets.

Director prompt (unchanged from `agent-workflow.md`):

```text
Use cerviced-workforce-director. Work through the highest-priority Ready ticket
in docs/operations/agent-backlog.md. Follow docs/operations/agent-workflow.md.
Do not perform an action listed under Autonomy limits. Leave one reviewable
result and update the backlog with evidence before moving to another ticket.
```

**Beta scope reminder.** V1 = closed beta, payment stays in test/mock mode. V2 =
real money. Every V2 item here is intentionally gated and mostly **Needs
decision** — an agent must stop before making a money/legal/production call
(see `agent-workflow.md` → Autonomy limits).

---

## Already covered — do not duplicate

| Beta-plan item | Existing ticket | State |
| --- | --- | --- |
| Refund logic + policy decisions | `BKG-002` | Needs decision |
| Waitlist failures visible/recoverable | `BKG-006` | Ready |
| Provider settings save as one coherent rule | `BKG-005` | Ready |
| Truthful payment/booking success states | `BKG-003` | Ready |
| Payment capture ↔ finalisation reconciliation | `BKG-001` | Research |
| Search/filter failure truthfulness | `BKG-004` | Ready |
| Two-hat booking regression matrix | `BKG-007` | Ready |
| Build-to-store release evidence | `REL-001` | Ready |

The tickets below are the remainder of the beta plan.

---

## P0 — V1 beta blockers

### ONB-001 — Stop first-time Apple sign-in from bypassing the signup flow

- **State:** Ready
- **Owner:** `cerviced-client-experience-lead`
- **Scenario:** A new user taps "Sign in with Apple" for the first time instead
  of going through the 5-step email signup.
- **Outcome required:** The user cannot land in the main app with an incomplete
  identity. Either their Apple-provided name/email is captured and the remaining
  required fields (phone, DOB) are collected before entering the app, or Apple
  sign-in is disabled for V1.
- **Acceptance criteria:** `handleAppleLogin` no longer creates a `users` row
  with null name/phone/DOB and drops straight in. `credential.fullName` /
  `credential.email` (only present on first authorisation) are persisted, not
  discarded. `RootNavigation` gains a "logged in but profile incomplete" route,
  or the Apple button is removed/hidden with a note. Regression test covers the
  first-time vs returning Apple path.
- **Validation:** Fresh Apple sign-in on a device, then confirm the `users` row
  has the required fields (or the button is gone). Returning sign-in still works.
- **Dependency:** None. Instagram/Google buttons are inert placeholders — out of
  scope unless the same pass hides them (see ONB-002).
- **Source:** `APP_STATE.md` Auth table; `LoginScreen.tsx` / `WelcomeScreen.tsx`
  `handleAppleLogin`.

### ONB-002 — Decide the fate of the inert social sign-in buttons for beta

- **State:** Needs decision
- **Owner:** `cerviced-client-experience-lead`
- **Decision needed:** Keep the "Coming soon" Instagram/Google buttons visible,
  or hide them for beta so testers don't hit dead ends.
- **Why blocked:** Purely a product/presentation call, not an engineering one.
  Once decided, the implementation is a few lines.
- **Source:** `WelcomeScreen.tsx`.

---

## P0 — V1 confidence (does it save, is it clear)

### QA-001 — Trace and document every fresh-account write (the data map)

- **State:** Ready
- **Owner:** `cerviced-platform-reliability-lead`
- **Scenario:** A brand-new account signs up, becomes a provider, goes live, and
  a second account books them.
- **Outcome required:** A single reference — `DATA_MAP.md` (or a section of
  `APP_STATE.md`) — that states, per screen/step, exactly which table and
  columns each action writes, so "did it save?" is answerable by reading one
  doc instead of guessing.
- **Acceptance criteria:** Trace in code (not by tapping) the writes for: each
  of the 5 signup steps → `users`; service add → `services`; portfolio upload →
  `portfolio_items`; weekly hours → `provider_availability`; address →
  `provider_private_details`; go-live gate flip on `has_gone_live`; booking →
  `bookings` + notification + `confirmation_email_queued_at`. Flag any write
  that is silently swallowed on failure (violates the error-handling rule).
- **Validation:** Cross-check each documented write against the live schema via
  the Supabase MCP tools (read-only). No live records changed.
- **Note:** The interactive device-walk half (tap through on a phone while
  querying the live DB) needs a human + assistant session and is out of an
  autonomous agent's scope — the simulator can't drive taps. This ticket is the
  code-trace + schema-confirm half only.
- **Source:** beta plan Track A.

### PERF-001 — Measure screen load time before fixing it

- **State:** Research
- **Owner:** `cerviced-discovery-lead` (Home / Explore / Search are the likely
  heavy screens); hand off to `cerviced-platform-reliability-lead` for any query
  batching or caching change.
- **Scenario:** A tester reports screens taking too long to load.
- **Outcome required:** Evidence of *where* the time goes on the 2–3 slowest
  screens — first Supabase query latency, over-fetching, render/re-render churn,
  or image loading — before any fix is written. Then a narrowly scoped
  implementation ticket per confirmed cause.
- **Acceptance criteria:** For each slow screen, a measured breakdown and a named
  cause. Check the CLAUDE.md scalability patterns as candidates: list queries
  have `.limit()` and no N+1 per-row awaits; context `value` props are
  `useMemo`'d; provider/portfolio images pass `fadeDuration={0}`; list keys are
  stable entity ids. Do not "fix" a pattern that isn't the measured bottleneck.
- **Validation:** A short before/after profile; regression on the golden path.
- **Source:** beta plan Track C.

---

## P1 — V1 provider correctness

### PRV-001 — Reconcile "Profile Health" with the real go-live gate

- **State:** Ready
- **Owner:** `cerviced-provider-management-lead`
- **Scenario:** A provider completes the "Profile Health" checklist but is still
  not published, with no explanation.
- **Outcome required:** The provider-facing readiness checklist agrees with the
  server gate (`check_and_set_provider_live()`: an open day + at least one
  service + a geocoded address with lat/lng), or is clearly relabelled so it
  doesn't read as a launch gate.
- **Acceptance criteria:** `ProviderMyProfileScreen`'s `profileReadiness` either
  adds the missing weekly-schedule item and points the location item at the
  geocoded address (not the vague `location_text`), or is renamed to a
  profile-*quality* checklist distinct from the go-live card on
  `ProviderHomeScreen`. The two must not silently disagree.
- **Validation:** A provider who completes the checklist can actually publish, or
  is told exactly why not.
- **Source:** `PRE-LAUNCH-TODO.md` §11b.

### PRV-002 — Make consultation-before-first-booking reachable

- **State:** Ready
- **Owner:** `cerviced-provider-management-lead`; hand off to
  `cerviced-booking-lead` to confirm the deposit/cancellation maths.
- **Scenario:** A provider wants to require a consultation before a new client's
  first booking. The whole client-facing flow is built and charges for it, but
  no screen turns the setting on.
- **Outcome required:** A provider can enable `consultation_required_new_clients`
  from the app (via `updateProviderContactDetails`, which already accepts the
  key), and the charged-consultation line item behaves correctly in the cart.
- **Acceptance criteria:** A toggle in `AboutYouScreen` beside the existing
  online-consultations toggle, writing the correct column (not the different
  `online_consultations_available`). Before shipping, confirm what a second
  charged service on a first-time booking does to the deposit and cancellation
  calculations — that interaction has never run.
- **Validation:** Toggle on → a first-time client sees the consultation flow and
  a correct cart total; toggle off → normal booking.
- **Source:** `PRE-LAUNCH-TODO.md` §16.

### QA-002 — Exercise the slot-hold and account-deletion golden paths

- **State:** Ready
- **Owner:** `cerviced-booking-lifecycle-qa` (slot hold);
  `cerviced-platform-reliability-lead` (account deletion cron)
- **Scenario:** Two designed-but-never-run paths: (a) a client backs out of
  checkout before paying; (b) an account requests deletion, reactivates, or is
  purged.
- **Outcome required:** Proof that (a) the held slot frees immediately on
  back-out and the TTL cron is a backstop, and (b) deletion → reactivation →
  cron purge behaves as designed.
- **Acceptance criteria:** A written runbook + evidence for each path. Deletion
  purge must be tested on a throwaway test account only — never a real one
  (Autonomy limit: no irreversible data change on real records).
- **Validation:** Watch queries before/after; lifecycle-QA review for the hold.
- **Source:** `PRE-LAUNCH-TODO.md` §7, §2.

---

## V2 — real money (gated; mostly Needs decision)

### PAY-001 — Enable and prove secure Stripe checkout end to end

- **State:** Needs decision
- **Owner:** `cerviced-release-lead` with `cerviced-booking-platform-integrity`
- **Scenario:** Switching from test/mock payment to live Stripe for real bookings.
- **Decision needed:** Authorisation to enable
  `EXPO_PUBLIC_STRIPE_PAYMENTS_ENABLED`, build native, and run a real Stripe
  test payment (reserve → authorise → finalise → capture → notifications + PDF
  receipt). Ships with the paired staged security migrations, not before.
- **Why blocked:** Crosses several Autonomy limits at once — production config,
  native build, payment settlement. An agent prepares and evidences; a human
  authorises the switch.
- **Dependency:** `BKG-002` (refunds) must not ship after this — real money must
  not flow without a refund path.
- **Source:** `PRE-LAUNCH-TODO.md` §1.

### PAY-002 — Retire the mock PaymentModal once Stripe is the only path

- **State:** Ready (blocked by PAY-001)
- **Owner:** `cerviced-booking-client-experience`
- **Scenario:** After live Stripe is on, the raw-card-field mock `PaymentModal`
  still coexists in `CartScreen.tsx`.
- **Outcome required:** One payment path, not two. The non-PCI mock is removed
  rather than left as coexisting dead code.
- **Acceptance criteria:** Mock modal and its raw card fields deleted; no path
  can reach it; tests updated. Do not start until PAY-001 is authorised and live.
- **Source:** CLAUDE.md payment rules; `APP_STATE.md` Payments table.

### LEG-001 — Record provider T&C acceptance meaningfully

- **State:** Needs decision
- **Owner:** `cerviced-provider-management-lead` with legal/product direction
- **Scenario:** Providers must have a stored, meaningful record that they
  accepted the current terms. Today 0 of 6 have one and the Policies tick box is
  decorative (local state only).
- **Decision needed:** Per-version acceptance vs once-ever; whether existing
  providers re-accept on next launch or a backfill is acceptable; whether the
  Policies re-affirmation should write a timestamp (making it real) or be removed
  (making it honest).
- **Why blocked:** A legal question — flag, don't draft (CLAUDE.md legal rule).
- **Source:** `PRE-LAUNCH-TODO.md` §17; `LEGAL-COMPLIANCE-NOTES.md`.

### LEG-002 — Add a Privacy Policy screen

- **State:** Needs decision
- **Owner:** `cerviced-client-experience-lead` with legal/product direction
- **Scenario:** There is no Privacy Policy screen in the app, and it handles
  health-adjacent data (patch tests, pregnancy flags, contraindications).
- **Decision needed:** The policy content itself (legal). Once content exists,
  building/linking the screen is a Ready engineering task.
- **Why blocked:** Content is a legal deliverable, not something to draft here.
- **Source:** `LEGAL-COMPLIANCE-NOTES.md`.

### LEG-003 — Resolve the age-verification questions

- **State:** Needs decision
- **Owner:** `cerviced-client-experience-lead` with legal/product direction
- **Scenario:** A 16+ gate exists at signup, but the open legal questions around
  age handling are unresolved and flagged.
- **Decision needed:** The legal answer on age handling before launch.
- **Why blocked:** Legal, not engineering.
- **Source:** `LEGAL-COMPLIANCE-NOTES.md`.

---

## Housekeeping (non-blocking)

### OPS-001 — Stop the vault generator forking its output; clear iCloud forks

- **State:** Ready
- **Owner:** `cerviced-platform-reliability-lead`
- **Scenario:** `~/Desktop` iCloud sync and `scripts/gen-vault.mjs` both fork
  numbered copies instead of overwriting, producing thousands of stray files.
- **Outcome required:** The generator overwrites in place (or writes atomically /
  outside the synced tree); existing numbered forks are removed after the fix.
- **Acceptance criteria:** Re-running the generator produces no new numbered
  siblings; the tracked source files are unaffected.
- **Source:** `PRE-LAUNCH-TODO.md` §8, §9.

### OPS-002 — Reconcile known migration drift

- **State:** Ready
- **Owner:** `cerviced-platform-reliability-lead`
- **Scenario:** `cancel_notice_hours()` doesn't exist live (an older draft of the
  function is running); the atomic weekly-schedule RPC is parked and unapplied.
- **Outcome required:** Tracked SQL matches the live schema, or the differences
  are documented as intentional. Use the migration-owner lock and number above
  the applied frontier — never apply around another session's lock.
- **Acceptance criteria:** Use `cerviced-migration-drift` to confirm; reproduce
  function bodies from `pg_get_functiondef()` so `SECURITY DEFINER` /
  `SET search_path` survive.
- **Source:** `PRE-LAUNCH-TODO.md` §15, §19.
