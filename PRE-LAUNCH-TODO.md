# Pre-launch TODO

Things deployed to the live DB (project **Cerviced**, `ztrfpfvvejzaysrelmfm`)
in testing/incomplete form on 2026-08-02. Don't ship without addressing these.
See also `LEGAL-COMPLIANCE-NOTES.md` and `RUNBOOK-booking-audit.md` for other
standing gaps.

---

## 1. BLOCKING — enable and test secure Stripe checkout before launch

The secure checkout route is deployed: `prepare_checkout → create-payment-intent
by checkout batch → finalize_checkout`, with server-owned availability, prices,
deposit policy and platform fees. Direct client booking/add-on writes were
revoked as part of that cutover.

Stripe is deliberately **off** in app code until launch preparation:
`EXPO_PUBLIC_STRIPE_PAYMENTS_ENABLED=true` is required in the native release
environment. While it is off, the old mock checkout cannot create live bookings
because its direct writes are intentionally blocked.

**Before launch:** enable the flag in the release environment, build a native
iOS/Android app, and complete a Stripe test payment end to end: reserve slot,
authorise payment, finalise booking, capture payment, verify client/provider
notifications and the PDF receipt. Verify cancellation releases an abandoned
checkout hold. Do not restore legacy direct booking policies merely to use the
mock payment UI in production.

### Pending database hardening — do not batch-deploy with legacy checkout rollback

The local, untracked migration
`20260810180952_restore_legacy_booking_writes_pending_stripe.sql` restores
direct client inserts to `bookings` and `booking_add_ons`. It must not be
deployed alongside security migrations: it reintroduces client-controlled
booking/payment values and conflicts with the server-authoritative checkout
cutover above.

Two reviewed security migrations are intentionally local-only until that
checkout decision is resolved:

- `20260812114517_revoke_public_booking_bookability_trigger.sql` and
  `20260812114619_harden_attach_info_pack_to_booking.sql` remove unauthorised
  execution paths for booking/information-pack operations.
- `20260815093855_harden_promotion_and_conversation_rpcs.sql` limits sensitive
  beauty-profile, promotion-audience and conversation-preview RPCs to their
  authenticated owners.
- `20260815095318_revoke_public_waitlist_invite_function.sql` removes API
  access to the trigger-only function that creates waitlist bookings and
  notifications.
- `20260815095405_revoke_public_scheduled_process_functions.sql` closes 21
  public cron-job endpoints that can otherwise send reminders or mutate
  booking/provider state on demand.
- `20260815095854_revoke_public_trigger_function_execution_batch_two.sql`
  removes public API access from 24 trigger-only state-management functions.

Use a dry run and inspect the exact migration list before any next production
push. Do not use a direct SQL workaround that would put the database schema
ahead of migration history.

### Notification-delivery authority — staged, pending deployment

All public tables currently have RLS enabled. Migration
`20260815100547_harden_notification_delivery_authority.sql` replaces the broad
provider/client notification policies with two authenticated RPCs. They derive
every recipient from an owned booking, conversation booking, follow, bookmark,
or waitlist relationship, then the app routes promotions, announcements,
rebooking, intake forms, waitlist invites, and address alerts through them.

This migration must ship with its paired app release. Until then, do not deploy
the policy replacement by itself because older app builds still use direct
notification inserts.

### Function privilege defaults — staged, pending deployment

`20260815101017_restrict_future_public_function_execution.sql` changes the
`postgres` role's public-schema defaults so future database functions are not
automatically callable by `anon` or `authenticated`. Any migration that adds a
client RPC must now explicitly grant only the intended role after implementing
its ownership checks. This prevents the same public-function exposure class
from reappearing as the schema evolves.

---

## 1b. BLOCKING — there is no refund logic anywhere in the app

Added 2026-08-20. Verified against the live function bodies, not just the SQL
files.

`cancel_own_booking()` only does `UPDATE bookings SET status = 'cancelled'`. It
never touches `payment_status`, never touches `amount_paid`, and never calls
Stripe. There is no `refund` call in `src/services/stripeService.ts` or in any
edge function — the only occurrence of the word in `supabase/functions/` is a
comment in `create-payment-intent/index.ts` noting there's "nothing to refund it
automatically".

Practical effect once Stripe is switched on (see item 1): **a client who pays a
deposit or pays in full and then cancels gets nothing back, and no screen
anywhere tells them that.** Money would be captured with no reversal path, and
the provider has no way to issue one from inside the app either.

`refundPolicyNote` (`PoliciesScreen.tsx` / `PaymentsScreen.tsx`, stored in
`providers.booking_policies`) is free text shown to clients on the provider
profile and enforced by **nothing**. As of 2026-08-20 all 4 live providers had
it blank, so clients currently see no refund terms at all.

The provider's cancellation-notice window is likewise not payment-linked:
cancelling inside the window is *blocked* rather than charged, and cancelling
outside it refunds nothing, so the notice policy and the money are two
unconnected systems.

### What has to be decided before this can be built

These are product/legal calls, not engineering ones — do not pick defaults
unilaterally (see `LEGAL-COMPLIANCE-NOTES.md` and the CLAUDE.md legal rule):

- Are deposits refundable at all, and if so up to when? Right now they are
  non-refundable purely by omission, which no copy states.
- Does cancelling outside the provider's notice window trigger a full refund,
  a partial one, or none — and is that per-provider or platform-wide?
- Who absorbs the Stripe processing fee and the platform fee on a refund?
- Provider-initiated cancellations: presumably always a full refund, but this
  needs stating.
- What happens to a refund when a booking is cancelled as part of the account
  deletion flow (see `ACCOUNT_DELETION.md` — transactions survive,
  pseudonymised).
- Does a declined/expired reschedule ever produce a refund, or only a cancel?

### What building it involves

- A `refund-payment` edge function wrapping Stripe's Refunds API, keyed on the
  payment intent stored at checkout. Must be server-side and idempotent — the
  client must never be able to trigger or size a refund.
- A `refund_own_booking` / provider-side SECURITY DEFINER RPC that re-verifies
  ownership and eligibility server-side, same shape as `cancel_own_booking()`.
  The refund amount must be computed server-side from the snapshot policy, not
  passed in.
- `payment_status` transitions to `refunded` / a new `partially_refunded`, plus
  the amount actually returned. The `refunded` value is already referenced by
  the reminder-job queries, so the enum exists but is currently never written.
- Client and provider notifications for the refund, trigger-owned like every
  other booking status notification (see memory
  `booking-notifications-architecture` — do not add an app-side insert).
- Client-facing copy on the cancel modal stating what will and won't come back,
  *before* they confirm — `BookingDetailScreen.tsx`'s cancel modal already
  branches on the notice window and is the right place for it.
- Terms & Conditions wording to match, flagged not drafted.

Blocked on item 1: pointless to build until real payments are actually flowing.
But item 1 must not ship without it.

## 2. RESOLVED — account deletion grace period is 30 days

Migration `20260810152938_account_deletion_grace_period_30_days` was deployed
and verified against the linked database on 2026-08-10. The purge threshold is
now 30 days, and public execution of the cron-only function is revoked.

```sql
-- inside public.process_scheduled_account_deletions()
AND deletion_requested_at <= NOW() - INTERVAL '30 days'
```

The cron schedule was not changed. An end-to-end deletion/reactivation journey
is still worth verifying before release: request deletion on a test account,
confirm reactivation is available during the window, then verify the cron job
(`process-scheduled-account-deletions`, runs 03:00 UTC daily) actually purges
an expired test account and reactivation-on-login stops being offered.

---

## 3. Overlap-prevention constraint — DEPLOYED 2026-08-03, future-only scope

