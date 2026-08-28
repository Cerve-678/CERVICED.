# No-Show
#provider-decides

A terminal booking status the provider marks manually when the client doesn't turn up. A slice of [[Booking Flow]] with its own guardrails and a bug fix (2026-08-10), pulled out here the same way [[Cancellations]] was.

## Who marks it, and how
- **Provider only** — `ProviderBookingDetailScreen.tsx` "No Show" button → `updateBookingStatus()` (`databaseService.ts`) → RPC `provider_update_booking_status` (`supabase/booking_rules_server_enforcement.sql` lineage). RPC-only, no raw `.update()`, consistent with [[Client vs Server Authority]].
- The client cannot mark a booking no-show, obviously — this is a provider-hat-only action, see [[Client vs Provider Hats]].

## The guardrails (both same-day 2026-08-10)
The "No Show" button only renders, and the RPC only succeeds, when **all** of these hold:
1. **Same calendar day as the appointment.** Originally the RPC only checked "appointment start time has passed" — with no upper bound, a provider could mark a booking from *weeks* ago as no-show at any point. Tightened to `v_booking_date = CURRENT_DATE`.
2. **Appointment start time has passed.** Can't no-show someone before they were due.
3. **No active reschedule request on the booking** (`booking_reschedule_requests.status IN ('pending', 'provider_responded')`). Before this fix, a provider could no-show a booking while a reschedule offer the client hadn't yet accepted/declined was still sitting open — short-circuiting a live negotiation instead of resolving it first.
4. Not already `in_progress` (mutually exclusive with "Start Appointment" having been tapped).

Enforced in **two places**, both updated together: the RPC (source of truth) and `ProviderBookingDetailScreen.tsx`'s button visibility (`isApptToday && apptStartPassed && !hasRescheduleRequest`) so a provider sees a clean disabled state rather than a rejected-RPC error.

## What happens after
- **Terminal** — `provider_update_booking_status` blocks any further transition once status is `no_show` ("Booking is already %, no further status changes allowed"), same as `cancelled`/`completed`. No RPC exists to reschedule out of a no-show.
- **Client is notified**: DB trigger `handle_booking_status_change()` inserts a `no_show` notification — "Your appointment with {provider} on {date} was marked as a no-show." No app-side duplicate insert, per [[Notifications]]' "DB triggers own this" rule.
- **No fee or penalty of any kind.** Same as [[Cancellations]]' deposit-liability boundary — the app never charges, tracks, or attests to money changing hands for a no-show, in-app deposit or not.

## The bug this session actually fixed
`handle_reschedule_request_change()` (the trigger behind every reschedule notification — request, provider-response, confirm, decline, group variants) inserted `NEW.id` — the `booking_reschedule_requests` row's **own** id — into `notifications.booking_id`, instead of `NEW.booking_id`, the real booking it should reference. Copy-pasted into all 10 `INSERT INTO notifications` calls in the function.

Why it surfaced as a live crash rather than silently wrong data: `notifications.booking_id` has a real FK to `bookings(id)`. A reschedule request's own id essentially never matches an existing booking id, so this should have thrown `23503` (foreign key violation) on nearly every fire — first actually hit and reported 2026-08-10 as `"Failed to request reschedule"`.

Fixed live via `apply_migration` (verified 0 remaining bad `NEW.id` refs via `pg_get_functiondef`), written back to `supabase/fix_reschedule_notification_wrong_booking_id.sql`. **Not yet propagated**: `RUN_ALL_MIGRATIONS.sql`, `fix_group_reschedule_notification_dedup.sql`, and `fix_group_booking_reschedule.sql` all still define this same function with the buggy body — a fresh environment built from `RUN_ALL_MIGRATIONS.sql` alone would silently reintroduce the bug. #todo

## Connections
[[Booking Flow]] · [[Cancellations]] · [[Notifications]] · [[Client vs Server Authority]] · [[Data Layer — Supabase]]

## Open questions
- Should the orphaned-reschedule-request cleanup that already fires on cancellation (`close_orphaned_reschedule_request()`, called from `handle_booking_status_change()`'s `cancelled` branch) also fire on the `no_show` branch? Currently it doesn't — a reschedule request can theoretically still go stale via a path other than the one now blocked by guardrail #3 above (e.g. a request created *after* no_show was already set, if some other gap allows that). #todo
- Wire `fix_reschedule_notification_wrong_booking_id.sql` into `RUN_ALL_MIGRATIONS.sql` and reconcile the two other files that still carry the buggy body — candidate for a `cerviced-migration-drift` pass. #todo
