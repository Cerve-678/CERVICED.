-- ============================================================
-- CERVICED — Fix: notifications_type_check was missing 'address_released',
-- so any insert (or FK-cascade UPDATE) touching a row with that type
-- hard-fails with:
--   "new row for relation "notifications" violates check constraint
--    "notifications_type_check""
--
-- How this was found: "Full Provider Reset" (supabase/dev_reset_provider.sql)
-- failed with exactly that error. Root cause traced live against the DB:
--   - notifications.booking_id has ON DELETE SET NULL, so deleting a
--     booking fires an UPDATE on every notification row that referenced
--     it (for ANY user, not just the provider being reset).
--   - That UPDATE re-validates the row against notifications_type_check.
--   - 6 existing rows have type = 'address_released' (inserted by the
--     active hourly cron job process_address_release_notifications back
--     when the constraint allowed it) — the constraint was later narrowed
--     to exclude it, so those pre-existing rows are fine at rest but any
--     UPDATE that touches them now fails.
--
-- This never actually broke a live cron run: cron.job_run_details shows 0
-- failures across 329 hourly address-release runs since 2026-07-18 — no
-- new eligible booking hit the release window between the narrowing and
-- this fix, so it was latent, only surfaced via the dev-reset delete
-- cascade. No backfill needed.
--
-- The other 4 types added below (birthday_greeting, post_appt_check_in,
-- rebooking_nudge, daily_recap) turned out NOT to be a real gap — those
-- strings are metadata->>'kind' JSONB tags in process_birthday_greetings /
-- process_post_appt_check_ins / process_rebooking_nudges /
-- process_provider_daily_recap, not their actual `type` column value
-- (which is 'announcement' or 'booking_reminder', both already allowed).
-- Kept in the CHECK list anyway since they're harmless to allow and match
-- what an initial (overly broad) source scan flagged — just documenting
-- here that they were never actually rejected.
--
-- Run this in the Supabase SQL editor. Safe to re-run.
-- ============================================================

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'booking_pending', 'booking_confirmed', 'booking_declined', 'booking_cancelled',
    'booking_reminder', 'booking_in_progress', 'booking_not_started', 'no_show',
    'payment_success', 'new_provider', 'reschedule_request', 'reschedule_provider_response',
    'reschedule_confirmed', 'review_request', 'review_received', 'promotion',
    'intake_form_reminder', 'intake_form_received', 'intake_form_completed',
    'info_pack_received', 'provider_message', 'announcement', 'balance_collected',
    'balance_reminder', 'waitlist_slot_available', 'new_message',
    -- previously missing, added by this fix:
    'address_released', 'birthday_greeting', 'post_appt_check_in',
    'rebooking_nudge', 'daily_recap'
  ));
