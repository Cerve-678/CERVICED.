# Migration ownership

**One session owns migrations at a time. Check this file before writing or
applying one.**

This repo is regularly open in two Claude sessions at once, against a single
live Supabase project. That combination produces a failure no amount of file
discipline catches, because the ordering is decided by what *someone else
applied while you weren't looking*:

- `20260827115930_consent_recorded_before_payment.sql` has been renumbered
  **twice**. First it was overtaken by the emergency-request set, which
  redefines the same function — in that order the consent gate would have been
  silently reverted, no error, no conflict. Then it was overtaken again by the
  reschedule-expiry work, leaving it below the applied frontier where
  `supabase migration up` skips it and a fresh replay diverges from production.

Neither was a git problem. Both sessions wrote correct SQL.

---

## Current owner

```
OWNER:  session working on abandoned cart holds ("Reserving…" phantom bookings)
SINCE:  2026-08-26
SCOPE:  expire_cart_holds(), release_cart_booking_slots(), and a one-off
        cleanup of the 16 live cancelled rows left behind by them
        (20260827150000), plus the new bookings.booking_ref column and its
        generator/trigger (20260827151000).
        BOTH ARE WRITTEN BUT NOT APPLIED — the Supabase MCP connection was
        down for this whole pass, so nothing was verified against live and
        nothing was run. Renumbered from 202608262* to sort above the
        20260827140000 frontier before anyone replays them.
        NOT touching the four AFTER INSERT triggers on bookings — the other
        active session owns those in
        20260827120122_hold_rows_skip_booking_side_effects.sql.
```

> **This claim was briefly overwritten on 2026-08-27 and has been restored.**
> A third session, asked to "run all SQL files that aren't live", applied the
> four queued migrations below **without taking the lock** — it read this
> block, saw `SINCE` was a day old, and proceeded. That was the wrong call
> even though nothing broke: the scopes did not overlap (verified function by
> function before applying, which is the only reason this is a note and not an
> incident), but "the scopes don't overlap" is a conclusion the lock exists to
> stop people reaching on their own. The lock is still YOURS — the cart-hold
> work above is not applied and this claim stands.

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
| 20260827160000 | `cancel_window_closing_warning` | **Written 2026-08-27 by the session doing reschedule/legal work; NOT applied — the lock above is held.** New `process_cancel_window_closing_warnings()` + cron `cancel-window-closing-warnings` + the `cancel_window_closing` notification type. Numbered above the 20260827120519 frontier and above the two cart-hold files so it runs last. Touches nothing the lock holder touches (no cart-hold functions, no booking triggers). Its one shared surface is `notifications_type_check`, which it **appends to** rather than recreating from a literal list — so it is safe in either order against `20260827140000_no_show_disputes`, which also adds a type. App-side wiring (`database.ts`, `NotificationsScreen`, `notificationTapHandler`) is already committed, so the type union is ahead of the constraint until this runs. |
| 20260826110000 | `atomic_provider_weekly_schedule` | **DELIBERATELY PARKED, not a backlog item** — its own header says so. `replace_provider_weekly_schedule()` does not exist live and nothing calls it; `saveProviderWeeklySchedule()` does the two writes directly (non-atomically) instead. Schedule saving works. Do not apply until the provider terms & policy work ships. |

The queue is otherwise **empty as of 2026-08-27** — see below.

### Applied 2026-08-27

Four migrations were applied in dependency order, each verified against the
live schema afterwards rather than trusted to have run:

| Recorded version | Name | What it closes |
|---|---|---|
| 20260827115930 | `consent_recorded_before_payment` | The long-open gap: `hold_cart_booking_slots()` now derives whether a safety acknowledgement is required from the **service row**, rejects an item with no `policy_accepted`, and stamps both timestamps from the database clock. Renumbered a third time before it ran. |
| 20260827120122 | `hold_rows_skip_booking_side_effects` | The three AFTER INSERT triggers that fired on `on_hold` rows; side effects deferred to an AFTER UPDATE trigger when a hold becomes real. |
| 20260827120337 | `reschedule_slot_holds` | A requested/offered reschedule time is now actually reserved. Adds `bookings.reschedule_hold_for`. |
| 20260827120519 | `waitlist_hold_fifteen_minutes` | 3h → 15min hold, sweep every minute, and an expired hold stops blocking at READ time. |

**A defect was caught and fixed during this pass, not by the SQL author.**
`20260827120122`'s reproductions of `handle_auto_send_intake_form`,
`handle_attach_info_packs` and `handle_booking_todo_notification` **omitted
`SET search_path`**, which all three carry live. Applying the file as written
would have silently stripped search_path pinning from three SECURITY DEFINER
trigger functions, partially undoing the 2026-08-20 hardening pass — with no
error and no conflict. The file was corrected before it was applied.

This is the exact failure mode rule 2 below exists for, arriving from a
direction it does not name: the danger is not only that a *newer* definition
gets reverted, but that a faithful-looking reproduction quietly drops a
**security attribute** the live definition has. When a migration rewrites a
function it did not create, diff the reproduction against
`pg_get_functiondef()` — not just its logic, but its `LANGUAGE`, `SECURITY`,
`SET` and `STABLE`/`IMMUTABLE` clauses.

### Filename vs. recorded version, again

`apply_migration` assigns its **own** version from the wall clock at apply
time; it does not honour the filename. All four files were renamed from their
authored numbers (`20260826110100`, `20260826190000`, `20260827090000`,
`20260827100000`) to the versions the MCP actually recorded, and the six
`src/` and doc references to those old paths were updated with them — two
Jest suites read these files by path and fail loudly if they drift, which is
how the rename was caught.

**Expect this every time.** Write the file with any sensible number, apply it,
then rename to whatever `schema_migrations` records. The filename is the
record's shadow, never the other way round.

### Ledger backfill, 2026-08-27

Four migrations that had been applied out-of-band (SQL editor) and knowingly
left without a `schema_migrations` row were **backfilled**:

| Version | Name |
|---|---|
| 20260816181340 | `harden_provider_chat_privacy` |
| 20260816191802 | `add_provider_message_templates` |
| 20260817160000 | `manual_booking_extra_minutes` |
| 20260819001800 | `deduplicate_push_delivery` |

Each was re-verified against the live schema first. **No SQL was re-executed** —
rows were inserted directly, because `add_provider_message_templates` is not
idempotent (`CREATE POLICY` has no `IF NOT EXISTS`) and re-running it would
error. Each row's `statements` holds a pointer back to its file and how it was
verified, not a fabricated body: the text actually run out-of-band was never
captured, and inventing one would make the ledger lie in a more convincing way
than a missing row does.

The earlier decision to leave them un-backfilled was deliberate, but it cost a
re-investigation on 2026-08-20, again on 08-25, and again on 08-27. A missing
row does not mean "unapplied", so every audit had to re-derive that from the
live schema. The row is cheaper than the third re-derivation.

**A ledger diff is now meaningful.** 158 local files, 155 recorded. The three
that differ are all explained:

| File | Why it isn't applied |
|---|---|
| `20260810180952_restore_legacy_booking_writes_pending_stripe` | **SUPERSEDED — never apply.** Adds a blanket `authenticated` INSERT policy on `bookings`, letting a client forge price/status/snapshot fields. Confirmed absent live. |
| `20260826110000_atomic_provider_weekly_schedule` | Deliberately parked (see Queue above). |
| `20260827130000_client_address_released_on_confirmation` | Another session's in-flight work, written 2026-08-27 15:06. Not mine to apply. |

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
