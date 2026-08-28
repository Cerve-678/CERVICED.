# Notification Authority Hardening

Live audit performed 2026-08-09.

## Current defect

The live policy `Providers can send notifications to clients` grants a provider `INSERT` on `notifications` if the caller merely owns any provider profile. It does not require a relationship to the recipient, a booking, a promotion or a valid notification type. It is permissive alongside `notifications_participant_insert`, so its broad check wins.

`npm run audit:live-notification-authority` is a read-only release gate for this policy and currently fails correctly.

## Why it exists today

The mobile app inserts promotion, rebooking-reminder, waitlist and intake-form notifications directly. This is not a safe authority model for multi-recipient or marketing notifications: the app supplies recipient IDs and message contents.

## Replacement contract

| Use case | Server action |
|---|---|
| Booking lifecycle, reschedule, waitlist, address release | Existing trigger/RPC creates the notification from booking state |
| Provider promotion | `send_promotion_notifications(promotion_id)` verifies the provider owns the promotion, computes the audience server-side and writes deduplicated notifications |
| Rebooking reminder | Server action verifies the provider-client booking relationship and policy/consent before creating one deduplicated notification |
| Intake form / pack | Server action validates provider ownership of the specific booking/form/pack |
| Client self event | Only an explicitly allowed self-notification, otherwise server-owned |

The app sends resource IDs and optional safe user intent only; it never sends a target user ID list or arbitrary notification payload as authoritative data.

## Rollout

1. Add typed provider-owned notification RPCs with idempotency/deduplication and audit fields.
2. Move every app-side `notifications.insert(...)` path to the relevant RPC or existing lifecycle trigger.
3. Test client/provider recipient matrix, promotion audience, booking-only actions, retries and push delivery.
4. Drop `Providers can send notifications to clients`; retain only narrowly scoped participant/server policies.
5. Make the audit pass in staging and production.

Connections: [[Notifications]] · [[Promotions]] · [[Waitlist]] · [[Booking Authority Hardening]] · [[CERVICED E2E Readiness Programme]]
