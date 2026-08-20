-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260820100037
-- Remote name: revoke_public_trigger_function_execution_batch_two
-- Do not edit this recovery archive; create a new tracked migration for changes.

-- These functions are invoked by trusted PostgreSQL triggers. The application
-- has no RPC call sites for them, and direct execution can mutate bookings,
-- notifications, availability, or search data outside the intended workflow.
REVOKE ALL ON FUNCTION public.apply_checkout_platform_fee() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_waitlist_position() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_attach_info_packs() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_auto_send_intake_form() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_availability_window_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_booking_todo_notification() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_intake_form_completed() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_booking() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_info_pack() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_provider_address_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_provider_availability_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_provider_gone_live() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_provider_service_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_review_received() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_on_new_chat_message() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_self_conversation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.send_push_on_notification_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stamp_booking_address_snapshot() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.throttle_reminder_notifications() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_conversation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_provider_rating() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_provider_search_vector() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_service_search_vector() FROM PUBLIC, anon, authenticated;
