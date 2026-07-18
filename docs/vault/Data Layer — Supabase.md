# Data Layer — Supabase

Postgres is the source of truth **and** a big part of the logic. If behaviour happens "automatically," it's probably here.

## Where the SQL lives
`supabase/*.sql`. `RUN_ALL_MIGRATIONS.sql` bundles most of them. Notable files:
- `phase1_schema.sql` — base tables.
- `availability_v2.sql` — availability windows/overrides + `enforce_booking_bookability` trigger → [[Availability & Slots]].
- `address_release_enforcement.sql` + `address_release_policy.sql` + `fix_address_release_on_confirm.sql` → [[Address Release]].
- `booking_flow_fixes.sql` — booking RLS insert policies + `on_booking_status_changed` trigger → [[Notifications]].
- `automation_jobs.sql` / `provider_reminder_jobs.sql` / `client_automation_jobs.sql` — **pg_cron** jobs (reminders, pending-warnings, auto-complete).
- `waitlist_schema.sql`, `provider_chat_schema.sql`, `notifications_full_matrix.sql`, `intake_forms_migration.sql`, `dev_reset_provider.sql`, `storage_policies.sql`, …

## The four enforcement tools (mental model)
- **RLS** — gates *rows* (who sees/edits which). e.g. a user sees only their bookings.
- **Triggers** — gate *columns & transitions*, run *side effects*. e.g. `enforce_booking_bookability`, `auto_release_address`, `on_booking_status_changed`.
- **Views** — mask *columns* conditionally. e.g. `client_bookings` (address gating).
- **pg_cron** — time-based jobs. e.g. 24h reminders, auto-complete, pending warnings.
- **RPCs (SECURITY DEFINER)** — authorized actions that bypass RLS deliberately. e.g. `dev_reset_provider()`. Needed because there's **no DELETE RLS policy** — client deletes are silent no-ops.

## Triggers on `bookings` (know these)
- `before_booking_enforce_bookability` (BEFORE INSERT/UPDATE) → [[Availability & Slots]]
- `trg_auto_release_address` (AFTER UPDATE status) → [[Address Release]]
- `on_booking_status_changed` (AFTER UPDATE status) → [[Notifications]]
- `on_booking_created` (AFTER INSERT) → new-booking side effects

## Edge Functions
`supabase/functions/`: `send-push-notification`, `send-email`, `confirm-email`. (Deno; they show TS errors in the app's tsconfig — expected.)

## Connections
[[Architecture Overview]] · [[Client vs Server Authority]] · [[Notifications]] · [[Availability & Slots]] · [[Address Release]]

## Open questions
- Which tables have UPDATE RLS, and do any allow editing money/status columns? #security #needs-verification