`prevent_overlapping_bookings.sql` Steps 0–4 are live (buffer-padded
`effective_start`/`effective_end` columns + trigger, backfilled for all 91
existing bookings). **Step 5 is now live too**, but scoped to future
bookings only — see below for why.

Re-verified on 2026-08-03: same 7 pairs as originally found (no new
conflicts since 2026-08-02), all already in the past. Breakdown:

- **5 pairs, provider `b6f60c71-4df6-4822-a3b5-331af4554cce`**: genuinely
  buffer-induced. `providers.buffer_mins` = 15 for this provider, set
  (`updated_at` = 2026-08-03) after all 5 bookings were already created
  (created 2026-07-14 to 2026-07-30) — confirms the "buffer set after
  scheduling" theory for this provider.
- **2 pairs, provider `0f79c563-ed54-43e4-a056-3c8e7e4e321c`**: NOT
  buffer-induced — `buffer_mins` = 0 for this provider, and the raw booking
  times themselves overlap with zero padding (12:30–13:30 vs 13:00–14:00,
  and 16:00–18:00 vs 15:00–17:00 on 2026-07-16). These are genuine
  historical double-bookings, distinct from the other 5.
- All 12 bookings involved have `service_id = NULL` (custom bookings), so
  service-level buffer overrides never applied — only `providers.buffer_mins`
  is in play.

Postgres rejects `now()` inside an EXCLUDE constraint's `WHERE` predicate
(`functions in index predicate must be marked IMMUTABLE`), so the scoped
constraint actually deployed uses a fixed cutoff instead of a moving `now()`:

```sql
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_no_overlap;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    provider_id WITH =,
    tsrange(effective_start, effective_end) WITH &&
  ) WHERE (status NOT IN ('cancelled', 'no_show') AND effective_end > '2026-08-03'::timestamp);
```

This protects every booking ending 2026-08-03 onward; the 7 historical
pairs (all ending before the cutoff) are grandfathered and excluded from
enforcement — no manual resolution was applied to them. App-side handling
for the `23P01` exclusion-violation error was confirmed already wired up
(create booking path in `BookingContext.tsx`, reschedule-confirm path in
`RescheduleScreen.tsx`) before this was enabled, so no app changes were
needed.

**Still open, lower priority:** the 2 genuine `0f79c563` double-bookings
were left as historical record, not resolved/apologized for — that's a
business decision (contact the client/provider) that wasn't made in this
pass. The 5 `b6f60c71` pairs are believed to be a stricter-than-needed
buffer setting rather than real conflicts, also not confirmed with the
provider.

---

## 4. waitlist_holds.sql was patched before deploying — verify in-app

The source file's `handle_new_booking()` was written against a stale
baseline (predates `recipient_role` tagging and the auto-accept dedup fix)
— running it verbatim would have reverted both. The deployed version keeps
the file's only intended change (an `on_hold` early-return guard) on top of
the actual current function body; everything else in the file deployed as
written.

**Before launch:** test the waitlist invite path end to end — join a
waitlist, cancel the matching confirmed booking, confirm the waitlisted
client gets a real held (`on_hold`) booking (not just a notification),
confirm it expires and cascades to the next candidate, and confirm
claim/decline both work. **The full procedure, the four silent
preconditions and the watch query are in section 18 below** — written up
2026-08-27 after a static pass, and still not run.

Two details above were stale and are corrected there: the hold is **15
minutes**, not 3 hours (`20260827120519_waitlist_hold_fifteen_minutes`),
and `expire_waitlist_holds()` already runs every minute on cron jobid 155,
so forcing it by hand is rarely necessary.

Also update `supabase/waitlist_holds.sql` itself to match what's actually
live, so the file isn't misleading for the next person who reads it.

---

## 5. RESOLVED — `provider_busy_spans_rpc.sql` is deployed; verify the client journey

**Verified in the linked database on 2026-08-10:**
`public.get_provider_busy_spans` exists. The deployment blocker is resolved;
the remaining release task is to verify the client booking journey against a
known occupied provider slot.

`supabase/provider_busy_spans_rpc.sql` adds `get_provider_busy_spans()`.
`AvailabilityService` now routes all
six of its booking-conflict reads through it.

Why it exists: `bookings` has no public SELECT policy, so every client-side
conflict check was reading **zero rows** for any provider the client wasn't
already booked with — the slot picker showed already-taken slots as bookable,
and the client only found out when checkout was rejected. Never a
double-booking hole (the `bookings_no_overlap` constraint and
`enforce_booking_bookability()` both enforce server-side), but a bad bug in
the main booking path.

`fetchBusySpans()` deliberately throws when the RPC is absent rather than
silently reverting to always-empty booking reads. That still protects any
environment where this migration has not been applied.

Verify after deploying: as a CLIENT (not the provider), open a provider's
booking calendar on a day you know has a booking, and confirm the taken slot
is greyed out rather than offered.

---

## 6. Carried over from existing notes (not new today)

- Stripe payment-intent integration (`stripeService.ts` + edge functions,
  landed 2026-08-02) still needs `cerviced-security-review` +
  `cerviced-legal-flagger` — see memory.
- `CartScreen.tsx`'s `PaymentModal` collects raw card fields instead of
  tokenizing through Stripe/Adyen — not production-ready as-is.
- No Privacy Policy screen, no age-verification flow — see
  `LEGAL-COMPLIANCE-NOTES.md`.

---

## 7. Fixed 2026-08-04 — reschedule-request forgery + cart checkout slot hold

Two gaps flagged in earlier sessions were resolved this session:

- **`booking_reschedule_requests` RLS forgery gap** — its
  `reschedule_user_all`/`reschedule_provider_all` policies had no
  `WITH CHECK`, letting a client forge `status='provider_responded'` via a
  direct `.update()` (bypassing the app's provider-only
  `respondToRescheduleRequest`), which `confirm_reschedule_own_booking()`
  then trusted without independent verification. Fixed via
  `supabase/fix_reschedule_request_rls_forgery_gap.sql`: two new
  `SECURITY DEFINER` RPCs (`respond_to_reschedule_request`,
  `provider_initiate_reschedule`) that re-verify provider ownership
  server-side, plus the two permissive policies replaced with SELECT-only
  ones — every write now RPC-only, same shape as `bookings` itself.
- **No slot hold during cart checkout** — between a client tapping
  "Confirm & Pay" and the booking actually being inserted (full review +
  payment-sheet interaction, unbounded, client-paced), the slot wasn't
  reserved at all. Fixed via `supabase/fix_cart_checkout_slot_hold.sql`:
  reuses the `on_hold`/`hold_expires_at` mechanism `waitlist_holds.sql`
  already added, with a new `hold_batch_id` column correlating a whole
  cart's held rows. `CartScreen.tsx` reserves all items atomically
  (`holdCartCheckoutSlots`) right when the user commits to payment, then
  either claims the batch on success or releases it if they back out. A
  10-minute TTL swept every 5 minutes (`expire_cart_holds` cron job) is the
  real backstop — no reliable client-side "payment abandoned" signal exists
  (neither payment modal passes `onRequestClose`, there's no
  `BackHandler`/`AppState` listener near checkout, and Stripe's own Payment
  Sheet `'Canceled'` dismiss bypasses the app's normal close/failure
  handlers entirely — the fix adds an explicit `onClose()` call there so
  release still fires for that path specifically).

Both `tsc`-clean. Golden-path exercise (add multi-provider cart, checkout,
back out before paying, confirm slot frees immediately) still pending —
see memory `cart-checkout-slot-hold.md` for the full design record.

---

## 8. Unresolved iCloud-duplicate files — 7 need a human call (2026-08-26)

