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

### Applied 2026-08-31 (account-scoped walkthrough versions)

`20260831124409_account_scoped_tour_versions.sql` — adds `users.seen_tours`
(JSONB NOT NULL DEFAULT '{}') and `mark_tour_seen(TEXT, INT)`. Purely
additive: a new column and a new function, redefining nothing, so it could
not have reverted concurrent work in either order.

Lock was `(none)` when taken and released on the same pass. **The claim was
made in a worktree**, so the other session working in the main checkout could
not have seen it — acceptable here only because the migration redefines
nothing; do not treat that as precedent for one that does.

Verified live: column is `jsonb`, `NOT NULL`, default `'{}'::jsonb`, 7/7 rows
non-null. Function is `SECURITY DEFINER` with `search_path=public, pg_temp`,
granted to `authenticated`/`service_role` only — **not `anon`** (2026-08-20
hardening pass).

**Verified functionally, not just structurally**, in a `DO` block ending in
`RAISE EXCEPTION` so the whole thing aborted rather than relying on the caller
to roll back. Four properties, all of which a structural check would have
missed:

| Property | Result |
|---|---|
| A second tour MERGES into the map rather than replacing it | all three keys present |
| A version never moves backwards | wrote 3, then a "stale build" wrote 1 -> stayed `3` |
| A malformed pre-existing entry does not raise | `"garbage"` -> replaced with `2` |
| Nothing persisted | `seen_tours <> '{}'` count back to 0 afterwards |

The merge and the GREATEST both matter in production: Home and Explore are
adjacent tabs whose tours can be shown moments apart, and a read-modify-write
of the whole object from the client would lose one of them.

**Renamed from its authored `20260831120000`** to the version
`apply_migration` stamped itself (`20260831124409`), per the standing gotcha.


### Applied 2026-08-28 (client loyalty points — earning side)

| Recorded version | Name | Verified live |
|---|---|---|
| 20260828185349 | `client_loyalty_points` | `client_points_ledger` table live, RLS enabled, one `SELECT` policy (`client_id = auth.uid()`); all three partial unique indexes present (`..._one_per_completed_booking`, `..._one_per_review`, `..._one_first_booking_per_client`); all 5 functions `SECURITY DEFINER` with `search_path=public, pg_temp` (confirmed via `pg_proc.proconfig`); triggers `on_booking_award_points`/`on_review_award_points` present; cron `award-birthday-points` active, `0 6 * * *`. Renamed from its authored `20260828120000` to the version `apply_migration` actually recorded. |

**Verified functionally, not just structurally**, in a rolled-back transaction
(bookability trigger temporarily disabled for the test only, restored by the
`ROLLBACK`): a booking completed then bounced back to `confirmed` and
completed again produced exactly one `booking_completed` (50) + one
`first_booking` (200) row — the re-completion did not double-award, both by
the trigger's own `OLD.status IS DISTINCT FROM 'completed'` guard and the
partial unique index as a second backstop. A second booking for the same
client awarded only the 50, no second `first_booking`. A review insert
awarded 20; a duplicate review on the same booking was rejected by
`reviews_booking_id_key` before the trigger could even run. Final balance
matched the predicted 50+200+50+20=320 exactly. No rows were left behind
(`client_points_ledger` count 0 immediately after).

New table only — does not touch `bookings`/`reviews` columns or the body of
any pre-existing function (deliberately did **not** edit
`process_birthday_greetings()`; birthday points are a new, separate cron).

### Applied 2026-08-28 (per-service audience field)

