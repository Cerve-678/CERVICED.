# Privileged RPC Execution Audit

Live audit performed 2026-08-09 as part of Phase 2 booking authority work.

## Finding

PostgreSQL grants `EXECUTE` on newly created functions to `PUBLIC` by default. `SECURITY DEFINER` functions run with their owner’s privileges, so this default is unacceptable for helpers that mutate bookings, waitlists or notifications. A function’s internal `auth.uid()` check is valuable but is not a substitute for an explicit execute contract.

The live project has drifted from several local SQL files that attempted to grant `authenticated` only. In particular, the live `invite_next_waitlist_entry(...)` function is publicly callable and contains no caller authorization check. It can create a booking, reserve a waitlist hold and send a notification using caller-provided price/snapshot arguments.

The broader catalog also identified three authorization defects in user-facing RPCs: `append_saved_portfolio_item` trusts a caller-supplied user ID; `attach_info_pack_to_booking` does not verify that the caller owns either the booking's provider or the pack; and `get_promotion_audience` returns client user IDs without verifying ownership of the promotion. The staged remediation corrects both function logic and execute grants.

`update_conversation_last_message` is a fourth body-level defect: it accepts any conversation ID and caller-selected sender type, allowing a caller to alter inbox previews and unread counters outside their own conversation. The staged version requires the caller to be the client for `user` messages or the owning provider for `provider` messages.

## Verified priority contracts

| Function | Required execution roles | Reason |
|---|---|---|
| `invite_next_waitlist_entry` | none | Trigger/cron helper only; it creates bookings and notifications. |
| `expire_cart_holds` | none | Cron helper only. |
| `expire_waitlist_holds` | none | Cron helper only; it cascades to waitlist invitations. |
| `dev_reset_client` | `authenticated` | User-facing development reset; it self-scopes to `auth.uid()`. |
| `provider_release_booking_address` | `authenticated` | Provider-facing action; implementation verifies provider ownership. |
| `set_booking_client_address` | `authenticated` | Client-facing action; implementation verifies booking ownership. |
| `get_provider_busy_spans` | `anon`, `authenticated` | Intentionally public, read-only availability data for a publicly live provider. |
| `append_saved_portfolio_item` / `remove_saved_portfolio_item` | `authenticated` | Client-owned save list; function verifies its supplied user ID equals `auth.uid()`. |
| `attach_info_pack_to_booking` | `authenticated` | Provider action; function verifies ownership of both booking provider and pack. |
| `get_client_beauty_profile_for_provider` | `authenticated` | Sensitive profile fields limited to a provider with a booking relationship. |
| `get_promotion_audience` | `authenticated` | Client audience IDs limited to the owning provider. |
| `update_conversation_last_message` | `authenticated` | Chat preview/unread update limited to the actual client/provider sender. |

`PUBLIC` must not appear for any of these contracts. The effective SQL role `anon` is separate from `PUBLIC`, and the live project also has direct `anon` grants. The remediation therefore revokes both `PUBLIC` and the relevant API roles explicitly; the intended public availability RPC is then granted to `anon` and `authenticated` only.

## Remediation artifact and gate

- [Manual hardening SQL](/Users/naomicollins/Desktop/CERVICEDD/CERVICED./supabase/manual-apply/20260809_security_definer_execute_hardening.sql) supplies the required revocations/grants. It is deliberately **not deployable yet**: first restore a canonical numbered migration chain, then test it against a staging clone.
- `npm run audit:live-rpc-exposure` queries only the live catalog and fails when the priority contract drifts. Run it before/after a staged migration and before any booking/waitlist production change.

## Follow-up coverage

The live catalog has now separated 48 trigger/cron-only functions, 35 authenticated app RPCs and three intentionally public read RPCs. `npm run audit:live-rpc-exposure` treats all 86 as explicit contracts; only `get_provider_busy_spans`, `get_trending_providers` and `get_user_public_profiles` may be called anonymously. Every future `CREATE OR REPLACE FUNCTION` and signature change must include the appropriate `REVOKE`/`GRANT` in the same migration.

Connections: [[Booking Authority Hardening]] · [[Waitlist]] · [[Availability & Slots]] · [[CERVICED E2E Readiness Programme]]
