# Intake Form Authority Audit

Live audit performed 2026-08-09.

## Current defect

`booking_intake_forms` mixes provider-authored form definition (`title`, `questions`, library/booking relationship) with client-authored answers/signature and server-authored status/timestamps. Current provider `FOR ALL` and client `UPDATE` policies allow either party to modify fields outside their authority.

The app directly inserts form instances and directly writes a client submission patch. A modified provider can overwrite client answers, while a modified client can alter question/provider/booking/status fields.

`npm run audit:live-intake-form-authority` currently fails until the server routes exist and direct mutable policies are removed.

## Target contract

| Action | Server route | Server-derived fields |
|---|---|---|
| Provider sends form | `send_intake_form_for_own_booking(booking_id, library_form_id)` | Provider, client, booking, snapshot title/questions, initial status |
| Client submits | `submit_own_intake_form(form_id, answers, signature)` | Client ownership, pending state, completed status/timestamp |
| Provider reads | RLS select | Their booking/form only |
| Client reads | RLS select | Their own form only |
| Changes after completion | Explicit provider/client workflow only | No generic table update |

## Rollout

1. Add typed send/submit RPCs and audit records; preserve current reads.
2. Switch provider form screens and client form submission to RPCs.
3. Replace broad provider/client mutable policies with select-only policies and narrowly scoped routes.
4. Test wrong booking/library form, cross-provider/client access, duplicate send/submit, completed form immutability, notification/realtime delivery and reschedule/cancellation interactions.

Connections: [[Intake Forms]] · [[Client Profile Privacy Audit]] · [[Notification Authority Hardening]] · [[CERVICED E2E Readiness Programme]]
