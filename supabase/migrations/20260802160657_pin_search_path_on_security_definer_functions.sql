-- Security audit fix: these SECURITY DEFINER functions had no search_path
-- pinned, the standard Postgres/Supabase privilege-escalation vector for
-- definer functions (an attacker able to create objects earlier in the
-- caller's search_path can shadow an unqualified table/function reference
-- and have it execute with the definer's elevated privileges). Pinning
-- search_path doesn't change any function's logic — only how it resolves
-- unqualified names — so this is a behavior-neutral hardening pass.

ALTER FUNCTION public.append_saved_portfolio_item(p_user_id uuid, p_item_id text) SET search_path = public, pg_temp;
ALTER FUNCTION public.apply_provider_booking_instructions() SET search_path = public, pg_temp;
ALTER FUNCTION public.attach_info_pack_to_booking(p_booking_id uuid, p_info_pack_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.check_and_set_provider_live(p_provider_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.claim_waitlist_hold(p_booking_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.decline_waitlist_hold(p_booking_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.enforce_booking_bookability() SET search_path = public, pg_temp;
ALTER FUNCTION public.expire_waitlist_holds() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_promotion_audience(p_promotion_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_attach_info_packs() SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_auto_send_intake_form() SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_availability_window_change() SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_booking_status_change() SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_booking_todo_notification() SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_intake_form_completed() SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_booking() SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_info_pack() SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_provider_address_change() SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_provider_availability_change() SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_provider_gone_live() SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_provider_service_insert() SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_review_received() SET search_path = public, pg_temp;
ALTER FUNCTION public.invite_next_waitlist_entry(p_provider_id uuid, p_service_id uuid, p_booking_date date, p_booking_time time without time zone, p_end_time time without time zone, p_base_price numeric, p_add_ons_total numeric, p_service_charge numeric, p_service_category_snapshot text) SET search_path = public, pg_temp;
ALTER FUNCTION public.notify_on_new_chat_message() SET search_path = public, pg_temp;
ALTER FUNCTION public.process_auto_complete_bookings() SET search_path = public, pg_temp;
ALTER FUNCTION public.process_birthday_greetings() SET search_path = public, pg_temp;
ALTER FUNCTION public.process_client_appointment_reminders() SET search_path = public, pg_temp;
ALTER FUNCTION public.process_expire_stale_pending_bookings() SET search_path = public, pg_temp;
ALTER FUNCTION public.process_pending_booking_warnings() SET search_path = public, pg_temp;
ALTER FUNCTION public.process_post_appt_check_ins() SET search_path = public, pg_temp;
ALTER FUNCTION public.process_provider_24hr_reminders() SET search_path = public, pg_temp;
ALTER FUNCTION public.process_provider_daily_recap() SET search_path = public, pg_temp;
ALTER FUNCTION public.process_provider_fully_booked_alerts() SET search_path = public, pg_temp;
ALTER FUNCTION public.process_provider_intake_form_reminders() SET search_path = public, pg_temp;
ALTER FUNCTION public.process_provider_not_started_reminders() SET search_path = public, pg_temp;
ALTER FUNCTION public.process_provider_stale_reschedule_reminders() SET search_path = public, pg_temp;
ALTER FUNCTION public.process_provider_unaccepted_booking_reminders() SET search_path = public, pg_temp;
ALTER FUNCTION public.process_provider_unpaid_deposit_reminders() SET search_path = public, pg_temp;
ALTER FUNCTION public.process_provider_unread_message_reminders() SET search_path = public, pg_temp;
ALTER FUNCTION public.process_rebooking_nudges() SET search_path = public, pg_temp;
ALTER FUNCTION public.process_scheduled_promotion_notifications() SET search_path = public, pg_temp;
ALTER FUNCTION public.remove_saved_portfolio_item(p_user_id uuid, p_item_id text) SET search_path = public, pg_temp;
ALTER FUNCTION public.update_conversation_last_message(conv_id uuid, msg_text text, p_sender_type text) SET search_path = public, pg_temp;
ALTER FUNCTION public.update_provider_rating() SET search_path = public, pg_temp;
;