This repo lives under `~/Desktop`, so iCloud resolves a conflicting write by
forking a numbered copy — `shuffle 2.ts` next to `shuffle.ts`. A `Stop` hook
running `git add -A` on every turn had been committing them indiscriminately;
that hook is now removed (see CLAUDE.md, "Committing").

Commit `1c4eb19` deleted the 33 that were byte-identical to their counterpart
and referenced by nothing. 15 were then deliberately left tracked, each needing
someone to say which version is real. Do not resolve them by glob or by
filename heuristic; that is exactly what would destroy the legitimate ones.

**Update 2026-08-26: eight of the fifteen were migrations, and all eight are
resolved.** The pairing below was wrong in the reassuring direction — see 8c.
Seven were deleted then; the eighth (the waitlist fork) was held back on
purpose — and was **deleted 2026-08-27 at the repo owner's direction**, see 8d.

### 8a. Four differ from their counterpart — decide which is current

| File | Counterpart |
|---|---|
| `tsconfig 2.json` | `tsconfig.json` |
| `src/features/business-details/options 2.ts` | `options.ts` |
| `src/tests/addressReleasePolicy.test 2.ts` | `addressReleasePolicy.test.ts` |
| `assets/images/background 2.png` | `background.png` |

The two source files are the *pre-edit* copies of files that were being changed
when the fork happened (`options.ts` gained mobile address-release timings on
2026-08-20), so the un-numbered file is almost certainly current — but confirm
rather than assume.

The two migrations that used to sit in this table —
`20260817160000_manual_booking_extra_minutes 2.sql` and
`20260819001800_deduplicate_push_delivery 2.sql` — **are resolved and deleted
(2026-08-26).** Each differed from its same-version counterpart by exactly one
thing: a seven-line `PROVENANCE:` header the canonical file gained during the
2026-08-20 reconciliation. SQL bodies byte-identical, so the un-numbered file
was unambiguously current. Neither has a row in
`supabase_migrations.schema_migrations`, which is what their own provenance
header says (both applied out-of-band via the SQL editor) — verified live.

### 8b. Three are NOT duplicates — leave them alone

`assets/logos/iPhone 14 & 15 Pro Max - 3.png`, `- 7.png`, `- 8.png` are real
filenames that merely look like the collision pattern. This is why the
`.gitignore` rule is scoped to source extensions and never covers assets.

### 8c. Six migrations that "have no un-numbered counterpart" — they all did

**Resolved 2026-08-26. The claim in this section was wrong**, and wrong in the
direction that makes you relax: it said the numbered file was the only copy of
each, so deleting it would lose the migration outright.

That conclusion came from pairing on filename-minus-` 2`. Pair on the *stem*
instead and every one has a byte-identical counterpart under a **different
version prefix** — these are renumbering artifacts, the fork keeping the
pre-renumber number. All six canonical versions are recorded live:

| fork version | identical canonical | recorded live |
|---|---|---|
| `20260817110000_fix_pregnancy_safe_default` | `20260817084930` | yes — **RESTORED, see 8d** |
| `20260817120000_replace_my_provider_specialties` | `20260817125241` | yes |
| `20260817140000_manual_booking_category_snapshot_parity` | `20260817144603` | yes |
| `20260817150000_manual_booking_scheduling_policy_override` | `20260817152938` | yes |
| `20260818105725_prevent_self_booking` | `20260818105903` | yes |
| `20260817110500_waitlist_lapse_and_exhaustion_notifications` | `20260817103049` | yes — **RESTORED, see 8d** |

Four deleted (the two named above were restored 2026-08-27 — see 8d).
Nothing was lost: each is byte-identical to a file that remains,
and each is recorded exactly once live under the canonical version, verified by
querying `supabase_migrations.schema_migrations` directly rather than reading
files. No fork version has a row of its own.

The general lesson is the one that made this worth writing down: a numbered
copy of a *migration* can differ from its original by its version number alone,
and that number is the entire payload. Pairing by filename hides it.

### 8d. The two armed forks — deleted, then RESTORED 2026-08-27

`supabase/migrations/20260817110500_waitlist_lapse_and_exhaustion_notifications 2.sql`

Byte-identical to `20260817103049_...`, like the other five — but it is the only
one of the eight whose fork version sorts **after** a later migration that
supersedes one of its functions.

`invite_next_waitlist_entry()` is defined by `20260817103049`, then fixed nine
minutes later by `20260817104009_fix_waitlist_selection_method_hook.sql`, which
adds `v_selection_method` reading `booking_policies->>'waitlistSelectionMethod'`.
The fork carries the **pre-fix** body under version `110500`, which replays
*after* `104009` — silently reverting the selection-method plumbing with no
error and no conflict. That is the exact `CREATE OR REPLACE` failure mode
`supabase/MIGRATION_OWNER.md` exists to prevent, sitting in the tree armed.

The other five forks all sort *before* whatever supersedes their functions, so
an ordered replay overwrites them harmlessly. This one does not.

Risk is fresh-environment replay only — nothing was wrong live. It was left in
place at the repo owner's direction, with a note not to delete it without
saying so.

**Deleted 2026-08-27, at the repo owner's explicit direction** (they raised this
exact file and asked for it to be fixed). Saying so here, as that note asked.
Verified before removal rather than trusted: byte-identical to
`20260817103049`, which contains no `v_selection_method` at all, while
`20260817104009` adds it — so the fork's only possible effect on an ordered
replay was to reinstate the pre-fix body. Nothing unique was lost.

**A second fork turned out to be armed the same way, and worse.**
`20260817110000_fix_pregnancy_safe_default 2.sql` was listed in 8c as a
harmless earlier-sorting duplicate. It is not: it sorts **after** its canonical
`20260817084930`, and its body is not a `CREATE OR REPLACE` but a data write —
`UPDATE public.services SET is_pregnancy_safe = true WHERE is_pregnancy_safe =
false`. The file's own comment claims "Safe to re-run"; it is not, because it
flips every explicitly-false row to true. On a fresh ordered replay it runs
last and silently marks every service a provider flagged as *not* safe during
pregnancy as safe — health-adjacent data, inverted, with no error. Deleted
2026-08-27 in the same pass.

The correction to 8c's rule: "sorts earlier, therefore harmless" only holds for
`CREATE OR REPLACE` bodies. A migration containing a **data write** is
dangerous at *any* position, because replaying it re-applies the write to
whatever the data looks like then — not to what it looked like when the
migration was authored. Check what a fork *does*, not just where it sorts.

**Status: both were RESTORED on 2026-08-27, at the repo owner's direction
("restore all"), and both are tracked again.** The analysis above stands
unchanged and is why this is flagged rather than closed — restoring them puts
both hazards back in the tree:

  * the waitlist fork replays a pre-fix `invite_next_waitlist_entry()` after
    the migration that fixes it;
  * the pregnancy fork re-applies `UPDATE public.services SET
    is_pregnancy_safe = true WHERE is_pregnancy_safe = false` at a position
    *after* its own canonical. Its header comment claims "Safe to re-run",
    which is exactly wrong: re-running it flips to TRUE any row a provider has
    since set to FALSE. Verified by reading the restored file, not from this
    note.

Neither affects the live database as it stands — the risk is an ordered
replay into a fresh environment. Both files being present is a deliberate,
recorded choice, not an oversight. Do not "tidy" either away without asking,
and do not replay this directory into a new environment without deciding what
to do about them first.

---

## 9. Vault generator forks its output instead of overwriting (2026-08-20)

`docs/vault/auto/` holds 83 tracked, generated files — and, at the time of
writing, **1,008 untracked numbered forks** of them: 72 screens duplicated up
to 16 times each (`AboutScreen 2.md` … `AboutScreen 16.md`). CLAUDE.md has
flagged this pattern since it was two files; it is now three orders of
magnitude bigger.

