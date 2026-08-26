# Migration ownership

**One session owns migrations at a time. Check this file before writing or
applying one.**

This repo is regularly open in two Claude sessions at once, against a single
live Supabase project. That combination produces a failure no amount of file
discipline catches, because the ordering is decided by what *someone else
applied while you weren't looking*:

- `20260826110100_consent_recorded_before_payment.sql` has been renumbered
  **twice**. First it was overtaken by the emergency-request set, which
  redefines the same function — in that order the consent gate would have been
  silently reverted, no error, no conflict. Then it was overtaken again by the
  reschedule-expiry work, leaving it below the applied frontier where
  `supabase migration up` skips it and a fresh replay diverges from production.

Neither was a git problem. Both sessions wrote correct SQL.

---

## Current owner

```
OWNER:  (none)
SINCE:  —
SCOPE:  —
```

Claim it by editing the block above — your session name/purpose, the date, and
what you intend to change. Release it by setting it back to `(none)` when the
work is **applied**, not when the file is written. An unapplied migration is
exactly what goes stale.

If `SINCE` is more than a day old, assume the lock was abandoned rather than
held, but say so before taking it.

## If you don't hold it

Write the SQL if you must — but **do not apply it**, and do not assume its
filename timestamp will still be correct by the time it runs. Leave it for the
owner, or take the lock.

## If you do hold it

1. **Number above the live frontier, not off the clock.** The wall clock is not
   the constraint; what production has already applied is:

   ```sql
   SELECT max(version) FROM supabase_migrations.schema_migrations;
   ```

   A filename below that is skipped by `migration up` and replays out of order
   on a fresh database.

2. **Check nothing applied since touches what you touch.** Function
   redefinitions are the dangerous case, because `CREATE OR REPLACE` succeeds
   silently against a newer version:

   ```
   grep -l '<function_name>' supabase/migrations/*.sql
   ```

   If a newer file redefines it, rebuild yours on top of that one and say so in
   the header.

3. **Apply it, then release the lock.** Verify against the live schema
   afterwards — `pg_get_functiondef`, `information_schema.columns` — rather than
   trusting that the file ran.

4. Never `supabase db push` on this project (see the auto-memory
   `anon-execute-hardening-applied-2026-08-20`).

## Queue

Written but **not applied**, in the order they must run:

| Version | File | Notes |
|---|---|---|
| 20260826110000 | `atomic_provider_weekly_schedule` | **DELIBERATELY PARKED, not a backlog item** — its own header says so. `replace_provider_weekly_schedule()` does not exist live and nothing calls it; `saveProviderWeeklySchedule()` does the two writes directly (non-atomically) instead. Schedule saving works. Do not apply until the provider terms & policy work ships. |
| 20260826110100 | `consent_recorded_before_payment` | Must run after the emergency-request set (`20260821143821..144027`); has a `DO $$` guard that fails loudly if it doesn't. Verified 2026-08-26: nothing applied since touches `hold_cart_booking_slots`/`claim_cart_booking_slots`. **Genuinely still unapplied 2026-08-26** — live `hold_cart_booking_slots()` references neither `safety_ack%` nor `policy_accepted_at`, so health-adjacent consent is still unrecorded on the path real users take. This one IS a real open gap, unlike the parked file above. |

`20260826110100` is now BELOW the applied frontier (`20260826181210`) and
**must be renumbered above it before it is applied**, or `supabase migration
up` skips it and a fresh replay diverges from production. This is the same
trap that renumbered it twice already.

### Ledger reconciliation, 2026-08-26

`emergency_requests_remove_derived_hour_bound` and
`provider_chosen_request_window` were found **already applied live but absent
from `schema_migrations`** — their SQL had run (column comments and the
trigger body matched the files byte-for-byte) without ever being recorded.
Both were re-applied through `apply_migration` (both are idempotent, so this
was a no-op against the schema) purely to write the ledger rows, and the local
files were renamed from `20260826171244`/`20260826182059` to the versions the
MCP actually recorded — `20260826181157`/`20260826181210` — so filename and
record match again.

`20260826090555_reschedule_request_expiry.sql` also needs its cron job
(`reschedule-request-expiry`, jobid 154) to exist — a migration applying
cleanly does not mean its schedule was created.
