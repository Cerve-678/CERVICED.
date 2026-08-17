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

**Before launch:** test the new waitlist-hold flow end to end — join a
waitlist, cancel the matching confirmed booking, confirm the waitlisted
client gets a real held (`on_hold`) booking (not just a notification),
confirm it expires and cascades to the next candidate after 3 hours (or
force it via `select public.expire_waitlist_holds();`), and confirm
claim/decline both work. Also update `supabase/waitlist_holds.sql` itself
to match what's actually live, so the file isn't misleading for the next
person who reads it.

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
