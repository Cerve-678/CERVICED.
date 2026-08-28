# Client Profile Privacy Audit

Live audit performed 2026-08-09.

## Current state

`public.users` contains public-ish identity fields alongside sensitive client data, including allergies, treatment history, medical notes and photography consent. The live table has RLS enabled with seven policies. They all self-scope by `auth.uid() = id`, which correctly prevents a provider or another client from directly selecting another user’s complete record.

The remaining problem is boundary design, not an absent policy: the app directly performs self-service reads/writes against this mixed table for profile setup, push tokens, preferences, saved items, business details and beauty/health information. The self-update policies are table-wide, so they do not protect server-owned columns such as `role` from a modified client. Provider-facing code still contains direct `users` reads for health/contact data; those calls should be denied by the self-only policy and must be replaced with the booking-scoped route.

`npm run audit:live-profile-privacy` confirms that RLS is enabled and at least one policy exists. It currently passes; it is a baseline guard, not proof that column authority or provider data minimisation is complete.

## Target data contract

| Data class | Access route |
|---|---|
| Public identity: display name, avatar | Minimal public profile view/RPC only |
| Own account/preferences/push token | Self-only `users` policies or typed self-service RPCs |
| Client health/beauty profile | Self-only private table/policies |
| Provider booking preparation | Booking-scoped, provider-authorized RPC returning only the consented required fields |
| Booking snapshot | Server-created immutable booking snapshot; never a broad live profile read |

## Migration plan

1. Create `client_private_details` keyed by user ID and migrate allergies, medical notes, treatment history and other sensitive beauty/health attributes from `users`.
2. Retain explicit self-only `users` select/insert/update policies. Prevent role, account-state and other server-owned fields from being client writable; use typed RPCs or a separate client-editable profile table where column-level control is required.
3. Expose `public_user_profiles` with only identity fields required by discovery/chat.
4. Replace provider direct `users` reads with an authorized booking-scoped function. The current `get_client_beauty_profile_for_provider` is a starting point but must enforce `authenticated` execution and define eligible booking states/time window.
5. Update app services so client profile forms write the self route, provider booking pages use the booking-scoped route, and chat/discovery use the minimal public route.
6. Backfill, compare counts/checksums, then remove sensitive columns and broad direct callers only after a staged rollout.

## Required evidence

- An anonymous caller cannot read a client profile.
- A client can read/write only their own allowed fields.
- A provider without an eligible booking receives no profile health data.
- A provider with an eligible booking receives only the approved fields, not email, push token, saved items, private preferences or unrelated account data.
- Existing onboarding, notifications, saved portfolio, provider registration and booking-detail flows continue to work.

Connections: [[Client Profile]] · [[Booking Flow]] · [[Chat Authority Hardening]] · [[CERVICED E2E Readiness Programme]]
