# Notifications
#server-authoritative

Push + in-app notifications. **Driven by DB triggers — never duplicate them in the app** (or users get pinged twice).

## The rule
Status-change notifications and waitlist invites are **owned by DB triggers** (`on_booking_status_changed`, waitlist logic; see `supabase/booking_flow_fixes.sql`, `notifications_full_matrix.sql`, `notification_recipient_role.sql`). The app must not insert the same notification after changing status — the trigger already did.

## The pieces
- **In-app**: `notifications` table (`DbNotification`), shown in `NotificationsScreen`. `NotificationWithContext` joins booking/provider.
- **Push tokens**: `push_token_setup.sql`, registered via `src/services/pushNotificationService.ts`.
- **Delivery**: Edge Function `supabase/functions/send-push-notification` (Expo push).
- **Tap handling**: `src/services/notificationTapHandler.ts` routes a tapped push to the right screen.
- **Reminders**: pg_cron jobs `process_provider_24hr_reminders` / `process_user_24hr_reminders` (`automation_jobs.sql`, `provider_reminder_jobs.sql`).

## Known blind spot
The push Edge Function reads the send **ticket**, not the **receipt** — so real delivery failures are silent. Diagnose via **DevSettings → "Send Test Push (+ receipt)"**. #todo

## Connections
[[Data Layer — Supabase]] · [[Booking Flow]] · [[Services]] · [[Screens & Navigation]]

## Open questions
- Full matrix of which events notify which role (client vs provider)? See `notifications_full_matrix.sql`. #needs-verification
