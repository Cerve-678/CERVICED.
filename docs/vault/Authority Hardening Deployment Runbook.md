# Authority Hardening Deployment Runbook

This runbook turns the current audit findings into a safe staged release. It is a plan for a reconstructed canonical migration chain and staging environment; do not apply `supabase/manual-apply/20260809_security_definer_execute_hardening.sql` directly to production while migration parity is unresolved.

## Preconditions

- Canonical numbered migrations reproduce the current required schema in a fresh staging project.
- A staging Stripe account, push credentials and test Client/Provider accounts exist.
- `npm run type-check`, `npm run lint`, `npm test -- --runInBand`, `npm run verify:live-contract` and `npm run audit:live-authority` are recorded before work starts.
- `npm run lint:live-db` passes against the linked current schema (verified 2026-08-09). This does **not** validate pending SQL; run the same lint plus migration smoke tests in a disposable staging database before deployment.
- DB backup/PITR and a release owner are confirmed.

## Release sequence

| Stage | Database/server release | App release | Evidence / rollback |
|---|---|---|---|
| 1 | Add backwards-compatible secured RPCs: review creation, chat read clear/preview, provider notification actions, waitlist offer/join, checkout prepare/finalise. Do not remove current paths. | None | RPC contract/database tests pass. Roll back by leaving unused RPCs. |
| 2 | Add server-generated records and dual-read observability for checkout batches, message sender identity, notification provenance and waitlist transitions. | App switches to new RPCs behind a feature flag for internal test users. | Compare old/new outcomes and telemetry. Disable flag to roll back app behaviour. |
| 3 | Enable new path for staging, then a small production cohort. | Client and Provider both use new checkout, chat, waitlist, notification and review paths. | E2E matrix passes; error/latency dashboards stable. Disable flag if not. |
| 4 | Remove unsafe direct policies: bookings/add-ons writes, review writes, broad notification insert, waitlist `ALL`, broad conversation/message writes. Revoke internal RPC execution grants. | Remove legacy fallback code in a later app version. | All authority audits pass. Rollback by restoring the exact prior policies only if the server path remains healthy. |
| 5 | Enforce provider lifecycle trigger and client-profile separation/column authority. | Release any profile-form / provider detail RPC changes. | Onboarding, visibility, profile and booking-detail journeys pass. |

## Non-negotiable ordering

- Never remove a direct client route before its server replacement is deployed and adopted by the active app version.
- Never turn on real Stripe payment before `prepare_checkout → create intent by batch → finalize_checkout → webhook reconciliation` works end to end.
- Never bulk-revoke `SECURITY DEFINER` execution without the classified allow-list; public discovery functions need explicit `anon` grants.
- Never deploy the provider lifecycle trigger without staging server/cron verification, because those paths update server-managed aggregates.

## Required test matrix

| Journey | Client | Provider | Failure/retry |
|---|---|---|---|
| Single booking, deposit/full payment | Selects service/add-ons/slot and pays server quote | Receives correct pending/confirmed booking | Intent retry, expired hold, webhook delay |
| Multi-service/cart | Receives atomic result or explicit line outcome | Availability correct across all providers | One unavailable line, duplicate submit |
| Reschedule/cancel/waitlist | Requests/claims/declines only own rows | Offers valid slot only | Concurrent claim, expiry, cancellation cascade |
| Chat | Sends own message/read receipt | Sends own message/read receipt | Cross-conversation/sender spoof denied |
| Promotion/reminder | Receives only eligible notification | Can target only server-calculated audience | Retry/deduplication/push failure |
| Review | Reviews own completed booking once | Rating aggregates correctly | Cross-booking/provider attempt denied |
| Onboarding/visibility | Can discover only live providers | Cannot self-verify or bypass go-live gates | Incomplete profile, schedule/service/address missing |

## Exit condition

All relevant authority audits pass in staging and production, the fresh-schema migration check passes, and the release matrix above has signed-off evidence for both hats.

Connections: [[CERVICED E2E Readiness Programme]] · [[Live Authority Audit Summary]] · [[Booking Authority Hardening]]
