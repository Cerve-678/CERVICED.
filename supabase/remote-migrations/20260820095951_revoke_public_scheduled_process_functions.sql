-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260820095951
-- Remote name: revoke_public_scheduled_process_functions
-- Do not edit this recovery archive; create a new tracked migration for changes.

-- These functions run from trusted pg_cron schedules and have no app RPC
-- callers. They send notifications and mutate booking/provider state, so the
-- Data API must not be able to execute them.
REVOKE ALL ON FUNCTION public.process_address_release_notifications() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_auto_complete_bookings() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_birthday_greetings() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_client_appointment_reminders() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_expire_stale_pending_bookings() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_follow_availability_nudges() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_follow_schedule_release_nudges() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_pending_booking_warnings() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_pending_scrape_jobs() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_post_appt_check_ins() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_provider_24hr_reminders() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_provider_daily_recap() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_provider_fully_booked_alerts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_provider_intake_form_reminders() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_provider_not_started_reminders() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_provider_stale_reschedule_reminders() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_provider_unaccepted_booking_reminders() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_provider_unpaid_deposit_reminders() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_provider_unread_message_reminders() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_rebooking_nudges() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_scheduled_promotion_notifications() FROM PUBLIC, anon, authenticated;