They are now gitignored (`docs/vault/auto/**/* [0-9].md`), so they no longer
show up as untracked noise or risk being swept into a commit. **That is
containment, not a fix** — the forks are still sitting on disk, and the count
grows every time the generator runs.

**The actual fix** is in `scripts/gen-vault.mjs`: make regeneration overwrite
each file in place rather than writing a numbered sibling when the target
exists. Worth checking whether iCloud is the cause here too (the same
`~/Desktop` sync collision behind section 8) rather than the script's own
write logic — if it's iCloud, the script needs to write atomically, or the
vault output needs to live outside the synced tree.

Deleting the 1,008 existing forks is safe whenever you want — everything in
that directory is regenerated from source — but do the generator fix first, or
they simply come back.

## 10. Component decision guide — pick a winner per category, write it into DESIGN_SYSTEM.md (2026-08-20)

`DESIGN_SYSTEM.md` documents palette/typography but has no "what component to
use when" guide — e.g. which of the app's several alert/modal styles is *the*
one for an informational message like "this time is no longer available."
InfoRegScreen's redesign needs this decided first so it doesn't add a new,
one-off variant.

A full-app survey found real, already-consistent patterns alongside genuine
silent drift — several component jobs have 2-4 unmerged implementations doing
the same thing, sometimes coexisting in the same file:

- **Quick informational alerts** — 4 variants: `useAppDialog`'s
  blurred bottom sheet (`showAlert`), two independently hand-copied centered-card
  families (`UserProfileScreen`/`ProviderAccountScreen` vs. `BookingDetailScreen`/
  `BookingsScreen`), and raw `Alert.alert` — 203 call sites across 32 files,
  unthemed, winning purely by inertia.
- **Toasts** — 3 families: `AppDialog`'s floating+blurred, `ProviderPromotionsScreen`'s
  near-identical floating-unblurred cousin (hand-rolled in the same file that
  also imports the real `useAppDialog` hook), and a non-floating inline
  banner used in 3 provider screens.
- **Tabs** — the healthiest category: `SlidingTabs` (10 screens) and
  `CategoryTabPill` (3 screens) are both genuinely shared and self-documented
  in code comments as deliberate. Only loose thread: an underline-tab style
  exists twice (`ExploreScreen`'s `SubTabBar`, `ProviderIntakeFormScreen`'s
  `tabBar`) with no shared code between the two copies.
- **Cards** — border radius scattered across 8 independent literals
  (12/15/16/18/20/22/26/32), no shared token backs any of them; 18px shows up
  in three unrelated files but by coincidence, not a shared constant. Shadow
  treatment is similarly inconsistent (some cards own explicit shadow/elevation,
  some rely purely on a BlurView, `ProviderCard` doesn't own either — both are
  injected per call site).

A side-by-side visual comparison of every variant (rendered with the app's
real palette and fonts) was published as an Artifact during this audit —
ask in-session for the link if it's needed again, since Artifact URLs aren't
recorded in this file.

**Next step:** pick one winner per category (alerts, toasts, the underline-tab
duplication), and optionally a canonical card radius/shadow formula, then write
the decision into `DESIGN_SYSTEM.md` as an explicit "use X for Y situation"
guide. Not blocking launch, but do it before InfoRegScreen's redesign so that
work has a real target to build against instead of adding a fifth variant.

---

## 11. Go-live gate — nothing ever un-publishes, and two checklists disagree (2026-08-23)

Verified against the live DB, not the SQL files. `check_and_set_provider_live()`
has exactly three gates, all required:

1. an open day — a `provider_availability` row with `is_closed = false`
2. at least one row in `services`
3. `provider_private_details` with a non-blank `full_address` **and** non-null
   `latitude` **and** `longitude`

Logo is not gated; the function never reads `logo_url`. It re-runs from four
triggers: `on_provider_availability_upsert`, `on_availability_window_change`,
`on_provider_address_change`, `on_provider_service_insert`.

**Live data is currently clean** (checked 2026-08-23): 4 live providers, none
violating a gate, none eligible-but-unpublished. Both items below are latent,
not active — which is exactly why they're easy to miss until they aren't.

### 11a. A provider can never be un-published

`check_and_set_provider_live()` only ever flips `false → true` (its WHERE has
`AND p.has_gone_live = FALSE`), and all four triggers are INSERT/UPDATE — there
is **no DELETE trigger** on `services` or `provider_availability`. So:

- a live provider who deletes their last service stays live and bookable with
  nothing to book;
- one who closes every day of the week stays live with no slots.

Only `delete_provider_profile()` and `dev_reset_provider()` ever set the flag
back to false.

**Needs a product decision before it's built, not just a trigger.** Silently
un-publishing someone mid-trade is aggressive — the options are un-publish
outright, un-publish + notify, or leave published and surface a warning. Pick
one first; the SQL is the easy half.

### 11b. Profile Health is not a go-live checklist, but reads like one

Two checklists exist and only one mirrors the gate:

- **`ProviderHomeScreen`'s go-live card — correct.** Three gating rows plus
  "add your logo (optional)", and it checks the address through
  `hasMyProviderGoLiveAddress()` (`full_address` + lat + lng), the same test
  the server runs. It also reads the DB's own `has_gone_live`, so an
  all-ticked-but-unpublished provider is told the address didn't geocode
  rather than being left staring at a complete list.
- **`ProviderMyProfileScreen`'s PROFILE HEALTH (`profileReadiness`) — a
  profile-*quality* checklist.** Its 7 items are logo, intro, location,
  services & prices, portfolio photos, booking policies, T&Cs. Against the
  three real gates:
  - **weekly schedule is absent entirely** — and it's the hard blocker (no
    schedule means no bookable slots at all);
  - **"add your location" checks the wrong field** — it reads
    `providerData.location`, mapped from `providers.location_text`
    (`profileMapper.ts:51`), the vague *public* string. The Home card
    explicitly rejects location_text as insufficient, since it's already
    required just to save a profile;
  - only "add services and prices" genuinely overlaps a gate.

**Next step:** either add a schedule row and point the location item at the
geocoded address so the two agree, or relabel Profile Health so it doesn't
read as a launch gate. Don't leave them silently disagreeing — a provider who
completes Profile Health can still be unpublished and have no idea why.

## 12. RESOLVED — `send-email` was an open relay; the function no longer exists

`supabase/functions/send-email/index.ts` is deployed with **`verify_jwt =
false`** (confirmed live 2026-08-24) and takes a caller-supplied `to`,
`subject` and `html`, which it passes straight to Resend as
`CERVICED <noreply@cerviced.co>`. There is no auth check, no allowlist, and no
rate limit.

The anon key is public by design — it ships inside the app binary — so anyone
who pulls it out can send arbitrary HTML email from the project's verified
sending domain, to any address, with CERVICED branding on it. That is a
phishing kit and a fast route to `cerviced.co` being blocklisted by receiving
mail providers.

This matters immediately because the newly wired support address
(`support@cerviced.co`, see §12 follow-ups below) shares that sending domain's
reputation: burning it takes the support inbox down with it.

Callers today are all legitimate and all authenticated at the point of use —
`src/services/emailService.ts` → `invokeSendEmail`, used for the booking
confirmation email (`BookingContext.tsx:1882`) and the two welcome emails
(`EmailVerificationScreen.tsx:158`, `SignUpStep5Screen.tsx:225,253`). Nothing
depends on the function being anonymous, **except** the sign-up welcome path,
which needs checking: if it runs before the session exists, flipping
`verify_jwt` on will break it, and it should move server-side (a DB trigger or
the confirm-email function) rather than stay anonymously callable.

**FIXED 2026-08-24** (send-email v7). Two layers:

1. `verify_jwt = true` — the gateway rejects a missing header, and the
   function additionally rejects the anon key itself, since an anon JWT is
   accepted by the gateway but resolves to no user.
