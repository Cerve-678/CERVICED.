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
OWNER:  (none)
SINCE:  --
SCOPE:  --
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
| 20260827160000 | `cancel_window_closing_warning` | **Written 2026-08-27 by the session doing reschedule/legal work; NOT applied — the lock above is held.** New `process_cancel_window_closing_warnings()` + cron `cancel-window-closing-warnings` + the `cancel_window_closing` notification type. Numbered above the 20260827120519 frontier and above the two cart-hold files so it runs last. Touches nothing the lock holder touches (no cart-hold functions, no booking triggers). Its one shared surface is `notifications_type_check`, which it **appends to** rather than recreating from a literal list — so it is safe in either order against `20260827140000_no_show_disputes`, which also adds a type. App-side wiring (`database.ts`, `NotificationsScreen`, `notificationTapHandler`) is already committed, so the type union is ahead of the constraint until this runs. **STEP 2 BELONGS TO WHOEVER APPLIES IT:** the file adds `cancel_notice_hours(INT, JSONB)` as the single definition of the cancellation-notice mapping and calls it, but `cancel_own_booking()` still carries its own inline copy. Rewrite it to call the helper in the same pass — with `pg_get_functiondef()` output in hand so `LANGUAGE`/`SECURITY DEFINER`/`SET search_path` survive the reproduction. It was left undone because the MCP connection was down when the file was written, and reproducing a live function from memory is exactly what stripped `SET search_path` off three functions earlier the same day. |
| 20260826110000 | `atomic_provider_weekly_schedule` | **DELIBERATELY PARKED, not a backlog item** — its own header says so. `replace_provider_weekly_schedule()` does not exist live and nothing calls it; `saveProviderWeeklySchedule()` does the two writes directly (non-atomically) instead. Schedule saving works. Do not apply until the provider terms & policy work ships. |

The queue is otherwise **empty as of 2026-08-27** — see below.

### Applied 2026-08-27 (queued backlog: disputes, cancel-window, client address)

Applied with the **Supabase CLI, not the MCP** — the MCP connection dropped
mid-pass and never came back. Each file was run as
`supabase db query --linked --file`, wrapped in an explicit `BEGIN; ... COMMIT;`
so a mid-file failure could not leave a half-applied migration, and each ledger
row was inserted **in the same transaction** rather than backfilled afterwards.
Because the CLI does not stamp a version of its own, these three keep their
filename numbers — the usual rename dance does not apply.

| Recorded version | Name | Verified live |
|---|---|---|
| 20260827154500 | `no_show_disputes` | 3 columns, `dispute_no_show` + `settle_no_show_reliability`, settlement cron (jobid 156), `no_show_disputed` in the type constraint. Renumbered from `20260827140000`, which sat below the frontier. |
| 20260827160000 | `cancel_window_closing_warning` | `process_cancel_window_closing_warnings()`, cron `cancel-window-closing-warnings` (jobid 157), `cancel_window_closing` in the constraint — **and `no_show_disputed` still present**, which is the check that matters here. |
| 20260827161000 | `client_address_released_on_confirmation` | `booking_client_addresses` (5 rows), `bookings.client_area`, relocation trigger, `client_bookings` re-pointed at the gated table. `bookings.client_address` now 0 non-null. Renumbered from `20260827130000`. |

`send-push-notification` redeployed to **v13** (`verify_jwt` still true) — its
only delta from v12 was the `no_show_disputed` pref mapping, which is inert
until the type exists.

**`CREATE OR REPLACE VIEW` cannot drop or reorder a column, and that bit.**
The address migration reproduced `client_bookings` as 44 columns, which was
correct when it was written. Applying `no_show_disputes` an hour earlier had
appended four no-show columns to that same view, so the replace failed outright
with `42P16: cannot drop columns from view`. The transaction rolled back and
nothing was applied — the wrapper earned its keep. The four columns were
carried through in their existing positions and it applied cleanly.

The lesson generalises past this pair: `client_bookings` is now a shared
surface between at least three migrations. Anyone rewriting it must reproduce
**every column already live, in order**, and append theirs at the end — check
`information_schema` first rather than trusting the newest file's list.

**The app-side half was not optional.** `clientAddressGating.test.ts` carried
two skipped tests and an explicit instruction: restore the PostgREST embed in
the same change that applies the migration, never before it, because the embed
resolves against the live schema cache and had already taken provider home down
once with `PGRST200`. `getClientBookingsForAddressShare` now embeds
`booking_client_addresses ( address )` and maps it back to `client_address`, so
callers are unchanged; both tests are unskipped and pass.

### Applied 2026-08-27 (cart holds + booking_ref)

The two files the lock above was held for, applied in order and verified
against live afterwards. Recorded versions `20260827153730` and
`20260827153834`; both files were renamed from their authored
`20260827150000`/`20260827151000`, along with the three `src/` comments that
cite the booking_ref migration by number.

| Recorded version | Name | Result verified live |
|---|---|---|
| 20260827153730 | `abandoned_cart_holds_are_not_bookings` | Both functions now DELETE instead of promoting a hold to `cancelled`, keeping `SECURITY DEFINER` + `search_path=public`. Cancelled bookings 25 -> 9, total 79 -> 63: exactly the 16 phantoms, 0 placeholders left, 6 linked notifications removed. |
| 20260827153834 | `booking_ref_unique_short_code` | `bookings.booking_ref` NOT NULL + unique index + BEFORE INSERT trigger. All 63 rows backfilled, 63 distinct, all length 8, zero ambiguous characters (`0/O/1/I/L/U`). |

**Two defects were fixed before applying, both found by verifying rather than
by reading the SQL.**

1. Each of the three `notifications` deletes lacked the transactions/reviews
   guards its accompanying `bookings` delete carried. In the two permanent
   functions that meant a hold *preserved* because money was attached would
   still have its notifications deleted -- stripping context from the one row
   deliberately kept for a human to look at. The guards were added to all
   three.
2. The header claimed `transactions.booking_id is NOT NULL REFERENCES
   bookings(id)`. Live, `transactions` has **no foreign keys at all** and
   `booking_id` is nullable. The database therefore provides zero protection
   against orphaning a payment row here; the `NOT EXISTS` guard is the only
   thing that does. The migration was safe as written -- but anyone later
   removing that guard on the strength of the comment would not have been.
   The header now says so explicitly.

Today `with_txn` was 0, so neither defect changed what this run deleted. Both
would have mattered on a later run of the permanent sweep, which is the point.

### Applied 2026-08-27 (four earlier migrations)

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
| `20260817110000_fix_pregnancy_safe_default 2.sql` | **iCloud fork, never apply.** Its `ALTER ... SET DEFAULT true` is already live; what remains is a blanket `UPDATE services SET is_pregnancy_safe = true WHERE false`. Its stated premise — "no screen lets a provider set this field" — is now FALSE (`InfoRegScreen.tsx` has a Switch). 20 services are flagged not-safe and they are Lip Filler, Anti-Wrinkle, Cheek Filler, Dermaplaning: real safety data, not default noise. Running it would tell pregnant clients filler and botox are safe. |
| `20260817110500_waitlist_lapse_and_exhaustion_notifications 2.sql` | **iCloud fork, content already live** (verified: `invite_next_waitlist_entry` returns boolean, lapse + exhaustion notifications both present). Re-running would revert `expire_waitlist_holds()` to its pre-15-minute body, undoing 20260827120519. Needs a ledger row and fork resolution, not execution. |

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
