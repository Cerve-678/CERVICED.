# Waitlist State Authority Audit

Live audit performed 2026-08-09.

## Current defects

`provider_waitlist` exposes `status`, `position`, `notified_at` and `expires_at` alongside client preference fields. Its live `Waitlist participants can see and manage their entries` `FOR ALL` policy lets both the client and provider participant update every one of those fields.

The app also has a provider-side `inviteFromWaitlist` flow that directly sets `status = booked` and then inserts a notification. It does not create a booking, reserve a slot or use the existing expiring waitlist hold. That can leave an entry marked booked with no appointment.

`npm run audit:live-waitlist-authority` is the read-only release gate and currently fails on the broad policy.

## Target state machine

```text
waiting
  → offered/on_hold (server validates precise slot, creates expiring booking hold)
  → claimed (client confirms, payment/booking finalisation succeeds)
  → booked

waiting/offered → cancelled or expired
offered → declined/expired → next eligible entry
```

Only the client should create or withdraw its own waitlist intent. Every position, eligibility, offer, hold, status, expiry and notification transition belongs to a server RPC/trigger.

## Required replacement

1. Replace broad `ALL` access with client `SELECT`/intent `INSERT`/own `DELETE` policies and provider `SELECT` only.
2. Create `join_waitlist` server action that validates live provider/service, sets canonical snapshots/default status and assigns position transactionally.
3. Replace `inviteFromWaitlist` with a provider-owned slot-offer RPC that calls the same hold creation path as automatic waitlist release. It returns an expiring hold, never a fake `booked` state.
4. Keep `claim_waitlist_hold`, decline and expiry functions as the only legal state transitions; remove direct table status updates from the app.
5. Test duplicate joins, rejoin, queue ordering, provider manual offer, automatic cancellation offer, expiry, decline, payment failure and race conditions.

Connections: [[Waitlist]] · [[Booking Authority Hardening]] · [[Notification Authority Hardening]] · [[CERVICED E2E Readiness Programme]]