2. The recipient must be an address already on the caller's own account —
   `user.email`, `users.business_email`, or `providers.email`, all read
   server-side and never from the request. A mismatch is a logged 403.

(2) is what removes the phishing value: branded HTML delivered to your own
inbox is not an attack. Verified live — the exact call that worked before now
returns 401 with the anon key and 401 with no header.

Live data backed the design: across 63 bookings, `customer_email` differed
from the client's account email in **zero** cases, so no legitimate caller is
broken by a self-only allowlist.

**Watch on the next signup:** the welcome email in `EmailVerificationScreen`
fires immediately after `verifyOtp`. If the client session isn't attached yet
it will now 401 — visibly, via `logger.error`, rather than silently.

**CLOSED PROPERLY 2026-08-26.** The lockdown above was the stopgap; this is
the fix. Templates moved to `supabase/functions/_shared/emailTemplates.ts`,
the booking confirmation became a DB trigger, and welcome mail went to
`send-account-email` — at which point `send-email` had zero callers and was
**deleted from the project**. `POST /functions/v1/send-email` now returns 404.

There is deliberately no general-purpose "send this HTML to that address"
endpoint any more. Every email path names an event; the server picks the
recipient and the wording. That is the property worth preserving — do not
reintroduce a generic sender for convenience.

### 12a. Support requests have no rate limit

`send-support-request` requires a signed-in user and can only ever mail
`support@cerviced.co`, so the blast radius is spam into our own inbox from an
identifiable account — acceptable for now, deliberately not solved. If it
becomes a problem, the cooldown pattern in `request-claim-verification`
(a `*_last_sent_at` column checked before sending) is the shape to follow, and
would need a `support_requests` table to hang off.

## 13. RESOLVED 2026-08-24 — no email had ever been sent: `cerviced.co` was unverified in Resend

Calling the live `send-email` function returns, verbatim:

> `The cerviced.co domain is not verified. Please, add and verify your domain
> on https://resend.com/domains`

Resend refuses every send from `noreply@cerviced.co`. That means **all four
outbound emails in the app have always failed**, and always will until the
domain is verified:

- booking confirmation — `src/contexts/BookingContext.tsx:1882`
- client/provider welcome — `src/screens/auth/SignUpStep5Screen.tsx:225,253`
- welcome on verification — `src/screens/auth/EmailVerificationScreen.tsx:158`

Nobody noticed because **every one of them was fire-and-forget with a
swallowed error** (`.catch(() => {})`) — neither shown nor logged, a direct
violation of the error-handling rule in `error-message-sweep`.

**FIXED 2026-08-24 on both counts.** The domain is verified (delivery
confirmed live), and all four sites now `logger.error` on failure. They stay
fire-and-forget on purpose — a confirmation email must never block or fail a
booking that already exists — but a failure is now visible instead of
invisible, which is the property whose absence hid this for months.

**Fix (DNS, not code):** add `cerviced.co` at https://resend.com/domains and
publish the DKIM/SPF records it issues. Resend scopes its SPF and return-path
MX to the `send.cerviced.co` subdomain, so **the Zoho MX records on the root
domain stay untouched and receiving keeps working** — do not delete them.
Verify with:

```
curl -s -X POST "https://<project>.supabase.co/functions/v1/send-email" \
  -H "Authorization: Bearer $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"to":"support@cerviced.co","subject":"test","html":"<p>test</p>"}'
```

(That this is callable with only the public anon key is §12, the open relay.)

---

## 14. Reschedule expiry can leave the client unable to cancel (2026-08-26)

Deferred by decision, not oversight — logged here so it is not rediscovered
the hard way. Full analysis and the two candidate fixes are in
`FUTURE_SCALE.md`; the behaviour it sits on top of is `BOOKINGS.md` §7a.

Reschedule expiry shipped 2026-08-26: if a provider never answers, the request
expires and the booking stays exactly as scheduled. **Cancelling is judged by a
separate, unconnected clock** — `cancel_own_booking()` reads
`providers.cancellation_notice_hours`, falling back to
`booking_policies->>'cancelNotice'`, and hard-blocks with `This provider
requires N hours notice to cancel`.

So a client acting entirely in good time can end up able to do neither:

| | 24h cancel notice | 72h cancel notice |
|---|---|---|
| Appointment | 2pm Wed | 2pm Wed |
| Client asks to reschedule | 2pm Tue (allowed) | 2pm Sun (allowed) |
| Provider ignores it | | |
| Request expires | midnight Tue→Wed | midnight Tue→Wed |
| Time left | ~14h | ~14h |
| Can still cancel? | **No — needs 24h** | **No — needs 72h** |

At the moment they asked, the client still had their full cancellation right.
By the time the provider's silence resolved into an answer, they had lost it —
the provider's non-response consumed a right belonging to the client. Their
remaining options are attend an appointment they tried to move, or no-show,
and a no-show inside 24h increments `late_cancel_count` on
`client_provider_reliability` — so the provider's silence ends up recorded
against the **client's** reliability.

Worse the longer the provider's notice period: a 72h provider opens a ~58h gap
between "you could still have cancelled" and "you now can't".

**Why it is not built:** one of the two fixes is granting a no-penalty
cancellation, which needs a refund answer, and there is no refund logic
anywhere in the app (§1b above). It is a product/legal call — see
`LEGAL-COMPLIANCE-NOTES.md` §12. Do not pick a default unilaterally.

---

## 15. `replace_provider_weekly_schedule` is parked, not missing (2026-08-26)

`supabase/migrations/20260823065212_atomic_provider_weekly_schedule.sql` is
**deliberately unapplied**. It defines `replace_provider_weekly_schedule()`,
which makes the two halves of a weekly-schedule save (legacy day rows + v2
working windows) one transaction.

It was never applied live, but `databaseService.ts` had already been changed to
call it — so **every provider attempt to save their hours failed with "function
not found"**, and since a weekly schedule is one of the three go-live gates,
that silently blocked new providers from publishing at all.

Fixed 2026-08-26 by removing the app-side dependency: `saveProviderWeeklySchedule()`
does the two writes directly again (one batched upsert for the seven day rows,
then `replaceProviderAvailabilityWindows`). Provider scheduling works.

**The tradeoff that is now live:** those two writes are not atomic. A failure
between them leaves day rows and windows out of step. It is recoverable rather
than silent — both throw, the screen keeps its `dirty` flags and asks the
provider to retry, and a retry re-sends the whole schedule over whichever half
landed. Windows are written second so a partial failure can never publish a
provider against a schedule that isn't there.

**To close this out:** apply the migration as part of the provider terms &
policy work and restore the RPC call — the signature is unchanged, so it is a
one-line revert. Do not apply it on its own to "tidy up the drift"; the file
carries a header saying the same.

---

## 16. Consultation-before-first-booking is built but unreachable (2026-08-28)

`providers.consultation_required_new_clients` is live (`NOT NULL DEFAULT
false`), it is **read** by `databaseService.ts` (~line 5596) to decide which
providers require a consultation, and `BookingSheet.tsx` (~line 732) has the
whole client-facing flow already built: it tells the client *"This provider
requires a consultation before your first booking with them"*, resolves the
next available slot for it, and adds it to the booking **as a charged line
item**.

**No screen anywhere writes the column.** `updateProviderContactDetails`
already accepts the key (`databaseService.ts` ~line 7162) — nothing ever
passes it. `AboutYouScreen` edits `online_consultations_available`, which is a
different column, and stops there. The only SQL reference is the original
`supabase/consultation_settings.sql` that added it.

Live as of 2026-08-28: **0 of 6 providers have it true**, and no provider has
any way to turn it on. The feature has never been reachable.

