# Live Authority Audit Summary

Read-only production checks introduced 2026-08-09. Run all of them with:

```bash
npm run audit:live-authority
```

| Gate | Scope | Current live result |
|---|---|---|
| `audit:live-rpc-exposure` | 86 `SECURITY DEFINER` execution contracts | Fails: 63 contracts drift from their explicit grants |
| `audit:live-profile-privacy` | `users` RLS baseline | Passes: self-only RLS policies exist; data/column separation remains pending |
| `audit:live-notification-authority` | Provider-to-client notification targeting | Fails: arbitrary-client provider insert policy exists |
| `audit:live-waitlist-authority` | Server-owned waitlist state | Fails: participant-wide `ALL` policy exists |
| `audit:live-provider-lifecycle` | Go-live and server-managed provider fields | Fails: no lifecycle enforcement trigger exists |
| `audit:live-review-authority` | Review target/identity/rating integrity | Fails: direct review write policies remain and secure RPC is absent |
| `audit:live-booking-authority` | Server-priced booking, add-on and payment finalisation | Fails: direct client writes remain and checkout batch route is absent |
| `audit:live-intake-form-authority` | Provider/client form field and state ownership | Fails: broad mutable policies remain and secure send/submit RPCs are absent |

The aggregate command is intentionally failing. It becomes a release gate only after the staged migration chain, app changes and staging E2E tests have made every contract pass.

Connections: [[Privileged RPC Execution Audit]] · [[Client Profile Privacy Audit]] · [[Notification Authority Hardening]] · [[Waitlist State Authority Audit]] · [[CERVICED E2E Readiness Programme]]
