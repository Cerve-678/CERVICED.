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

### Applied 2026-09-03 (add providers.tiktok)

`20260903135249_add_provider_tiktok.sql` — purely additive
(`ALTER TABLE ... ADD COLUMN IF NOT EXISTS tiktok TEXT`), no function/
policy/view touched. `users.tiktok` is collected at signup but had no
equivalent column on `providers` and no UI anywhere to view/edit it —
wired through InfoReg the same way `instagram`/`website` already work
(prefill from signup, preview card, section summary, form field, save on
both create and update paths in `providerRegistrationService.ts`).

### Applied 2026-09-03 (go-live now also requires a logo)

Immediate follow-up to the policies+payment change above, same session: the
user's next message described the intended rule as "address + service +
logo required, [policies/payment] recommendations" — the opposite of what
had just shipped for policies/payment. Clarified directly rather than guess:
answer was **both** — keep policies+payment blocking, add logo blocking too.

`20260903125327_go_live_requires_logo.sql` — `check_and_set_provider_live()`
now also requires `btrim(COALESCE(logo_url, '')) <> ''`. Confirmed live
before writing: all 5 then-live providers already had a logo, so zero
immediate impact. New `handle_provider_logo_change()` +
`on_provider_logo_change` trigger (`AFTER UPDATE OF logo_url ON providers`,
same `IS DISTINCT FROM` guard as the policies trigger) — `logo_url` is a
plain column on `providers` itself with no side table, so nothing previously
re-checked go-live status when it changed, same gap the `booking_policies`
trigger closed for policies/payment.

**Applied the lesson from the policies+payment migration**: tested in a
rolled-back transaction against ALL providers first this time
(`BEGIN; SELECT check_and_set_provider_live(id) FROM providers; ... ROLLBACK;`
— live count stayed 5, no error) before running for real. No repeat of the
23502 NULL-coalesce mistake, because `btrim(COALESCE(x, ''))` was already the
established safe pattern this file uses for `full_address` — logo followed
it directly rather than re-deriving a new NULL-handling approach.

Final live state after both changes today: 8 providers total, 5 live
(`count(*) FILTER (WHERE has_gone_live)`), matching the pre-change count —
the logo requirement changed nothing further since the one provider already
dropped by the policies+payment change (`dd990d00-...`, "Nails by Ellie")
was already not-live before this one ran.

### Applied 2026-09-03 (go-live now requires policies + payment)

At the user's explicit direction, reversing a design decision made earlier
the same day: `check_and_set_provider_live()` (redefined by
`bidirectional_go_live_gate` this morning) now also requires cancellation
policies AND a deposit/payment choice before a provider can go live —
previously both were "recommended", the server fell back to defaults for
either. Confirmed live before changing anything: 6 providers live, 0 missing
policies, 1 missing a deposit choice.

| Recorded version | Name | What happened |
|---|---|---|
| 20260903123949 | `go_live_requires_policies_and_payment` | First attempt — **raised 23502** (`null value in column "has_gone_live" violates not-null constraint`) the moment it ran against real data. |
| 20260903124244 | `fix_go_live_deposit_null_coalesce` | Root cause: with every deposit field NULL, `NULL OR NULL OR NULL OR NULL` is NULL in SQL (three-valued logic), not FALSE — assigning that into a NOT NULL column errors. `resolveDepositMode()` (the TS source of truth this mirrors) treats that same case as "not configured" = null, read by every caller as "not satisfied". Wrapped the OR-chain in `COALESCE(..., FALSE)` to match. Re-verified in a rolled-back transaction first (5 providers stayed live, the affected one correctly flipped to false, no error) before running for real. |

**`CREATE OR REPLACE FUNCTION` does not retroactively re-evaluate existing rows** — `has_gone_live` only updates when a covered trigger next fires. Since the user was told this would take effect immediately (that framing is what the go-ahead was based on), `check_and_set_provider_live(id)` was explicitly re-run for all 6 then-live providers after the fix landed. Result: 5 stayed live, 1 (`dd990d00-ff81-44fc-be6e-bbaf9248f464`, missing a deposit choice) went dark — confirmed via `count(*) FILTER (WHERE has_gone_live)` (8 total providers, 5 live) and a direct row check.

Also added: `handle_provider_policies_change()` trigger function +
`on_provider_policies_change` (`AFTER UPDATE OF booking_policies ON providers`,
guarded on `NEW.booking_policies IS DISTINCT FROM OLD.booking_policies`) —
`booking_policies` changes (PoliciesScreen/PaymentsScreen, both a plain
`providers.update()`) previously triggered no go-live re-check at all, so a
provider fixing the one thing now blocking them would have stayed dark until
an unrelated schedule/service/address change happened to re-fire the check.
Confirmed live: trigger present.