**To close this out:** add a toggle to `AboutYouScreen` beside the existing
online-consultations toggle, writing `consultation_required_new_clients`
through `updateProviderContactDetails` (the patch type already allows it).
Before shipping it, confirm what the charged consultation does to the deposit
and cancellation maths in the cart — this adds a second paid service to a
first-time booking, and that interaction has never run in production.

---

## 17. No provider has a recorded T&C acceptance, and the Policies tick box is decorative (2026-08-28)

Two halves of the same gap.

**The tick box records nothing.** `PoliciesScreen`'s "I agree to the Terms &
Conditions" checkbox is local `useState` only (`termsAcknowledged`). It is
never persisted and never read, so it resets to unchecked on every visit and
ticking it has no effect. The in-code comment says this is deliberate — it is
a re-affirmation, not a gate, and Save works either way — so this is only a
problem in combination with the second half.

**Nothing else recorded one either.** `providers.terms_accepted_at` is
stamped once, on first publish, inside `saveProviderToSupabase` (insert path
only, gated on `InfoRegScreen`'s own checkbox). That design is correct — an
edit-save never overwrites or clears an existing acceptance. But live as of
2026-08-28, **0 of 6 providers have a non-null `terms_accepted_at`**, so there
is currently no stored evidence that any provider on the platform accepted the
terms.

**This is a legal question, not an engineering one** — per `CLAUDE.md`, flag
rather than draft. Decisions needed before anything is built:
- Does an acceptance need to be recorded per T&C *version*, rather than once
  ever? If the terms change, a single first-publish timestamp says nothing
  about the current wording.
- Should the existing 6 providers be asked to accept on next launch, or is a
  backfill acceptable?
- Should the Policies re-affirmation write a timestamp (making it meaningful),
  or be removed (making it honest)? Right now it is neither.

See `LEGAL-COMPLIANCE-NOTES.md` — this belongs on that punch list too.
---

## 18. The waitlist has never fired, and its one failure mode is silent (2026-08-27)

Static read complete, **live test not run.** Nothing here is known to be
broken — the point is that nothing here is known to *work* either, and the
code is written so those two look identical from the outside.

### 18a. Zero invites ever sent, and that is explained

Live as of 2026-08-27: **3 `provider_waitlist` rows have ever existed**, all
now `cancelled`, newest 8 July. **0 currently `waiting`**, 0 bookings have
ever carried a `waitlist_entry_id`, and 0 `waitlist_slot_available`
notifications have ever been sent.

The wiring itself is complete — `joinWaitlist()` is reachable from
`ProviderProfileScreen` and Becca's `joinWaitlistAction`, and the invite
inserts an `on_hold` booking plus its own notification. So the zero is
**non-exercise, not breakage**: nothing has ever been eligible to invite.

The obvious suspect was ruled out: `waitlist_slot_available` **is** present
in `notifications_type_check`, so this is *not* a repeat of the
`reschedule_expired` break, where the type was missing and every insert was
rejected.

### 18b. The real defect — `EXCEPTION WHEN OTHERS THEN CONTINUE`

Each loop iteration of `invite_next_waitlist_entry()` ends with a bare
`EXCEPTION WHEN OTHERS THEN CONTINUE`. Any failure inside — a rejected
notification insert, a constraint violation, anything — rolls that iteration
back, moves silently to the next entry, and eventually returns `FALSE`.

No error, no log, no row. **If the waitlist ever fails in production, the
only symptom is that nobody was invited** — which is byte-for-byte
indistinguishable from nobody being eligible, i.e. from the state it is in
right now. That is exactly why 18a's zero could not be read either way until
`provider_waitlist` itself was checked.

Worth fixing regardless of the test: at minimum re-raise, or record the
failure somewhere, rather than swallowing.

### 18c. How to test it (not yet done)

`invite_next_waitlist_entry()` is **never called by app code.** It fires only
from the `handle_booking_status_change` trigger, at two sites:

- a **pending** booking → `cancelled` (provider declines it)
- a **confirmed** booking → `cancelled` (either side cancels)

The second site explicitly excludes `OLD.status = 'on_hold'`, so an expiring
hold does not re-invite from there — `expire_waitlist_holds()` (cron jobid
155, every minute) owns that cascade separately.

**Four preconditions, all of which fail silently:**

1. Provider's `automation_settings->>'waitlistEnabled'` must not be `false`
   (defaults true).
2. The cancelled booking must have non-null `booking_date` **and**
   `booking_time`.
3. The waitlist entry must be `status = 'waiting'`, and its `service_id`
   must either match the cancelled booking's service or be `NULL`.
4. If the entry has `preferred_dates`, the cancelled booking's date must
   fall inside that range. **Join with "Anytime"** so this can't be the
   thing that fails.

**Setup.** The client-side Waitlist button only renders once a service is
confirmed to have nothing bookable within 14 days. `DEBUG_FORCE_FULLY_BOOKED`
in `src/screens/client/ProviderProfileScreen.tsx` (currently `false`) forces
every service into the fully-booked state for exactly this purpose. Set it
back afterwards.

**Steps.**

1. Client A → provider profile → **Waitlist** on a service → **Anytime** → join.
2. Client B holds a *confirmed* booking with the **same provider and service**,
   any future date.
3. Cancel that booking.
4. Client A should get the "A slot opened up!" push and a hold in Bookings
   with Confirm / Decline (`claimWaitlistHold` / `declineWaitlistHold`).
5. **The hold is 15 minutes** — do step 4 promptly or the cron reclaims it
   and cascades to the next person.

If the provider has `autoAcceptWaitlist` on, the flow differs by design:
client A gets a `pending` booking outright and **no notification at all**.

**Watch query** — run before step 3 and again after:

```sql
select
  (select count(*) from provider_waitlist where status='waiting')  as waiting,
  (select count(*) from provider_waitlist where status='notified') as notified,
  (select count(*) from bookings where status='on_hold'
      and hold_expires_at is not null)                             as live_holds,
  (select count(*) from notifications
      where type='waitlist_slot_available')                        as invites_sent;
```

`invites_sent` going 0 → 1 is the pass condition. If `waiting` drops but
`invites_sent` does not move, that is 18b catching something real.

---

## 19. `cancel_notice_hours()` does not exist live — the applied migration is an older draft (2026-08-27)

Drift, not breakage, but it silently defeats the point of the migration that
introduced it and it makes `MIGRATION_OWNER.md`'s record wrong.

`supabase/migrations/20260827160000_cancel_window_closing_warning.sql` (committed)
defines `public.cancel_notice_hours(INT, JSONB)` as **the** single definition of
the cancellation-notice mapping, and rewrites
`process_cancel_window_closing_warnings()` to call it via two `CROSS JOIN
LATERAL`s — its own comment describes the previous draft as one that "repeated
the same CASE expression in the select list and in both time bounds."

**Live, that previous draft is what is running.** `cancel_notice_hours()` does
not exist in the database at all, and the live
`process_cancel_window_closing_warnings()` inlines the identical `CASE` four
times. An older version of the file was applied, and the file was improved
afterwards without being re-applied.

Nothing is down: cron `cancel-window-closing-warnings` (jobid 157) succeeds on
schedule and the two versions are functionally equivalent. But:

- The mapping is currently duplicated **five** times live (4× in the warning
  function, 1× in `cancel_own_booking()`), which is the opposite of what the
  migration was for.
- `MIGRATION_OWNER.md` marks this migration "verified live." That check
  confirmed the function *name*, the cron job and the constraint type — all
  genuinely present — but never diffed the function **body**. This is the same
  class of miss the file warns about two sections lower, arriving from a
  direction the warning doesn't name.

**So "step 2" is now three pieces, not one:** create the helper, re-apply the
refactored sweep, *then* rewire `cancel_own_booking()` to call it. Do it with
`pg_get_functiondef()` output in hand so `LANGUAGE` / `SECURITY DEFINER` /
`SET search_path` survive the reproduction.

**Blocked on the migration lock** — held by the client-area session as of
2026-08-27, and that is live work, not an abandoned claim. Do not apply
around it; see `supabase/MIGRATION_OWNER.md`.

## 20. LAUNCH FEATURE — Instagram-ready profile links (`cerviced.co/@handle`) (2026-10-02)

Not built yet; parked on purpose to ship with the public App Store launch.
Goal: a link a provider pastes into their Instagram bio that opens their
CERVICED profile.

**Decisions already made:**
- URL shape: `cerviced.co/@<handle>`, which can't collide with site pages.
- Handle = the existing `providers.slug`. It's unique (`providers_slug_key`),
  every provider has one, and `ProviderProfile` already opens by slug. Not
  editable for v1. Known wart: some slugs don't match a renamed business
  (Aestheticsby N is `glo-installs`); editable handles + old-handle redirects
  would be a separate follow-up.

**Still to decide:** what a visitor without the app sees. The recommended
option is a web preview page (name, logo, category, rating, plus "Open in
CERVICED" / "Get the app"); the alternatives are a waitlist redirect or a full
web profile.

**Why the web page matters:** Instagram opens bio links in its in-app browser,
which usually does NOT hand off to an installed app via universal links. The
web page has to work on its own, with the app hand-off layered on top.

**Build pieces:**
1. Web: `/@:handle` route on the cerviced.co Vercel site (`waitlist/`, deploys
   from `main`). Reads only `has_gone_live = true` public fields, never
   private/address data.
2. Universal links: `ios.associatedDomains` + Android `intentFilters` in
   `app.json`; `apple-app-site-association` and `assetlinks.json` served
   from cerviced.co. **Needs the Apple Team ID** and the Android signing
   SHA-256, plus a native rebuild. This works on TestFlight too, so it can be
   tested before launch.
3. App: route `https://cerviced.co/@x` and `cerviced://@x` to
   `ProviderProfile { providerId: slug }` (`RootNavigation.tsx` already
   listens for URLs, but only for Stripe returns).
4. Provider side: a "Your CERVICED link" card on Business Profile, with Copy
   and Share.
5. Fix the client Share button in `ProviderProfileScreen.tsx` `handleShare`,
   which currently shares the placeholder `https://app.yourapp.com/provider/<id>`.
6. At launch: point "Get the app" at the App Store / Play Store listing
   (waitlist until then).

Build on its own branch (`feat/profile-links`), branched off `main`.

## 21. LAUNCH FEATURE — home-screen widgets, iOS + Android (2026-10-02)

Not built yet; parked to ship with the public App Store launch, alongside §20.

**Widgets (decided):**
1. **Provider: Today's schedule.** Next client's first name, time and service,
   plus today's booking count. Tap opens the booking.
2. **Client: Next appointment.** Provider, service, date/time, countdown. Tap
   opens the booking.
3. **Client: Rebook favourite.** Logo of a saved provider; tap opens their
   profile ready to book. Needs the in-app URL routing from §20 step 3, so
   build that piece here if §20 hasn't landed.

**Libraries (checked 2026-10-02, both TypeScript, no Swift/Kotlin):**
- iOS: `expo-widgets` (Expo's own library, v57 matching SDK 57). It needs an
  App Group (`group.com.cerviced.app`).
- Android: `react-native-android-widget` (v0.22, peer `expo >= 54`).

Both are native changes: they need a dev-client/EAS build, not Expo Go.

**Architecture constraint:** widgets can't fetch or authenticate. All data
arrives as props the app writes (`updateSnapshot`/`updateTimeline`, then
`reload` on iOS). So:
- The snapshot is refreshed whenever bookings load or change in the app.
  Bookings made while the app is closed won't appear until it's next opened;
  silent push is a possible later step.
- Use a timeline so "next appointment" rolls forward without the app open.
- **Sign-out (and account deletion) must clear widget data.** Widgets come
  from account data, not the active hat: the provider widget fills only if
  the account has a provider profile, client widgets only if it has a client
  profile.
- Snapshot only `has_gone_live` providers for "rebook favourite".

**Privacy, flag before shipping:** the user chose to show the client's first
name, time AND service on the provider widget. Services can be
health-adjacent (aesthetics etc.), and widgets are visible on the home and
lock screen to anyone holding the phone. Mitigation to raise: on iOS, mark
the service text as privacy-sensitive so it's redacted while the phone is
locked. Run `cerviced-legal-flagger` / `cerviced-security-review` on it, and
consider a note in `LEGAL-COMPLIANCE-NOTES.md`.

Build on its own branch (`feat/home-screen-widgets`) off `main`.

## 24. Redeploying edge functions, and the late/no-show fees launch checks (2026-10-18)

Numbered 24 because §22 (Instagram handle verification) and §23 (saved cards)
are on unmerged branches.

**When to redeploy.** Nothing needs deploying right now: the live
`create-payment-intent` matches `main` as of `b6c0255` (late/no-show fees), and
`release-payouts`, `stripe-webhook`, `apply-cancellation-refund`, `booking-fee`
and `refund-payment` match `main` as of `38c6e8b9` (refund payout protection,
deployed 2026-10-18).
Redeploy only when:
- a change touches anything under `supabase/functions/` (including `_shared/`,
  which every function that imports it needs redeployed);
- the saved-cards branch merges into `main`. Then redeploy
  `create-payment-intent` and `client-saved-cards`, and check that the merge
  kept the fees' consent check and `setup_future_usage`;
- a change ships with a migration. Run the SQL first, then deploy.

Always deploy from an up-to-date `main`. A function deployed from an older
branch silently removes whatever `main` added to it, such as the fee payout
loop or the bank-dispute reversal.

```
cd ~/Desktop/CERVICEDD/CERVICED.
git checkout main && git pull
supabase functions deploy <function-name> --project-ref ztrfpfvvejzaysrelmfm
```

Run one line per changed function. Each ends "Deployed Functions…", and
"Docker is not running" is harmless. Before switching the shared folder to
`main`, make sure no other session has uncommitted work in it, or have Claude
deploy from a fresh copy of `main`.

**Late/no-show fees: before real customers.**
- [ ] Run the test-mode checklist end to end: set fees, tick box at checkout,
      charge late fee, charge no-show fee, dispute → keep, dispute → refund,
      declined card, 24h window closes, one fee per booking, fee payout released.
- [ ] Lawyer review of Terms §6, the checkout tick-box line
      (`src/constants/feeTerms.ts`) and the Privacy Policy saved-cards
      paragraph. See LEGAL-COMPLIANCE-NOTES §17.
- [ ] Put the same §6 wording on the website.
- [ ] Provider terms must say a bank chargeback is taken back from their payout.
- [ ] Rescheduled bookings pick up the provider's current fees, not the ones
      originally agreed. Decide whether that's acceptable.
- [x] Beauty Maintenance migration renumbered to `20261018180000` (above the
      frontier) and re-verified against live on 2026-10-18; its constraint list
      keeps the fee and refund-request notification types.

**Going live: option B, chosen by the user on 2026-10-18.** One Supabase project switches to live
Stripe keys. Release builds (`preview`, `production` in eas.json) already use
the real Stripe checkout with Apple Pay, on the TEST publishable key, so
nothing real moves until this list is done. **Do not ship a public App Store
build until it is**: a test key in a public build takes bookings with no money.
- [ ] Stripe account fully activated for live payments (business details, bank).
- [ ] Apple Pay certificate also uploaded for LIVE mode in Stripe, if Stripe
      shows separate test and live Apple Pay settings.
- [ ] Set the live secrets in Supabase (the user, never in chat):
      `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`,
      using the live webhook endpoints created in the Stripe dashboard.
- [ ] Swap `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` in eas.json (preview +
      production) and `.env.local` to the `pk_live_` key. The app refuses to pay
      when the app key and server key are in different modes, so all of them
      change together.
- [ ] Providers re-onboard to Stripe Connect in live mode (test accounts don't carry over).
- [ ] After the switch, every test is a real charge. Refund yourself, and
      keep test bookings off real providers.
- [ ] Security review and legal review of the Stripe flow (auto-memory
      stripe-payment-intent-integration), and the fee terms (LEGAL-COMPLIANCE-NOTES §17).

---

## 23. Saved cards + fee consent record — built on `feat/saved-cards-fee-consent-record`, not live (2026-10-19)

(Numbered 23 because §22, Instagram handle verification, is on another branch.
Supersedes `feat/saved-payment-methods` and `feat/combined-saved-cards-fees`.)

Clients can save cards on Payment Methods and reuse them at checkout. Stripe
holds the card; CERVICED stores only the Stripe Customer id, in the
service-role-only `client_stripe_customers` table. A card saved on Payment
Methods is on-session only. A card is saved for off-session use only at a
checkout with late/no-show fees, after the client's agreement is recorded in
`fee_consent_records` (wording version + sha256, frozen amounts, DB time).

Inert until all of these happen, in order:

1. Apply `20261019120000_saved_cards_and_fee_consent_records.sql` (check
   `supabase/MIGRATION_OWNER.md`; frontier at authoring 20261019011825).
2. Deploy `client-saved-cards`, `create-payment-intent` and `booking-fee`,
   outside peak hours: the PaymentIntent idempotency key was renamed, so a
   checkout mid-flight at deploy time can leave one orphaned, uncaptured intent.
   Between steps 1 and 2 the live functions still read
   `checkout_batches.fee_consent_at`, which the new RPC keeps stamping — but an
   app build from before this branch calls the old one-argument
   `accept_checkout_fees`, which step 1 drops, so its fee checkouts fail.
3. Then a migration dropping `users.stripe_customer_id` and its two guard
   triggers/functions (unused after step 2; never before it).
4. `EXPO_PUBLIC_STRIPE_PAYMENTS_ENABLED=true` (§1). Until then Payment Methods
   shows the old explainer and checkout doesn't use saved cards.

Before turning it on:

- **Verify in Stripe test mode which `setup_future_usage` a card saved from the
  checkout sheet ends up with.** The ephemeral-key Payment Sheet's own "save"
  checkbox may save it as `off_session`, which contradicts the on-session scope.
  If so, move checkout to a Customer Session with
  `payment_method_save_usage: 'on_session'` (needs a newer Stripe API version
  than the `2024-12-18.acacia` the functions pin). "Add a card" on Payment
  Methods is on-session by construction (SetupIntent `usage: 'on_session'`).
- **Account deletion doesn't delete the Stripe Customer.** When the deletion
  grace period completes, call `stripe.customers.del(...)` from a service-role
  function — before the auth user goes, since `client_stripe_customers`
  cascades away with it.
- **Privacy Policy** doesn't name Stripe or say a Stripe Customer is kept for
  saved cards. Wording is the user's call.
- Apple Pay still needs a real Apple merchant ID (`merchant.com.cerviced` is a
  placeholder) before the "Also at checkout" row is true on iOS.

## 25. "Session expired" on Apple Pay + address page back arrow — two PRs to merge (2026-10-20)

(Numbered 25 because §22 is on another branch.)

**Merge, then ship a new TestFlight build:**

- **PR #146 `fix/sign-out-this-device-only`.** Logging out on one phone logged
  the account out on every phone, because `supabase.auth.signOut()` defaults
  to global scope. The other phones still look logged in, but Apple Pay
  fails with "Your session has expired" (`create-payment-intent` gets
  `session_not_found` from Auth → 401). Seen live 14:30–15:05 today. The fix
  uses `scope: 'local'`; password reset still signs out everywhere on purpose.
  Until it ships, the workaround on an affected phone is to log out and back in.
- **PR #147 `fix/address-back-returns-to-cart`.** From checkout, the back
  arrow on the address page went to Home. Now it returns to the cart with
  Confirm Your Details open again, the same as Save does.

Both have clean `tsc` and 155/155 test suites, but neither has been run on a
device. Check on the phone: log out on phone A and pay on phone B. Then, from
checkout, open add-address, press back, and confirm you land on the cart.

**Still open after #147:** the iOS edge-swipe and Android hardware back from
the address page go to the Profile menu, not the cart. The cart only reopens
Confirm Your Details if the client goes back to the cart tab themselves.
Closing this needs the address page to intercept back when it was opened
from checkout (`usePreventRemove`, or a `BackHandler` plus
`gestureEnabled: false`).

---

## 26. Payouts after a reschedule or refund: four gaps, ranked (2026-10-25)

Found while checking `PAYMENTS_AND_LOGIC.md` §9. Ranked most important first.
Items 1 and 2 stop money going wrong; items 3 and 4 deal with it once it has.

1. **Apply PR #168: a moved booking moves its payout.** *Built; user OK'd
   applying 2026-10-29, but the apply was blocked by permissions.* Today the payout date is fixed when the client pays,
   so a booking moved from 5 Nov to 20 Nov pays the provider around 6 Nov,
   before the work. If the client then cancels, the money has to be taken
   back, and that's what creates most debts in item 4. The fix moves the
   payout by the same amount, earlier or later (user's choice). Migration
   `20261025140000`: do a rolled-back dry run on live, then apply, then merge.
2. **Rescheduling must not dodge a late-cancel charge.** *Decided, not
   built.* A client already too late to cancel for free can reschedule
   (reschedule notice is a separate, often looser setting), then cancel the
   new date for a full refund, because `apply-cancellation-refund` only looks
   at the current date. Decided: if they rescheduled while already inside the
   cancellation window, the provider's late-cancel rule still applies, as if
   they'd cancelled on the original date. Anyone who reschedules in good time
   is unaffected. Needs a record of "rescheduled while late" on the booking,
   the refund function to read it, and the client told before they confirm
   the reschedule. Run `cerviced-legal-flagger` because this is refund policy.
3. **Tell providers when they owe money.** *Needed whatever is chosen in
   item 4.* When a refund can't be fully taken back from a provider's Stripe
   balance, the rest is recorded in `provider_shortfalls` and taken out of
   their next payout. Providers are told nothing about this: there's no
   notification and no app screen. Two messages: one when the debt appears
   ("£30 left will come out of your next payments"), one each time money is
   taken ("£15 taken, £15 left"). New notification type, so check it with
   `cerviced-feature-coherence` first.
4. **Let providers pay the debt back, then take it from payouts.** *Option B
   decided 2026-10-29; card fee still open.*
   - Day 0: message with a pay button (item 3). Reminders on days 2 and 4.
   - Meanwhile, from payouts that come due, Cerviced holds back only up to
     what's owed and pays the rest. If they pay, the held money is sent
     straight away.
   - Day 5, still unpaid: the held money, then their next payouts
     (booking AND late/no-show fee payouts, which today are never used) pay
     it off. This is Option A, kept as the fallback.
   - If a payout is less than the debt, all of it goes towards the debt and
     the rest stays owed. If it's more, only the debt is taken.
   - Reuse the client fee-pay-request pattern (`_shared/feePayRequest.ts`:
     Stripe invoice, in-app payment sheet + emailed Stripe page).
   - Open: whether Cerviced absorbs the Stripe card fee on the pay-back or
     the provider pays it on top.

   Either way, a provider who never earns again on the app is never
   recovered from automatically.
