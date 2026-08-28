# Supabase source of truth

This directory is being migrated from a collection of manually-run SQL files to a reproducible Supabase migration workflow.

## Current state

- `config.toml` is the standard Supabase CLI configuration for local/CI development.
- `remote-migrations/` is a **read-only archive** of the migration records currently stored in the linked production project. Regenerate it with `npm run export:remote-migrations`.
- `remote-schema-inventory.json` is a read-only live catalog snapshot. Regenerate it with `npm run export:remote-schema`.
- `fix_cart_checkout_slot_hold.sql` is a verified recovery of a production feature that was not present in either Git history or Supabase's migration history.
- `RUN_ALL_MIGRATIONS.sql` is legacy reference material. It is **not** a fresh-environment deployment source, and nothing new should be appended to it — new work goes in `migrations/` (rule 5 below).
- `migrations/` was reconciled against the live migration history on **2026-08-20**. Every one of the 121 migrations recorded in the linked project now has a matching file here, by exact `version_name`:
  - 5 existed only in the live DB and were recovered verbatim from `supabase_migrations.schema_migrations.statements`.
  - 12 were recorded live but had no file here (their content lived only as root-level `supabase/*.sql` under the older convention); copied in from the archive.
  - 21 were the same migration under a **different version number** than the one the remote recorded — the local files had hand-picked timestamps, while the MCP/CLI apply assigned its own. Renamed to the recorded version so the local chain's order matches what actually ran. This mismatch was the real reason the two records looked like independent histories.
- The 11 files `audit:migrations` still lists are applied to production but exist only as root-level `supabase/*.sql`. Verified live 2026-08-20 — production is complete; the gap is fresh-environment reproducibility only. Closing each one means capturing its **live** definition as a migration, not adopting the root file as-is: several predate the definition actually deployed.
- 4 files in `migrations/` have no row in the live migration history. All four were applied out-of-band via the SQL editor and carry a `PROVENANCE:` header naming the live object that proves they ran. Separately, `20260810180952_restore_legacy_booking_writes_pending_stripe.sql` was never applied and never will be — it is marked `SUPERSEDED — DO NOT APPLY`; the client-insert dependency it existed for was removed from the app on 2026-08-20 instead.

## Safety rules during the baseline recovery

1. Do not run `RUN_ALL_MIGRATIONS.sql` against any environment.
2. Do not run `supabase db push`, `supabase migration repair`, or `supabase db reset` against the linked project while no canonical numbered migration chain exists.
3. Before changing booking, availability, payment, reschedule, waitlist, notification, address, or provider-visibility logic, run `npm run verify:live-contract`.
4. `npm run audit:migrations` is expected to fail until the fresh-schema chain is complete. Do not silence or remove that failure. As of 2026-08-20 it measures coverage against the canonical `migrations/` chain rather than inclusion in the legacy `RUN_ALL_MIGRATIONS.sql` — under the old check every entry failed by construction, so the number could never improve. It now reads 12/23 covered, 11 outstanding, and those 11 are the actual remaining Phase 1 work.
5. Future migrations must be new, immutable, timestamped files under `supabase/migrations/`; never edit a previously deployed migration.

## Phase 1 exit criteria

The baseline is ready only when a clean Docker-backed Supabase environment can apply the canonical migration chain and pass the critical-contract check, then its catalog matches the linked-project inventory or has documented intentional differences.

See `docs/vault/CERVICED E2E Readiness Programme.md` for the execution tracker.