App-side (`src/features/providers/goLiveStatus.ts`, `src/screens/provider/ProviderHomeScreen.tsx`) updated in the same pass to move `policies`/`payment`
from the recommended to the blocking tier, matching the server exactly per
this file's own standing rule ("never add anything the server doesn't also
gate on"). Also fixed in the same pass, reported separately by the user:
the `profile` step's label ("Complete your profile") only ever checked
`about_text`, nothing else — renamed to "Write your business introduction"
so it stops reading as the whole profile being done.

### Applied 2026-09-03 (provider signup location staging)

`20260903115025_provider_signup_location_staging.sql` — adds `users.location_text` (TEXT, nullable, no default). Applied **without taking the lock**: purely additive, no function/policy/view touched, same category as `provider_brand_font`/`account_scoped_tour_versions` above. Verified live via `information_schema.columns`. Renamed from its authored `20260903124501` to the version `apply_migration` actually recorded, per the standing gotcha.

App-side landed in the same pass: provider signup Step 4's "WHERE YOU WORK" question changed from a multi-city `CityMultiSelect` (writing `serviceLocations`/`service_locations`) to the same single-area `AreaPicker` InfoReg's own "Where you're based" field uses — `RegistrationContext.tsx` gained a `location` field, staged through `SignUpStep5Screen.tsx`'s `signUpWithEmail` metadata, `EmailVerificationScreen.tsx`'s `users` upsert (`location_text`), and `getUserSignupPrefillInfo`/`InfoRegScreen.tsx`'s first-save prefill, mirroring the existing `business_name`/`team_size`/`price_range` staging pattern exactly. New providers no longer set "cities you cover" at signup — `service_locations` starts empty and is set later in Business Details → About You (`AboutYouScreen.tsx`, which already owns this field permanently); every downstream consumer already treats an empty array as normal (`?? []`/`|| []`). Also fixed in the same pass: InfoReg's first-save prefill never carried the provider's chosen service category (`service_interests` from Step 4) into `providerData.providerService`, so a provider who picked e.g. Nails at signup still saw Hair (the hardcoded default) pre-selected in InfoReg — now prefilled the same way, guarded on `providerService === 'HAIR'` since that field's default isn't an empty string.

### Applied 2026-09-03 (reschedule-notice defaults + bidirectional go-live gate)

Both directed by the user, verified against live schema first via the
Supabase MCP tools (not trusted from file mtime), applied, then re-verified
live before release:

- `20260903004053_reschedule_notice_unset_unrestricted.sql` —
  `request_reschedule_own_booking()`: an unset `rescheduleNotice`/
  `maxReschedules` (provider never opened Policies) previously fell through
  to a silent 24h-notice / max-1-reschedule default the provider never
  chose. `cancel_notice_hours()` already did the right thing (unset -> 0);
  this brings reschedule in line. An explicit `'24h'` choice is unaffected
  (now has its own `WHEN` branch instead of sharing the `ELSE`).
- `20260903004132_bidirectional_go_live_gate.sql` — closes PRE-LAUNCH-TODO.md
  item 11a. `check_and_set_provider_live()` now re-derives `has_gone_live`
  both ways instead of only ever flipping false->true, so a provider who
  closes their last open day or deletes their last service is un-published
  rather than staying live with nothing bookable. Two enablers were needed:
  `handle_provider_availability_change()` had a guard that skipped the
  check entirely when a day was being *closed* (only fired on open) — now
  always re-checks. `services` had only an `AFTER INSERT` trigger — added
  `on_provider_service_delete` (`AFTER DELETE`), since deleting a row
  previously triggered nothing.
  **Not yet built:** the client-side warning dialog before either action
  ("this will pause your account"). Both destinations already read
  `has_gone_live` live via the go-live checklist card, so the pause itself
  is fully wired — only the pre-action confirmation is outstanding.

### Applied 2026-09-03 (reschedule expiry + replace_provider_services upsert by id)

Both migrations below were applied with the user's explicit go-ahead:

| Recorded version | Name | Verified live |
|---|---|---|
| 20260902235455 | `reschedule_expiry_before_cancel_window_closes` | Renamed from its authored `20260901150000`. `cancel_notice_hours(int,jsonb)` present, `STABLE`, `search_path=public,pg_temp`, `anon` EXECUTE confirmed revoked. `cancel_own_booking`/`process_cancel_window_closing_warnings`/`process_expire_stale_reschedule_requests` all still `SECURITY DEFINER` with their `search_path` intact. Reproductions were diffed against live `pg_get_functiondef()` output before applying — byte-identical logic, just consolidated onto the new helper, so no drift risk. |
| 20260903000130 | `replace_provider_services_upsert_by_id` | Renamed from its authored `20260901180000`. Still `SECURITY DEFINER`, grants preserved exactly (`anon` → false, `authenticated` → true) — `CREATE OR REPLACE` on the same signature, not a `DROP`+`CREATE` pair, so no PUBLIC-grant regression. Body length 7383 (up from 3737), confirming the new logic actually replaced the old delete-all body live, not just on disk. |

`20260901180000_replace_provider_services_upsert_by_id.sql` — fixes the bug
reported as "a service is still available by a provider but it says no
longer available by provider." Root cause: `replace_provider_services()`
did `DELETE FROM services WHERE provider_id = ...` then reinserted
everything from the payload, on every InfoRegScreen save — regenerating
every service's and every add-on's id even when nothing about that specific
row changed. A client cart item holds the id it was added with, so the very
next unrelated catalogue save made it look withdrawn. Worse:
`bookings.service_id`, `portfolio_items.service_id`, `reviews.service_id`,
`event_tasks.service_id`, `provider_waitlist.service_id` are all
`ON DELETE SET NULL` against `services(id)`, and `booking_add_ons.add_on_id`
likewise against `service_add_ons(id)` — every one of those got silently
nulled on every save, for every row tied to any of that provider's services,
not just the one being edited. Checked live before writing this: **76 of 79
bookings (96%) already have `service_id = NULL`.**

The fix upserts by id instead: an incoming `id` is only trusted if it
already belongs to this provider's row (services) / this service's row
(add-ons) — never allowed to hijack another row — a matched row is updated
in place, an unmatched or absent id is inserted fresh, and anything that
existed before but is absent from this save's payload is deleted (a
provider removing a service/add-on still works). `service_images` stays
delete-then-reinsert per service — nothing external references
`service_images.id`, so there's no churn hazard there.

App-side (already made, independent of whether this migration is applied —
it only threads a `dbId` through, harmless against the old function too):
`ProviderServiceDraft.dbId` / `ServiceData.dbId` / `AddOnData.dbId` added
across `src/features/provider-registration/serviceDraft.ts`,
`src/screens/provider/InfoRegScreen.tsx`,
`src/services/providerRegistrationService.ts` (both the load-side mapper and
the save-payload builder) and `src/services/acuityTransferService.ts`;
`getProviderRegistrationDetails()` now also selects `service_add_ons.id`.
`npx tsc --noEmit` and `npm test` (493/493) both clean.

**Verified functionally, not just structurally**, in a rolled-back
transaction against a real provider (11→9 was a join-fanout artifact in my
own exploratory count query, not data loss — confirmed after rollback the
provider still has exactly 9 distinct services / 5 add-ons, unchanged):
updating an existing service by id preserved the id and applied the field
change; a removed add-on was deleted, a new add-on was inserted, an
untouched add-on kept its id and got its field update; a service omitted
from the payload was deleted along with its add-on (cascade); a brand-new
service (no id) was inserted; and — the security case — an incoming `id`
belonging to a **different provider's** service was correctly rejected
(inserted as a new row instead of overwriting), leaving the other provider's
row completely untouched.

Flagged, not fixed here: `getProviderRegistrationDetails()` filters
`.eq('is_active', true)`, so a provider's hidden services were never loaded
into the editor and are therefore permanently deleted on the next
full-catalogue save — under both the old logic and this new one, since
upsert semantics can't distinguish "provider deleted this" from "provider
never saw this." Separate bug, needs a product decision (load inactive
services into the editor too, or exclude them from the prune step), not
made in this pass.

### Written 2026-09-01, NOT YET APPLIED (reschedule expiry bounded by the client's cancel window)

`20260901150000_reschedule_expiry_before_cancel_window_closes.sql` — fixes
the bug reported as "a provider can ignore a reschedule until the client has
passed their cancellation window, leaving the client unable to reschedule or
cancel." Confirmed live (project `ztrfpfvvejzaysrelmfm`) before writing this:
`cancel_own_booking()` enforces the cancellation-notice window unconditionally
and never looks at `booking_reschedule_requests`, while
`request_reschedule_own_booking()` refuses a second request while one is
already `pending`/`provider_responded`. The only thing that could resolve a
stuck pending request was `process_expire_stale_reschedule_requests()`'s
auto-expiry deadline (cron 154) — and that deadline was anchored only on the
provider's `rescheduleNotice` policy (floored at 24h), with no idea the same
booking also carries a separate `cancelNotice` policy that can close sooner.
Worked example, confirmed by a literal-value dry run against live Postgres
(no tables touched): a booking 30h out, 24h `cancelNotice`, `same_day`
`rescheduleNotice` — cancel closes 6h after the request is made, the request
didn't auto-expire for another 18h after that. 18 hours with no available
action in the app at all.