| Recorded version | Name | Verified live |
|---|---|---|
| 20260827231438 | `service_audience` | `services.audience` TEXT, nullable, live; `services_audience_check` allows NULL or one of `women`/`men`/`kids`/`everyone` (confirmed via `pg_get_constraintdef`); `replace_provider_services` INSERT column list carries `audience` through from the jsonb payload (confirmed with a rolled-back direct INSERT of `audience='kids'`, since the RPC itself requires an authenticated owner `execute_sql` can't satisfy). NULL means "not stated", read as "everyone" by the app — same convention as `services.hair_types_suitable`'s "suits all" empty case. Renamed from its authored `20260828120000` to the version `apply_migration` actually recorded.

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

### Applied 2026-08-27 (booking notes: the generated health prefix, guarded)

| Recorded version | Name | Verified live |
|---|---|---|
| 20260827210000 | `guard_generated_health_prefix_in_booking_notes` | `strip_generated_health_prefix()` present, **not** SECURITY DEFINER (it needs no privilege the writer lacks) with `search_path=public, pg_temp`; trigger `before_booking_strip_generated_health_prefix` is BEFORE INSERT OR UPDATE OF notes, FOR EACH ROW; 0 rows match `^Health info:`. |

**Applied by the user out-of-band (SQL editor), so the ledger row was
backfilled** — `apply_migration` and the CLI were both refused by the
permission classifier in the session that wrote the file. Because
`apply_migration` never ran it never stamped a version of its own: the filename
number stands and the usual rename dance does not apply. Its `statements`
records that it is a backfill and how it was verified, not a fabricated body.

`20260825133014` had already stripped this prefix once and the app-side writer
went on 2026-08-20 — but **five more rows arrived on 2026-08-26**, all one
client, all from an app build compiled before the fix and still installed on a
device. That is why this is a trigger and not a third UPDATE: the stale bundle
is a caller that never receives an app-side fix, so the database has to be the
thing that refuses. The pattern is anchored at the start of the note, so a
client writing about their own health keeps every word.

### Applied 2026-08-27 (emergency requests never auto-confirm — the claim path)

| Recorded version | Name | Verified live |
|---|---|---|
| 20260827200000 | `emergency_requests_never_auto_confirm_claim_path` | `claim_cart_booking_slots()` carries the `NOT COALESCE(is_emergency_request, FALSE)` guard on **both** the `status` and `confirmed_at` CASE arms, plus the emergency notification copy. Still `SECURITY DEFINER`, `LANGUAGE plpgsql`, `search_path=public`, grants `authenticated` + `service_role` EXECUTE. |

`20260821144027` (part 5 of 5 of the emergency-request set) taught
`finalize_checkout()` that an emergency request must ignore
`providers.auto_accept_bookings`, and **missed its twin**. The Stripe
prepare/finalize pair is not the live route — `claim_cart_booking_slots()` is —
so for six days every emergency request to an auto-accepting provider was
committed on their behalf the instant it was paid for. It never became a
`pending` row, and the whole provider-side experience is gated on
`isPendingConfirmation`: the inbox's Confirm/Decline, the swipe actions and the
"Outside your availability" banner are all built correctly and simply never
rendered. Two live bookings were created this way, one at **00:30** — precisely
the case the opt-in exists to protect against.

**Verified functionally, not just structurally**, in a `DO` block that ends in
`RAISE EXCEPTION` so the whole thing aborts rather than relying on the caller
to roll back. Two holds were claimed for the same auto-accept-ON provider in
one batch: the emergency one came out `pending` with `confirmed_at` NULL, the
ordinary one `confirmed` — so the fix does not quietly turn auto-accept off for
everyone. The four notifications were the right two pairs, including
"Booking Request — Outside Your Hours" to the provider. Nothing was left behind
(re-checked after).

**Applied out-of-band (SQL editor), so the ledger row was backfilled** rather
than the file re-executed — its `statements` records that and how it was
verified. Because `apply_migration` never ran, it never stamped a version of
its own: the filename number stands, and the usual rename dance does not apply.

`src/tests/emergencyRequestNeverAutoConfirms.test.ts` now holds this as a
contract. It deliberately **scans for the newest migration** defining each
function rather than naming these two files — the failure mode is a later
reproduction dropping the rule, which a pinned test would never see.

### Applied 2026-08-27 (client area selection)

| Recorded version | Name | Verified live |
|---|---|---|
| 20260827162000 | `client_area_selection` | `users.client_area` added; `relocate_booking_client_address()` now COALESCEs a chosen area over its postcode derivation, still `SECURITY DEFINER` with `search_path=public, pg_temp` intact. |

Closes the gap flagged when `20260827161000` went in: `client_area` was derived
from the address by postcode, but checkout only requires the address to be
non-empty, so **four of the five live addresses had no postcode and produced a
NULL area** — the feature's whole purpose (a mobile provider judging travel
before accepting) silently did not hold for most bookings.

The area is now something the client **states** in Account > Your Address, via
a new `AreaPicker` built on the same `CITY_AREAS` data the provider's own
location picker uses, so both hats' coarse locations read identically.
`LocationPicker` was deliberately not reused: it takes 22 style keys from
InfoRegScreen's stylesheet as an untyped `styles` prop, so lifting it would
drag a screen's styling across a feature boundary. The data is shared, which is
the part that has to agree.

`bookings.client_area` now holds **two shapes on purpose** — a chosen area
("Camden, London") or a derived postcode district ("SE15"). Both answer the
only question the column exists to answer, and a provider reads either the
same way. The column comment says so.

**Verified functionally, not just structurally.** A transaction (rolled back)
inserted two bookings: one with a chosen area and a postcode-less address,
one with no chosen area and a postcode. The first kept "Camden, London", the
second derived "SE15". Structural checks alone would not have caught a COALESCE
argument in the wrong order.

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
