# CERVICED — E2E Readiness Programme

This is the execution tracker for making every CERVICED system production-ready across both hats. A workstream is complete only when its app behaviour, server authority, failure paths, tests, observability and deployment path agree.

## Definition of ready

- The client and provider can complete their relevant journey on a fresh account.
- The API/RPC/database, not the UI, enforces permission, price, state and privacy rules.
- Concurrent requests and retries leave valid state.
- Every user-visible failure has a clear recovery path.
- In-app notification, push/email and realtime behaviour are verified where applicable.
- Unit, database/integration and E2E tests cover the happy path and the meaningful failures.
- Production telemetry can identify failures without exposing PII.
- A fresh environment can deploy the exact database and Edge Function version required.

## Delivery order

| Phase | Workstream | Why first | Exit evidence | Status |
|---|---|---|---|---|
| 1 | Platform baseline and migration truth | All later work is unsafe if fresh/staging/prod differ. | Clean migration manifest, fresh DB smoke run, deployed-schema comparison, baseline CI. | In audit |
| 2 | Booking, price, payment and availability authority | Financial and calendar integrity. | Server-owned create/price/status actions; conflict and payment tests. | In audit — release blocked |
| 3 | Reschedule, cancel, waitlist and notifications | Time-sensitive multi-party state changes. | State-machine tests, trigger/RPC verification, notification matrix. | Queued |
| 4 | Hats, provider onboarding, visibility and privacy | Identity and protected data boundaries. | Atomic hat lifecycle, live-provider gate, RLS/address test suite. | Queued |
| 5 | Remaining client/provider domains | Forms, chat, promotions, portfolios, discovery, account settings and Becca. | Domain-specific E2E journeys and error handling. | Queued |
| 6 | Quality gate and release control | Prevent regression after hardening. | CI gates, telemetry dashboard, staged rollout/rollback runbook. | Queued |

## Phase 1 — baseline audit

### Repository findings

- The project has runnable type-check, lint, Jest and vault-generation commands, but the tracked test suite is currently very small relative to the 65-screen/38-table surface.
- `RUN_ALL_MIGRATIONS.sql` explicitly labels a set of required follow-up SQL files as **not included**. This includes security/RLS hardening, reschedule completion, provider-status transition guard, notifications, cart hold fixes and others.
- The bundle says `fix_cart_checkout_slot_hold.sql` was applied live but is not present in the repository. That is a migration-history hole: a fresh environment cannot be guaranteed to match the documented live environment.
- Provider go-live requirements (`provider_schedule_gating.sql`, `require_services_for_go_live.sql`, and full address gating) are also documented as absent/incomplete in the all-in-one bundle.
- Waitlist holds are documented outside the bundle, so a fresh database may not reserve freed slots correctly.
- Some comments record prior live verification, but repository inspection cannot prove the currently deployed Supabase schema/functions/cron jobs still match. Production drift must be measured, not assumed.

### Phase 1 deliverables

1. Create a numbered, immutable migration manifest; each migration file is applied once through the Supabase migration workflow—not copied into an ever-growing runner.
2. Recover and commit the missing cart-slot-hold migration from production history, or reconstruct it from a verified schema diff and test it.
3. Make a fresh database build in CI and assert all required tables, functions, triggers, policies, constraints and cron jobs exist.
4. Add a production/staging drift checker that compares the deployed migration history and selected function/policy definitions to the repository manifest.
5. Add CI gates: type-check, lint, unit tests, database tests, migration smoke test, and generated-vault freshness check.
6. Publish a safe deploy/runbook: migration order, Edge Function deploy order, secrets required, validation queries, rollback procedure.

### Phase 1 acceptance tests

- A clean Supabase project can apply all migrations without manual follow-up steps.
- It contains the booking overlap constraint, cart holds, waitlist holds, address masking, reschedule RPCs, notification triggers, provider go-live gates and status guard.
- An unauthenticated caller cannot execute internal/admin SECURITY DEFINER routines.
- Staging and production schema versions match the manifest before feature work is released.

### Current blocker

Live production access has now established the extent of drift, but a disposable staging/fresh database is still required to prove a canonical migration chain can recreate that live contract. Repository-only work can prepare the manifest and tests, but must not claim deployed parity.

### Recovery evidence — 2026-08-08