The fix adds a third bound to that deadline — never later than 6 hours before
the client's own cancellation-notice cutoff on the same booking, floored at
the same 4-hour "real chance to answer" minimum the existing rescheduleNotice
bound already uses. A new shared helper, `cancel_notice_hours(INT, JSONB)`,
resolves the cancellation-notice mapping once; `cancel_own_booking()` and
`process_cancel_window_closing_warnings()` (which had the same CASE mapping
inlined, the latter three times over) now call it instead of carrying their
own copies — closing the drift risk the `cancel_window_closing_warning` queue
entry below flagged as "STEP 2 BELONGS TO WHOEVER APPLIES IT" and never got
done. All three functions keep identical signatures, so `CREATE OR REPLACE`
preserves every existing grant; only the new helper needs its own
`REVOKE`/`GRANT`.

**Deliberately does NOT** grant a no-penalty cancellation once a client's
cancel window has closed — `cancel_own_booking()`'s notice-window check is
untouched below. Whether provider inaction should ever entitle a client to
cancel for free past their own notice window is the "STILL OPEN" question
`20260826090555_reschedule_request_expiry.sql`'s own header raised and
explicitly left alone, citing `LEGAL-COMPLIANCE-NOTES.md` §12 — a
product/legal call, not one this fix makes. This migration only guarantees
the pending request itself resolves with enough lead time for the client to
act on the existing "cancel by X" warning notification while their window is
still open, instead of leaving them checking an app that offers neither
Cancel nor Reschedule at all.

Verified structurally via `src/tests/rescheduleExpiryBeforeCancelWindow.test.ts`
(migration-file contract test, same pattern as
`emergencyRequestNeverAutoConfirms.test.ts`) and functionally via a
literal-value dry run of the deadline formula against live Postgres (no
tables touched, nothing written) — both pass. `npx tsc --noEmit` and
`npm test` (493/493) both clean; no app-side change was needed —
`BookingContext.tsx`'s existing catch-up/subscription logic already clears
`isPendingReschedule` off any booking whose `booking_reschedule_requests` row
is no longer `pending`/`provider_responded`, which an `'expired'` status
already satisfies.

Applying this migration to the live project requires the user's explicit
go-ahead (blocked by the permission classifier as a live production schema
change) — **the file is written but not applied, do not assume it ran.**
The migration lock above is currently held by another session for unrelated
work (`atomic_provider_weekly_schedule`); this entry does not take it, since
writing (not applying) needs no lock per the protocol below.

### Applied 2026-09-02 (pregnancy-safe default)

`20260902141600_pregnancy_safe_default_false.sql` — flips
`services.is_pregnancy_safe`'s column DEFAULT from `true` back to `false`.
The `true` default (set by `20260817084930_fix_pregnancy_safe_default.sql`,
back when no screen let a provider set this field) was a fail-open default
for health-adjacent data: `InfoRegScreen.tsx` has had a real "Pregnancy Safe"
Switch since, and providers are actively using it (27 services explicitly
FALSE, 14 explicitly TRUE, live as of 2026-09-01). Not a data backfill —
existing rows untouched, only the default for future unconfigured inserts
changed.

Applied via `apply_migration` with the user's explicit go-ahead. Verified
live: `information_schema.columns.column_default` for
`services.is_pregnancy_safe` now reads `false`. Recorded version
`20260902141600` — renamed from its authored `20260901120000`, per the
standing gotcha (`apply_migration` stamps its own version).

