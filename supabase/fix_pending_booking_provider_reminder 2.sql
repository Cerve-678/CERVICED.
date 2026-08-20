-- ════════════════════════════════════════════════════════════════════════════
-- fix_pending_booking_provider_reminder.sql
--
-- GAP: process_expire_stale_pending_bookings() (cron: expire-stale-pending-
-- bookings, */30 * * * *) auto-cancels `pending` bookings after 48h or once
-- appointment time passes. Separately, process_pending_booking_warnings()
-- (cron: pending-booking-warnings, 0 10 * * *, confirmed live via
-- pg_get_functiondef 2026-08-17) notifies the CLIENT at T-24h that their
-- booking is still unconfirmed. The provider — who's actually the one who
-- needs to act (confirm/decline) — is never notified at all. A provider who
-- doesn't happen to check their inbox can let a pending booking silently
-- expire without ever knowing one existed.
--
-- Live WHERE-clause this fix mirrors (confirmed via pg_get_functiondef):
--   status = 'pending'
--   AND (booking_date::TIMESTAMP + booking_time) BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
--   AND dedup: NOT EXISTS a same-type/recipient notification for this booking
--              in the last 25h (25h > the 24h-out trigger window + the job's
--              own up-to-1h cron-tick slop, so it can't double-fire the same
--              booking across adjacent daily runs).
--
-- FIX: process_pending_booking_warnings() now ALSO inserts a provider-facing
-- notification for the same still-pending bookings, using a new type
-- 'pending_booking_reminder' (kept distinct from the client's existing
-- 'booking_pending' type so client/provider copies can read differently and
-- dedup independently — reusing 'booking_pending' with only recipient_role
-- changed would work too, but a distinct type is clearer in notification
-- history/filtering and matches how this repo already gives each audience
-- its own type rather than overloading recipient_role as the sole
-- differentiator elsewhere, e.g. reschedule_request vs
-- reschedule_provider_response).
--
-- gate: only fires when u.pending_warning_enabled = TRUE is the CLIENT's
-- own preference column (users.pending_warning_enabled) — intentionally NOT
-- reused as the provider gate, since a client opting out of their own
-- reminder says nothing about whether the provider wants to be nudged.
-- Providers have no equivalent preference column today, so this fires
-- unconditionally for providers (same "no opt-out yet" default every other
-- provider-facing automation in this file's cron sibling list uses, e.g.
-- provider-unaccepted-booking-reminders, provider-unpaid-deposit-reminders).
--
-- Same 25h dedup window pattern, scoped to the provider's own user id.
--
-- Adds 'pending_booking_reminder' to notifications_type_check (same
-- ALTER-CONSTRAINT-DROP-then-ADD pattern as fix_notifications_type_check.sql).
--
-- Safe to re-run (CREATE OR REPLACE; type-check re-add is idempotent).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Extend the notifications type check constraint ──────────────────────
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'booking_pending', 'booking_confirmed', 'booking_declined', 'booking_cancelled',
    'booking_reminder', 'booking_in_progress', 'booking_not_started', 'no_show',
    'payment_success', 'new_provider', 'reschedule_request', 'reschedule_provider_response',
    'reschedule_confirmed', 'reschedule_declined', 'review_request', 'review_received', 'promotion',
    'intake_form_reminder', 'intake_form_received', 'intake_form_completed',
    'info_pack_received', 'provider_message', 'announcement', 'balance_reminder',
    'waitlist_slot_available', 'new_message', 'address_released', 'birthday_greeting',
    'post_appt_check_in', 'rebooking_nudge', 'daily_recap', 'schedule_fully_booked',
    -- previously missing, added by this fix:
    'pending_booking_reminder'
  ));

-- ── 2. Extend process_pending_booking_warnings() to also notify the provider ──
CREATE OR REPLACE FUNCTION public.process_pending_booking_warnings()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r RECORD;
BEGIN
  -- Client-facing reminder (unchanged from the live function).
  FOR r IN
    SELECT b.id AS booking_id, b.user_id, b.booking_date, b.booking_time,
           b.service_name_snapshot, b.provider_name_snapshot, b.provider_id
    FROM public.bookings b
    JOIN public.users u ON u.id = b.user_id
    WHERE b.status = 'pending'
      AND (b.booking_date::TIMESTAMP + b.booking_time) BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
      AND u.pending_warning_enabled = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.booking_id = b.id AND n.user_id = b.user_id
          AND n.type = 'booking_pending' AND n.recipient_role = 'client'
          AND n.created_at > NOW() - INTERVAL '25 hours'
      )
  LOOP
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      r.user_id, 'booking_pending', 'Booking Still Awaiting Confirmation',
      'Your ' || r.service_name_snapshot ||
        ' with ' || r.provider_name_snapshot ||
        ' on ' || TO_CHAR(r.booking_date, 'DD Mon YYYY') ||
        ' at ' || TO_CHAR(r.booking_time, 'HH12:MI AM') ||
        ' has not been confirmed yet. You may want to contact the provider.',
      'high', TRUE, r.booking_id, r.provider_id, 'client'
    );
  END LOOP;

  -- Provider-facing reminder (new): same still-pending/T-24h population,
  -- notifying the provider who owns the booking that action is needed.
  FOR r IN
    SELECT b.id AS booking_id, b.booking_date, b.booking_time,
           b.service_name_snapshot, b.customer_name, b.provider_id,
           p.user_id AS provider_user_id
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
    WHERE b.status = 'pending'
      AND (b.booking_date::TIMESTAMP + b.booking_time) BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
      AND p.user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.booking_id = b.id AND n.user_id = p.user_id
          AND n.type = 'pending_booking_reminder' AND n.recipient_role = 'provider'
          AND n.created_at > NOW() - INTERVAL '25 hours'
      )
  LOOP
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      r.provider_user_id, 'pending_booking_reminder', 'Booking Awaiting Your Response',
      r.customer_name || '''s ' || r.service_name_snapshot ||
        ' on ' || TO_CHAR(r.booking_date, 'DD Mon YYYY') ||
        ' at ' || TO_CHAR(r.booking_time, 'HH12:MI AM') ||
        ' is still pending confirmation — it will auto-cancel if not confirmed or declined in time.',
      'high', TRUE, r.booking_id, r.provider_id, 'provider'
    );
  END LOOP;
END;
$function$;

-- Preserve existing lockdown pattern for this function family.
REVOKE ALL ON FUNCTION public.process_pending_booking_warnings() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_pending_booking_warnings() FROM anon;
GRANT EXECUTE ON FUNCTION public.process_pending_booking_warnings() TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────
-- VERIFY
--   SELECT pg_get_functiondef(oid) FROM pg_proc
--    WHERE proname = 'process_pending_booking_warnings';
--
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.notifications'::regclass AND conname = 'notifications_type_check';
--    → expect 'pending_booking_reminder' present
--
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'pending-booking-warnings';
--    → expect one row, 0 10 * * *, active = true (unchanged by this file)
-- ───────────────────────────────────────────────────────────

-- ============================================================
-- DONE — pending-booking-warnings now also notifies the provider, not just
-- the client, using new notification_type 'pending_booking_reminder'.
-- ============================================================
