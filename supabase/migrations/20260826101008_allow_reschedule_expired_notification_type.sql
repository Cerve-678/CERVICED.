-- notifications_type_check never learned about 'reschedule_expired'.
--
-- 20260826090555 added the type to the app's unions (database.ts,
-- NotificationsScreen, notificationTapHandler) and had
-- process_expire_stale_reschedule_requests() insert it, but left this CHECK
-- alone. Every cron run therefore aborted on the first INSERT:
--
--   ERROR: new row for relation "notifications" violates check constraint
--          "notifications_type_check"
--
-- The whole function runs in one transaction, so the status UPDATE rolled back
-- with it -- no half-expired rows, but nothing expired either, and the failure
-- was visible ONLY in cron.job_run_details. Two runs failed (09:17, 09:47)
-- before it was caught. Nothing in the app or the test suite could have caught
-- this: tsc and jest both pass against a type union the database rejects.
--
-- Lesson worth keeping: a new notification type is FOUR places, not three --
-- the app union in src/types/database.ts, NotificationsScreen's own union,
-- notificationTapHandler's BOOKING_TYPES, AND this constraint. After adding
-- one, check cron.job_run_details rather than trusting a green test run.

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'booking_pending'::text, 'booking_confirmed'::text, 'booking_declined'::text,
    'booking_cancelled'::text, 'booking_reminder'::text, 'booking_in_progress'::text,
    'booking_not_started'::text, 'no_show'::text, 'payment_success'::text,
    'new_provider'::text, 'reschedule_request'::text,
    'reschedule_provider_response'::text, 'reschedule_confirmed'::text,
    'reschedule_declined'::text, 'reschedule_expired'::text,
    'review_request'::text, 'review_received'::text, 'promotion'::text,
    'intake_form_reminder'::text, 'intake_form_received'::text,
    'intake_form_completed'::text, 'info_pack_received'::text,
    'provider_message'::text, 'announcement'::text, 'balance_reminder'::text,
    'waitlist_slot_available'::text, 'new_message'::text, 'address_released'::text,
    'birthday_greeting'::text, 'post_appt_check_in'::text, 'rebooking_nudge'::text,
    'daily_recap'::text, 'schedule_fully_booked'::text,
    'pending_booking_reminder'::text, 'provider_no_show'::text
  ]));
