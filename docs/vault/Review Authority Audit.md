# Review Authority Audit

Live audit performed 2026-08-09.

## Current defect

The client inserts directly into `reviews`. The live policy checks only that `user_id = auth.uid()`. It does not prove that the booking belongs to the caller, is completed, or matches the submitted provider/service. The client can also update its review row directly, including rating and tip fields.

This undermines provider trust/rating integrity and is inconsistent with the booking-derived review UI.

`npm run audit:live-review-authority` currently fails until direct policies are removed and the completed-booking RPC exists.

## Target contract

`create_review_for_own_completed_booking(booking_id, rating, comment)` derives client, provider and service from a caller-owned booking with `status = completed`. It accepts only review content/rating. Tip charging must use a separate payment-authoritative route, not a mutable review field.

## Rollout

1. Deploy the secure RPC.
2. Change `submitReview` to send only booking ID, rating and comment to the RPC.
3. Give tips a separate Stripe/server-authoritative flow.
4. Remove direct review insert/update policies.
5. Test one review per completed booking, cross-booking/provider tampering, duplicate/retry, provider rating aggregation and client/provider read visibility.

Connections: [[Reviews]] · [[Payments]] · [[Booking Authority Hardening]] · [[CERVICED E2E Readiness Programme]]