- `npm run type-check` passes on the current working tree.
- `npm run audit:migrations` now makes migration drift a deliberate failing release gate. It remains blocked until every listed migration is incorporated into a reproducible runner.
- The original `fix_cart_checkout_slot_hold.sql` was absent from every reachable local Git commit **and is not recorded in the linked project's migration history**. It has now been recovered from the active linked project, using the exact live function definitions, columns, status constraint and cron job—not a hand-written approximation.
- The local Supabase CLI is installed and the active linked Cerviced project has 50 remote migrations but no local numbered migration history. The remote history also contains live changes not represented by the current local migration inventory, including group-booking atomic actions and the current provider-visibility gates. The next Phase 1 task is to promote this inventory into ordered, immutable Supabase migrations and verify the full schema against the linked project.
- Live catalog export on 2026-08-08 found **41 tables, 1 view, 285 functions, 33 triggers, 93 policies and 23 cron jobs**. The repository-generated database map claims 38 tables, 2 views, 81 functions, 28 triggers, 100 policies and 22 cron jobs. These are not cosmetic count differences: repository SQL must now be reconciled against the captured live inventory before it can be treated as a fresh-deployment source.
- The exact 53 migration records stored by the linked project are archived in `supabase/remote-migrations/`; the live catalog inventory is `supabase/remote-schema-inventory.json`. Both are read-only recovery snapshots, not a runnable replacement for a numbered migration chain.
- `npm run verify:live-contract` is the first repeatable production contract check. On 2026-08-08 it passed all 22 high-risk objects across booking enforcement, cart holds, waitlist holds, rescheduling, group booking actions, address masking, triggers and expiry cron jobs. It is read-only and should be run before every release that touches these domains.
- The standard pull-request quality workflow now runs type-check, lint and Jest. The migration-reproducibility audit is intentionally not a merge gate yet because it correctly fails until the numbered fresh-schema chain exists; it remains a release-blocking command and a visible Phase 1 exit condition.
- `supabase/config.toml` now establishes the standard CLI project structure. `supabase/README.md` documents the recovery boundary and explicitly prevents use of `RUN_ALL_MIGRATIONS.sql`, `db push`, migration repair or reset against the linked project until a canonical chain has been verified in a clean local/CI environment.

## Track template — use for every feature

```text
Feature:
Owner:
Client hat actions:
Provider hat actions:
Data read/write contract:
Server-authoritative rules:
State transitions:
Concurrency/retry behaviour:
Notifications/realtime/email/push:
Failure states and recovery:
Privacy/permission checks:
Unit tests:
Database/integration tests:
E2E scenarios:
Metrics/alerts:
Migration and rollback:
Ready sign-off:
```

## Immediate next workstream after baseline

**Phase 2: booking authority.** Replace client-trusted booking money/status decisions with a typed server action that derives service/add-on price, payment amount, provider auto-accept and valid booking status from canonical records. The cart remains responsible for presentation; the server becomes responsible for what is actually booked and charged.

Live discovery and target contract: [[Booking Authority Hardening]].

### Phase 2 audit evidence — 2026-08-09

- `npm run audit:live-rpc-exposure` now checks 86 classified `SECURITY DEFINER` execution contracts: 35 authenticated app actions, three intentional public discovery reads and 48 trigger/cron-only helpers.
- The current live audit fails 63 contracts (23 pass). It finds eleven priority app-RPC violations (`invite_next_waitlist_entry`, both hold-expiry helpers, address release/address setting, development client reset, saved-portfolio mutations, info-pack attachment, promotion audience retrieval and client beauty-profile retrieval), six additional app-grant drifts (provider claim, notification operations, chat update and public discovery reads), plus 46 internal helper functions exposed to API roles. The only passing anonymous path is the deliberately public, read-only discovery allow-list. The waitlist invitation helper is the urgent issue because it has no caller authorization and can create bookings/notifications with supplied monetary snapshot inputs. The catalog also found missing ownership validation in saved-portfolio, info-pack, promotion-audience and chat-preview RPC bodies.
- A staged remediation exists at `supabase/manual-apply/20260809_security_definer_execute_hardening.sql`. It must first be incorporated into the reconstructed canonical migration chain and exercised on staging; it has not been applied to the linked production project.
- The intentionally public, read-only `get_provider_busy_spans` RPC passes its explicit `anon` + `authenticated` execution contract.

Detailed record: [[Privileged RPC Execution Audit]].

### Chat authority evidence — 2026-08-09

