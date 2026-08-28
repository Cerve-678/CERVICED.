# Provider Lifecycle Authority Audit

Live audit performed 2026-08-09.

## Current defect

The `providers_owner_all` policy allows an owning provider to update their entire row. That row contains platform-managed fields: `has_gone_live`, `is_verified`, `is_featured`, rating/review aggregates, claim state/token metadata, scrape provenance, search vector and alert timestamps.

The live helper `check_and_set_provider_live(provider_id)` correctly requires an open availability entry, a service and a complete private address. However, it is not invoked by a providers lifecycle trigger, so a modified client can write `has_gone_live` directly and bypass the intended onboarding gate.

`npm run audit:live-provider-lifecycle` currently fails because no lifecycle trigger exists.

## Staged remedy

`enforce_provider_lifecycle()` validates app-originated provider writes. It freezes platform-managed columns and requires the same service/availability/address criteria when going live. The trigger allows trusted server/cron work where `auth.uid()` is absent.

Before deployment, exercise the migration in staging with both hats:

- Provider can edit profile, availability, services and booking policy fields.
- Incomplete provider cannot set `has_gone_live`.
- Complete provider can go live and appears in discovery.
- A provider cannot self-verify, feature itself, alter ratings/claim metadata or transfer ownership.
- Server-side ratings, scrape/claim workflows and scheduled alerts still update successfully.

Connections: [[Provider Onboarding]] · [[Provider Visibility]] · [[Availability & Slots]] · [[CERVICED E2E Readiness Programme]]
