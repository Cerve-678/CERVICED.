# Notifications
#server-authoritative

Push + in-app notifications. **Driven by DB triggers — never duplicate them in the app** (or users get pinged twice).

## The rule
Status-change notifications and waitlist invites are **owned by DB triggers/functions** (`on_booking_status_changed`; waitlist logic now in `supabase/waitlist_holds.sql` — a full redesign, see [[Waitlist]] — plus `notifications_full_matrix.sql`, `notification_recipient_role.sql`). The app must not insert the same notification after changing status — the trigger already did.

Address-release notifications were a repeat offender of the opposite mistake — three separate paths (a trigger, a cron, and an app-side insert) each carried their own copy of the same notification. Consolidated into one shared `notify_address_released()` function this session → [[Address Release]]. If you're adding a new notification-sending path anywhere, check whether an existing one already covers it before adding another INSERT.

## The pieces
- **In-app**: `notifications` table (`DbNotification`), shown in `NotificationsScreen`. `NotificationWithContext` joins booking/provider.
- **Push tokens**: `push_token_setup.sql`, registered via `src/services/pushNotificationService.ts`.
- **Delivery**: Edge Function `supabase/functions/send-push-notification` (Expo push).
- **Tap handling**: `src/services/notificationTapHandler.ts` routes a tapped push to the right screen.
- **Reminders**: pg_cron jobs `process_provider_24hr_reminders` / `process_user_24hr_reminders` (`automation_jobs.sql`, `provider_reminder_jobs.sql`).

## Two reminders were removed for making unverifiable claims (2026-08-21)
Both were provider-facing pg_cron reminders, both are gone — cron unscheduled, producer function dropped, app-side type/routing/CTA removed, and the rows they'd already written deleted (57 live). **Don't rebuild either.**

- **"Payment Not Collected"** (`balance_reminder`, `process_provider_unpaid_deposit_reminders`) fired on any confirmed booking still at `payment_status = 'pending'`. That column is not evidence the provider went unpaid — a provider-created booking is written with `amount_paid` 0 (see [[Payments]]), and a client may have paid off-app entirely. The notification even offered a **"Collect Payment"** CTA. Same liability boundary that killed "mark balance collected" and the earlier outstanding-balance reminder.
- **"Appointment Not Started"** (`booking_not_started`, `process_provider_not_started_reminders`) fired 15 minutes past a confirmed booking's start time when nobody had tapped *start*. It asserted an appointment hadn't happened based purely on whether a button was pressed — so in any client/provider dispute the app would be holding a system-generated record it has no way to stand behind.

The rule underneath: **a notification must not assert a fact the app can't verify.** A button that wasn't pressed is not an appointment that didn't happen; a `payment_status` the app never processed is not money that wasn't paid. Both type values are deliberately left in the `notifications` type CHECK — nothing produces them, and the constraint was never what held this line.

Migrations: `20260821100444_remove_unverifiable_payment_and_not_started_reminders.sql`, `20260821133926_purge_unverifiable_payment_and_not_started_notifications.sql`.

## Known blind spot
The push Edge Function reads the send **ticket**, not the **receipt** — so real delivery failures are silent. Diagnose via **DevSettings → "Send Test Push (+ receipt)"**. #todo

## Connections
[[Data Layer — Supabase]] · [[Booking Flow]] · [[Cancellations]] · [[No-Show]] · [[Services]] · [[Screens & Navigation]]

## Open questions
- Full matrix of which events notify which role (client vs provider)? See `notifications_full_matrix.sql`. #needs-verification