- The conversation/message RLS policies currently allow any participant to write all mutable conversation fields and to insert messages with a chosen sender identity. The preview RPC also accepts arbitrary conversation IDs and sender types.
- The staged remedy narrows table policies and introduces sender/role-aware RPCs with a three-step client-compatible rollout. Detailed design: [[Chat Authority Hardening]].

### Client-profile privacy evidence — 2026-08-09

- The live `users` table contains medical/beauty information and has seven self-only RLS policies. That blocks direct cross-user reads correctly, but the app still mixes client-private, public and server-owned data in one self-updatable record; provider code also contains direct cross-user reads that the policy should deny. `npm run audit:live-profile-privacy` now guards the baseline presence of this RLS boundary.
- The migration path separates client-private data, self-only profile access, minimal public identity and booking-authorized provider detail access. Detailed design: [[Client Profile Privacy Audit]].

### Notification authority evidence — 2026-08-09

- The current policy `Providers can send notifications to clients` lets any provider insert notifications for arbitrary client IDs. It is a live cross-hat integrity/privacy issue and `npm run audit:live-notification-authority` currently fails on it.
- The safe replacement moves promotions, reminders, forms and packs to provider-owned server actions or booking lifecycle triggers before the broad policy is removed. Detailed design: [[Notification Authority Hardening]].

### Waitlist state authority evidence — 2026-08-09

- The live waitlist table grants `ALL` access to either participant, including server-managed status, queue position and expiry fields. Provider UI also has a direct “booked” mutation that does not create an appointment or hold.
- `npm run audit:live-waitlist-authority` now fails on this policy. The replacement makes all queue/offer/hold transitions server-owned. Detailed design: [[Waitlist State Authority Audit]].

### Aggregate release signal

- `npm run audit:live-authority` runs the privileged-RPC, profile-privacy, notification-recipient and waitlist-state checks against the linked project. It is intentionally failing today and must pass before any release affecting these authority boundaries. [[Live Authority Audit Summary]] records the current result.

### Provider lifecycle evidence — 2026-08-09

- Provider owners can currently write platform-managed visibility, verification, rating and claim fields. The intended go-live helper has valid criteria but is not tied to a table trigger, so direct writes bypass it.
- A staged lifecycle trigger enforces the criteria and protects server-managed fields. `npm run audit:live-provider-lifecycle` currently fails until it is tested and deployed. Detailed design: [[Provider Lifecycle Authority Audit]].

### Review authority evidence — 2026-08-09

- Client review policies currently validate only the caller user ID, not that the submitted provider/service derives from an owned completed booking; direct updates also leave rating/tip fields mutable.
- The staged completed-booking review RPC derives the target server-side, and `npm run audit:live-review-authority` remains failing until the app has switched and direct writes are removed. Detailed design: [[Review Authority Audit]].

### Booking/payment authority release gate — 2026-08-09

- `npm run audit:live-booking-authority` now makes the core Phase 2 exit test explicit: direct client booking/add-on writes must be removed, and server-owned checkout batches plus prepare/finalise RPCs must exist. It correctly fails on the current live contract.

### Intake-form authority evidence — 2026-08-09

- Intake-form table policies let providers and clients update fields outside their respective authority, including client answers and form state/definition. The app currently writes both paths directly.
- `npm run audit:live-intake-form-authority` fails until provider-send/client-submit RPCs replace those generic updates. Detailed design: [[Intake Form Authority Audit]].

### Authority release ordering

- The safe compatibility-first rollout, both-hat test matrix and rollback points are defined in [[Authority Hardening Deployment Runbook]]. No direct policy revocation should be deployed before its server replacement and compatible app version are live.
- The current linked schema also passes `npm run lint:live-db`. Pending migrations still require disposable staging execution; a remote lint cannot prove un-applied SQL works.

### Payment-boundary evidence — 2026-08-09

- The Stripe `create-payment-intent` Edge Function currently accepts a client-supplied pound amount. `finalize-payment-intent` tries to constrain partial capture using persisted booking `amount_paid`, but those fields are part of the currently client-controlled booking insert contract.
- The active payment-sheet code must therefore remain non-production until checkout batches, a server-calculated quote, server-owned finalisation and webhook reconciliation replace this flow. Detailed design and test gates: [[Payment Intent Authority Audit]].

Connections: [[CERVICED Complete Logic Map]] · [[Data Layer — Supabase]] · [[Client vs Server Authority]] · [[Booking Flow]]
