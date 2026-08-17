# Supabase source of truth

This directory is being migrated from a collection of manually-run SQL files to a reproducible Supabase migration workflow.

## Current state

- `config.toml` is the standard Supabase CLI configuration for local/CI development.
- `remote-migrations/` is a **read-only archive** of the migration records currently stored in the linked production project. Regenerate it with `npm run export:remote-migrations`.
- `remote-schema-inventory.json` is a read-only live catalog snapshot. Regenerate it with `npm run export:remote-schema`.
- `fix_cart_checkout_slot_hold.sql` is a verified recovery of a production feature that was not present in either Git history or Supabase's migration history.
- `RUN_ALL_MIGRATIONS.sql` is legacy reference material. It is **not** a fresh-environment deployment source.

## Safety rules during the baseline recovery

1. Do not run `RUN_ALL_MIGRATIONS.sql` against any environment.
2. Do not run `supabase db push`, `supabase migration repair`, or `supabase db reset` against the linked project while no canonical numbered migration chain exists.
3. Before changing booking, availability, payment, reschedule, waitlist, notification, address, or provider-visibility logic, run `npm run verify:live-contract`.
4. `npm run audit:migrations` is expected to fail until the fresh-schema chain is complete. Do not silence or remove that failure.
5. Future migrations must be new, immutable, timestamped files under `supabase/migrations/`; never edit a previously deployed migration.

## Phase 1 exit criteria

The baseline is ready only when a clean Docker-backed Supabase environment can apply the canonical migration chain and pass the critical-contract check, then its catalog matches the linked-project inventory or has documented intentional differences.

See `docs/vault/CERVICED E2E Readiness Programme.md` for the execution tracker.
