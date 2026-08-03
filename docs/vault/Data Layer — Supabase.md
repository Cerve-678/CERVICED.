# Data Layer — Supabase

Postgres is the source of truth **and** a big part of the logic. If behaviour happens "automatically," it's probably here.

## Where the SQL lives
`supabase/*.sql`. `RUN_ALL_MIGRATIONS.sql` bundles most of them. Notable files:
- `phase1_schema.sql` — base tables.
- `availability_v2.sql` — availability windows/overrides + `enforce_booking_bookability` trigger → [[Availability & Slots]].
- `address_release_enforcement.sql` + `address_release_policy.sql` + `fix_address_release_on_confirm.sql` + `restrict_provider_full_address.sql` + `consolidate_address_release_notification*.sql` + `require_provider_address.sql` → [[Address Release]].
- `booking_flow_fixes.sql` — booking RLS insert policies + `on_booking_status_changed` trigger → [[Notifications]].
- `waitlist_holds.sql` — real time-boxed holds (not just notifications) → [[Waitlist]].
- `require_services_for_go_live.sql` / `provider_schedule_gating.sql` / `require_provider_address.sql` — the three `has_gone_live` conditions → [[Provider Onboarding & Go-Live]]. **Not in `RUN_ALL_MIGRATIONS.sql`** — a fresh environment has no go-live gating at all. #todo
- `fix_anon_executable_security_definer_functions.sql` — closes a gap where `REVOKE ALL … FROM public` doesn't actually block `anon` on this project (schema-level default privileges grant it separately) → [[Address Release]] for the full explanation.
- `automation_jobs.sql` / `provider_reminder_jobs.sql` / `client_automation_jobs.sql` — **pg_cron** jobs (reminders, pending-warnings, auto-complete).
- `provider_chat_schema.sql`, `notifications_full_matrix.sql`, `intake_forms_migration.sql`, `dev_reset_provider.sql`, `storage_policies.sql`, …

## The four enforcement tools (mental model)
- **RLS** — gates *rows* (who sees/edits which). e.g. a user sees only their bookings.
- **Triggers** — gate *columns & transitions*, run *side effects*. e.g. `enforce_booking_bookability`, `auto_release_address`, `on_booking_status_changed`.
- **Views** — mask *columns* conditionally. e.g. `client_bookings` (address gating).
- **pg_cron** — time-based jobs. e.g. 24h reminders, auto-complete, pending warnings.
- **RPCs (SECURITY DEFINER)** — authorized actions that bypass RLS deliberately. e.g. `dev_reset_provider()`. Needed because there's **no DELETE RLS policy** — client deletes are silent no-ops. Some (e.g. `notify_address_released()`) are meant to be **internal-only** — called only from other SECURITY DEFINER functions, never directly by a client. Watch out: `REVOKE ALL … FROM public` alone does **not** lock these down on this project — see [[Address Release]]'s security note.

## Triggers on `bookings` (know these)
- `before_booking_enforce_bookability` (BEFORE INSERT/UPDATE) → [[Availability & Slots]] — its overlap check now also treats `status = 'on_hold'` as occupied → [[Waitlist]]
- `trg_auto_release_address` (AFTER UPDATE status) → [[Address Release]]
- `trg_stamp_booking_address_snapshot` (BEFORE INSERT) — stamps the real address + coordinates onto the booking snapshot → [[Address Release]]
- `on_booking_status_changed` (AFTER UPDATE status) → [[Notifications]]
- `on_booking_created` (AFTER INSERT) → new-booking side effects

## Edge Functions
`supabase/functions/`: `send-push-notification`, `send-email`, `confirm-email`. (Deno; they show TS errors in the app's tsconfig — expected.)

## Connections
[[Architecture Overview]] · [[Client vs Server Authority]] · [[Notifications]] · [[Availability & Slots]] · [[Address Release]]

## Open questions
- Which tables have UPDATE RLS, and do any allow editing money/status columns? #security #needs-verification