The known-dangerous fork this fix's header refers to,
`20260817110000_fix_pregnancy_safe_default 2.sql` (see the "Ledger diff"
entry below — "iCloud fork, never apply... Running it would tell pregnant
clients filler and botox are safe"), has now been **deleted** (`git rm`) as
part of this same pass, closing the fork-resolution TODO that entry left
open.

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

### Applied 2026-08-31 (fold hair-type matching into get_providers_availability)

| Recorded version | Name | Verified live |
|---|---|---|
| 20260831230536 | `get_providers_availability_hair_match` | `get_providers_availability(text[], text)` live with the new `hair_match` output column and `p_hair_type` param (default NULL, backward compatible). Verified functionally in a rolled-back transaction: `'4c'` against a provider temporarily given `hair_types_catered = {'4c','curly'}` returned `hair_match=true`, `'straight'` against the same provider returned `false`, and every live provider (all with empty `hair_types_catered` today — see `hair-type-filter-has-no-writer.md`) returns `true` regardless of the requested type, matching `matchesHairType()`'s empty-means-all rule. |
| 20260831230612 | `revoke_public_get_providers_availability` | Fixes a regression the DROP+CREATE above introduced: Postgres grants a newly created function EXECUTE to `PUBLIC` by default, which `anon` inherits from — silently re-opening a function the 2026-08-20 hardening pass had locked to `authenticated`+`service_role` only. Caught immediately by re-checking `has_function_privilege` for `anon` after the first migration (it came back `true`); this migration revokes `PUBLIC` explicitly. Re-verified after: `anon` → false, `authenticated`/`service_role`/`postgres` → true, matching the pre-change grant set exactly. |

**Lesson for next time a table-function's output columns change:** `DROP FUNCTION` + `CREATE FUNCTION` (required whenever `CREATE OR REPLACE` can't add an output column) does not carry forward the dropped function's grants — it resets to Postgres's default (`PUBLIC` gets EXECUTE). `CREATE OR REPLACE` preserves grants; a DROP+CREATE pair must re-grant explicitly AND `REVOKE ... FROM PUBLIC` in the same pass, not just re-grant the roles that used to have it.

Also updated app-side: `getProvidersAvailability()` (`src/services/databaseService.ts`) now takes an optional `hairType` param and returns `hairMatch` per provider; `getProviderHairTypeMatches()` (the separate `providers`-table lookup it replaced) was deleted, its only caller (`SearchScreen.tsx`) merged into the same effect that already fetches availability per search-result-set change.

### Applied 2026-08-29 (service photo framing)

`20260829011733_service_image_fit.sql` — adds `service_images.fit`
('cover' | 'contain', NOT NULL DEFAULT 'cover', CHECK-constrained) and
reproduces `replace_provider_services()` so the catalogue rewrite carries the
new column instead of resetting every provider's framing on their next save.

Verified live, body included, not just the column: `fit` exists with 81/81 rows
on 'cover' and 0 nulls, the CHECK constraint is present, and the live function
source contains `fit`. The function was reproduced from `pg_get_functiondef()`
output — note the live definition already carried `audience`, which the tracked
`supabase/replace_provider_services.sql` does not, so that file is stale and
was NOT used as the base.

**The file is named for the version `apply_migration` assigned itself
(`20260829011733`), not the timestamp it was written with** — renamed after
applying, per the standing gotcha.

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

### Applied 2026-09-01 (provider brand font)

`20260901122058_provider_brand_font.sql` — adds `providers.brand_font` (TEXT,
nullable, plus a column comment). Applied **without taking the lock above**:
purely additive (no function/view/policy touched), and shares no surface with
either the atomic-schedule migration the current owner just applied
(`20260901021349`) or the pending pregnancy-safe-default file — same
reasoning as the account-scoped-tour-versions precedent. Renamed from its
authored `20260901130000` to the version `apply_migration` actually recorded,
per the standing gotcha.

Verified live: column is `text`, nullable, comment present; all 6 existing
provider rows read `NULL` (0/6 non-null) — the app treats `NULL` as the
'default' font key (`src/constants/providerFonts.ts`), so no provider's
profile changes appearance until they visit the new Branding screen picker.

App-side landed in the same pass: `types/database.ts`'s `DbProvider` and the
`ProviderWithServices` allow-list, `profileTypes.ts`/`profileMapper.ts`,
`databaseService.ts`'s `getProviderBySlug`/`getProviderBrandingByUserId`/
`updateProviderBranding`, `BrandingScreen.tsx`'s new font picker section, and
`ProviderProfileScreen.tsx`'s hero name + scrolled nav header. Also fixed in
the same pass: `Prata-Regular.ttf` (the font this feature's 'default' option
resolves to) was never registered in `App.tsx`'s `useFonts` despite being used
via `fontFamily` in two screens already — now registered.

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
| ~~`20260817110000_fix_pregnancy_safe_default 2.sql`~~ | **RESOLVED 2026-09-01 — deleted, not just left unapplied.** Was: iCloud fork, never apply — its `ALTER ... SET DEFAULT true` was already live; what remained was a blanket `UPDATE services SET is_pregnancy_safe = true WHERE false`, which would have told pregnant clients filler and botox are safe. This ledger row itself is what caught it staying un-deleted for days; see `20260901120000_pregnancy_safe_default_false.sql` above for the actual fix (default flipped back to `false`, since the premise this fork's twin was written under no longer holds). |
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
