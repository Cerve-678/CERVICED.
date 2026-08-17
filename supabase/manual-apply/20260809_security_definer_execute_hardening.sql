-- SECURITY DEFINER execution hardening — reviewed manual application
--
-- Do not apply until the canonical numbered migration chain exists and this
-- has been exercised against a staging clone. This is intentionally outside
-- the current migration manifest because the repository cannot safely deploy
-- its existing schema history yet. Run the live audit before and after.
--
-- The functions below are invoked by triggers or cron jobs. They must not be
-- directly executable by anonymous or authenticated API callers. PostgreSQL
-- grants EXECUTE to PUBLIC by default when a function is created; every later
-- CREATE OR REPLACE/change of signature must re-assert these grants.

BEGIN;

-- Provider lifecycle fields cannot be self-certified through the owner-wide
-- providers policy. A service/cron path has no auth.uid() and remains able to
-- update platform-managed aggregates; an app caller is constrained below.
CREATE OR REPLACE FUNCTION public.enforce_provider_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id <> auth.uid()
       OR NEW.is_verified IS DISTINCT FROM FALSE
       OR NEW.is_featured IS DISTINCT FROM FALSE
       OR NEW.rating IS DISTINCT FROM 0
       OR NEW.review_count IS DISTINCT FROM 0
       OR NEW.has_gone_live IS DISTINCT FROM FALSE
       OR NEW.is_claimed IS DISTINCT FROM TRUE
       OR NEW.source IS DISTINCT FROM 'self_signup' THEN
      RAISE EXCEPTION 'Provider lifecycle fields are server managed';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.is_verified IS DISTINCT FROM OLD.is_verified
     OR NEW.is_featured IS DISTINCT FROM OLD.is_featured
     OR NEW.rating IS DISTINCT FROM OLD.rating
     OR NEW.review_count IS DISTINCT FROM OLD.review_count
     OR NEW.is_claimed IS DISTINCT FROM OLD.is_claimed
     OR NEW.source IS DISTINCT FROM OLD.source
     OR NEW.source_site IS DISTINCT FROM OLD.source_site
     OR NEW.source_url IS DISTINCT FROM OLD.source_url
     OR NEW.scraped_at IS DISTINCT FROM OLD.scraped_at
     OR NEW.claimed_at IS DISTINCT FROM OLD.claimed_at
     OR NEW.claim_token IS DISTINCT FROM OLD.claim_token
     OR NEW.claim_token_expires_at IS DISTINCT FROM OLD.claim_token_expires_at
     OR NEW.claim_attempts IS DISTINCT FROM OLD.claim_attempts
     OR NEW.claim_token_last_sent_at IS DISTINCT FROM OLD.claim_token_last_sent_at
     OR NEW.scraped_fields IS DISTINCT FROM OLD.scraped_fields
     OR NEW.search_vector IS DISTINCT FROM OLD.search_vector
     OR NEW.fully_booked_alert_last_sent_at IS DISTINCT FROM OLD.fully_booked_alert_last_sent_at THEN
    RAISE EXCEPTION 'Provider lifecycle fields are server managed';
  END IF;

  IF NEW.has_gone_live IS TRUE AND OLD.has_gone_live IS FALSE
     AND NOT (
       EXISTS (SELECT 1 FROM public.provider_availability a WHERE a.provider_id = NEW.id AND a.is_closed = FALSE)
       AND EXISTS (SELECT 1 FROM public.services s WHERE s.provider_id = NEW.id)
       AND EXISTS (
         SELECT 1 FROM public.provider_private_details d
          WHERE d.provider_id = NEW.id
            AND btrim(COALESCE(d.full_address, '')) <> ''
            AND d.latitude IS NOT NULL AND d.longitude IS NOT NULL
       )
     ) THEN
    RAISE EXCEPTION 'Provider cannot go live until availability, service and address requirements are complete';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_provider_lifecycle() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS before_provider_lifecycle_enforced ON public.providers;
CREATE TRIGGER before_provider_lifecycle_enforced
  BEFORE INSERT OR UPDATE ON public.providers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_provider_lifecycle();

-- Review identity and target are derived from the caller's completed booking.
-- Tips remain a payment concern and are deliberately not accepted here.
CREATE OR REPLACE FUNCTION public.create_review_for_own_completed_booking(
  p_booking_id uuid, p_rating smallint, p_comment text DEFAULT NULL
)
RETURNS public.reviews LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_booking public.bookings%ROWTYPE; v_review public.reviews%ROWTYPE;
BEGIN
  IF p_rating < 1 OR p_rating > 5 THEN RAISE EXCEPTION 'Rating must be between 1 and 5'; END IF;
  SELECT * INTO v_booking FROM public.bookings
   WHERE id = p_booking_id AND user_id = auth.uid() AND status = 'completed';
  IF NOT FOUND THEN RAISE EXCEPTION 'Completed booking not found or not owned by caller'; END IF;
  INSERT INTO public.reviews (booking_id, user_id, provider_id, service_id, rating, comment)
  VALUES (v_booking.id, v_booking.user_id, v_booking.provider_id, v_booking.service_id, p_rating, NULLIF(btrim(p_comment), ''))
  RETURNING * INTO v_review;
  RETURN v_review;
END;
$$;
REVOKE ALL ON FUNCTION public.create_review_for_own_completed_booking(uuid, smallint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_review_for_own_completed_booking(uuid, smallint, text) TO authenticated;

-- Apply only after the app invokes the RPC above. No client should directly
-- create/update review state; review aggregates stay trigger/server managed.
DROP POLICY IF EXISTS "reviews_owner_insert" ON public.reviews;
DROP POLICY IF EXISTS "reviews_user_insert" ON public.reviews;
DROP POLICY IF EXISTS "reviews_user_update" ON public.reviews;

-- All entries here are trigger or scheduled-job helpers. They have no valid
-- mobile/web RPC caller. The regprocedure casts make the exact overload part
-- of the deployment contract and fail safely if an expected function is gone.
DO $$
DECLARE v_function regprocedure;
BEGIN
  FOREACH v_function IN ARRAY ARRAY[
    'public.apply_provider_booking_instructions()'::regprocedure,
    'public.auto_release_address()'::regprocedure,
    'public.check_and_set_provider_live(uuid)'::regprocedure,
    'public.compute_booking_effective_range()'::regprocedure,
    'public.enforce_booking_bookability()'::regprocedure,
    'public.handle_attach_info_packs()'::regprocedure,
    'public.handle_auto_send_intake_form()'::regprocedure,
    'public.handle_availability_window_change()'::regprocedure,
    'public.handle_booking_todo_notification()'::regprocedure,
    'public.handle_intake_form_completed()'::regprocedure,
    'public.handle_new_booking()'::regprocedure,
    'public.handle_new_info_pack()'::regprocedure,
    'public.handle_provider_address_change()'::regprocedure,
    'public.handle_provider_availability_change()'::regprocedure,
    'public.handle_provider_gone_live()'::regprocedure,
    'public.handle_provider_service_insert()'::regprocedure,
    'public.handle_review_received()'::regprocedure,
    'public.notify_on_new_chat_message()'::regprocedure,
    'public.prevent_self_conversation()'::regprocedure,
    'public.process_address_release_notifications()'::regprocedure,
    'public.process_auto_complete_bookings()'::regprocedure,
    'public.process_birthday_greetings()'::regprocedure,
    'public.process_client_appointment_reminders()'::regprocedure,
    'public.process_expire_stale_pending_bookings()'::regprocedure,
    'public.process_follow_availability_nudges()'::regprocedure,
    'public.process_follow_schedule_release_nudges()'::regprocedure,
    'public.process_pending_booking_warnings()'::regprocedure,
    'public.process_pending_scrape_jobs()'::regprocedure,
    'public.process_post_appt_check_ins()'::regprocedure,
    'public.process_provider_24hr_reminders()'::regprocedure,
    'public.process_provider_daily_recap()'::regprocedure,
    'public.process_provider_fully_booked_alerts()'::regprocedure,
    'public.process_provider_intake_form_reminders()'::regprocedure,
    'public.process_provider_not_started_reminders()'::regprocedure,
    'public.process_provider_stale_reschedule_reminders()'::regprocedure,
    'public.process_provider_unaccepted_booking_reminders()'::regprocedure,
    'public.process_provider_unpaid_deposit_reminders()'::regprocedure,
    'public.process_provider_unread_message_reminders()'::regprocedure,
    'public.process_rebooking_nudges()'::regprocedure,
    'public.process_scheduled_account_deletions()'::regprocedure,
    'public.process_scheduled_promotion_notifications()'::regprocedure,
    'public.send_push_on_notification_insert()'::regprocedure,
    'public.stamp_booking_address_snapshot()'::regprocedure,
    'public.throttle_reminder_notifications()'::regprocedure,
    'public.update_provider_rating()'::regprocedure
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_function);
  END LOOP;
END;
$$;

-- App RPCs require a real session. Their body-level ownership checks remain
-- mandatory, but anonymous callers should never reach them. Keep public
-- discovery reads in the separate allow-list below.
DO $$
DECLARE v_function regprocedure;
BEGIN
  FOREACH v_function IN ARRAY ARRAY[
    'public.cancel_account_deletion()'::regprocedure,
    'public.cancel_own_booking(uuid)'::regprocedure,
    'public.claim_cart_booking_slots(uuid,jsonb)'::regprocedure,
    'public.claim_provider_profile(uuid,text)'::regprocedure,
    'public.claim_waitlist_hold(uuid)'::regprocedure,
    'public.confirm_reschedule_own_booking(uuid,date,time without time zone,time without time zone)'::regprocedure,
    'public.decline_reschedule_offer(uuid)'::regprocedure,
    'public.decline_waitlist_hold(uuid)'::regprocedure,
    'public.delete_client_profile()'::regprocedure,
    'public.delete_own_notification(uuid)'::regprocedure,
    'public.delete_provider_profile()'::regprocedure,
    'public.dev_reset_provider()'::regprocedure,
    'public.dev_reset_provider_bookings_only()'::regprocedure,
    'public.hold_cart_booking_slots(uuid,jsonb)'::regprocedure,
    'public.mark_all_notifications_read()'::regprocedure,
    'public.mark_notification_read(uuid)'::regprocedure,
    'public.provider_cancel_group_booking(uuid)'::regprocedure,
    'public.provider_cancel_own_booking(uuid)'::regprocedure,
    'public.provider_initiate_reschedule(uuid,jsonb)'::regprocedure,
    'public.provider_update_booking_status(uuid,text)'::regprocedure,
    'public.provider_update_group_booking_status(uuid,text)'::regprocedure,
    'public.reject_reschedule_request(uuid,text)'::regprocedure,
    'public.release_cart_booking_slots(uuid)'::regprocedure,
    'public.replace_provider_services(uuid,jsonb)'::regprocedure,
    'public.request_reschedule_own_booking(uuid,text[])'::regprocedure,
    'public.respond_to_reschedule_request(uuid,jsonb,text)'::regprocedure,
    'public.update_conversation_last_message(uuid,text,text)'::regprocedure
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_function);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_function);
  END LOOP;
END;
$$;

-- Public discovery has an intentionally small, explicit allow-list.
REVOKE ALL ON FUNCTION public.get_trending_providers(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_trending_providers(integer) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.get_user_public_profiles(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_public_profiles(uuid[]) TO anon, authenticated;

-- Client save/remove actions must be self-scoped. The original helpers used
-- a caller-supplied user id while running with definer privileges.
CREATE OR REPLACE FUNCTION public.append_saved_portfolio_item(p_user_id uuid, p_item_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR p_user_id <> auth.uid() THEN RAISE EXCEPTION 'Not permitted'; END IF;
  UPDATE public.users SET saved_portfolio = CASE
    WHEN saved_portfolio @> to_jsonb(p_item_id) THEN saved_portfolio
    ELSE saved_portfolio || to_jsonb(p_item_id)
  END WHERE id = auth.uid();
END;
$$;
CREATE OR REPLACE FUNCTION public.remove_saved_portfolio_item(p_user_id uuid, p_item_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR p_user_id <> auth.uid() THEN RAISE EXCEPTION 'Not permitted'; END IF;
  UPDATE public.users SET saved_portfolio = COALESCE((
    SELECT jsonb_agg(elem) FROM jsonb_array_elements(saved_portfolio) AS elem
    WHERE elem <> to_jsonb(p_item_id)
  ), '[]'::jsonb) WHERE id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.append_saved_portfolio_item(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.append_saved_portfolio_item(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.remove_saved_portfolio_item(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_saved_portfolio_item(uuid, text) TO authenticated;

-- A provider may only attach one of their own packs to one of their own
-- bookings. The old implementation checked neither relationship.
CREATE OR REPLACE FUNCTION public.attach_info_pack_to_booking(p_booking_id uuid, p_info_pack_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_pack RECORD; v_booking RECORD; v_rows integer;
BEGIN
  SELECT b.user_id, b.provider_id, b.service_name_snapshot, p.display_name INTO v_booking
    FROM public.bookings b JOIN public.providers p ON p.id = b.provider_id
   WHERE b.id = p_booking_id AND p.user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found or not owned by caller'; END IF;
  SELECT * INTO v_pack FROM public.info_packs i WHERE i.id = p_info_pack_id
    AND i.provider_id IN (v_booking.provider_id, auth.uid());
  IF NOT FOUND THEN RAISE EXCEPTION 'Info pack not found or not owned by caller'; END IF;
  INSERT INTO public.booking_info_packs
    (booking_id, info_pack_id, provider_id, client_user_id, title, service, content)
  VALUES (p_booking_id, p_info_pack_id, v_booking.provider_id, v_booking.user_id,
    v_pack.title, v_booking.service_name_snapshot, v_pack.content)
  ON CONFLICT (booking_id, info_pack_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (v_booking.user_id, 'info_pack_received', 'Info From Your Provider',
      COALESCE(v_booking.display_name, 'Your provider') || ' sent you "' || v_pack.title ||
      '" for your ' || v_booking.service_name_snapshot || ' — open the booking to read it.',
      'medium', TRUE, p_booking_id, v_booking.provider_id, 'client');
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.attach_info_pack_to_booking(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_info_pack_to_booking(uuid, uuid) TO authenticated;

-- Promotion audience membership is client data; only the owning provider can obtain it.
CREATE OR REPLACE FUNCTION public.get_promotion_audience(p_promotion_id uuid)
RETURNS TABLE(user_id uuid) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_provider_id uuid;
BEGIN
  SELECT pr.provider_id INTO v_provider_id FROM public.promotions pr
  JOIN public.providers p ON p.id = pr.provider_id
  WHERE pr.id = p_promotion_id AND p.user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Promotion not found or not owned by caller'; END IF;
  RETURN QUERY
    SELECT bm.user_id FROM public.bookmarks bm WHERE bm.provider_id = v_provider_id
    UNION SELECT pf.user_id FROM public.provider_follows pf WHERE pf.provider_id = v_provider_id
    UNION SELECT bk.user_id FROM public.bookings bk
      WHERE bk.provider_id = v_provider_id AND bk.status IN ('completed', 'confirmed');
END;
$$;
REVOKE ALL ON FUNCTION public.get_promotion_audience(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_promotion_audience(uuid) TO authenticated;

-- Chat previews/unread counts must be updated only by the conversation
-- participant who actually sent the message. The old function accepted an
-- arbitrary conversation id and caller-chosen sender type.
CREATE OR REPLACE FUNCTION public.update_conversation_last_message(
  conv_id uuid, msg_text text, p_sender_type text DEFAULT 'user'
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_sender_type NOT IN ('user', 'provider') THEN
    RAISE EXCEPTION 'Invalid sender type';
  END IF;

  UPDATE public.provider_conversations c
     SET last_message = msg_text,
         last_message_at = NOW(),
         updated_at = NOW(),
         unread_count_provider = unread_count_provider
           + CASE WHEN p_sender_type = 'user' THEN 1 ELSE 0 END,
         unread_count_user = unread_count_user
           + CASE WHEN p_sender_type = 'provider' THEN 1 ELSE 0 END
   WHERE c.id = conv_id
     AND (
       (p_sender_type = 'user' AND c.user_id = auth.uid())
       OR (p_sender_type = 'provider' AND EXISTS (
         SELECT 1 FROM public.providers p
          WHERE p.id = c.provider_id AND p.user_id = auth.uid()
       ))
     );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation not found or not owned by sender';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.update_conversation_last_message(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_conversation_last_message(uuid, text, text) TO authenticated;

-- CHAT TABLE BOUNDARY
-- Deploy these new RPCs first. Release a client that uses them for unread
-- clearing, then replace the broad ALL policies below in the same migration
-- (or a second, tightly coordinated migration). Do not remove the old update
-- path before the released client no longer uses direct table updates.
CREATE OR REPLACE FUNCTION public.mark_conversation_read_by_provider(p_conversation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.provider_conversations c SET unread_count_provider = 0
   WHERE c.id = p_conversation_id
     AND EXISTS (SELECT 1 FROM public.providers p WHERE p.id = c.provider_id AND p.user_id = auth.uid());
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversation not found or not owned by provider'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_conversation_read_by_provider(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read_by_provider(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_conversation_read_by_user(p_conversation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.provider_conversations c SET unread_count_user = 0
   WHERE c.id = p_conversation_id AND c.user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversation not found or not owned by user'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_conversation_read_by_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read_by_user(uuid) TO authenticated;

-- Final table policies after the client uses the read-clear RPCs above. A
-- client may start a conversation with a public live provider; a provider may
-- start one only with a client who has a booking with that provider. Messages
-- are immutable once inserted and their sender is derived from auth.uid().
DROP POLICY IF EXISTS "Users see own conversations" ON public.provider_conversations;
CREATE POLICY "conversation participants read" ON public.provider_conversations FOR SELECT
USING (
  user_id = auth.uid()
  OR provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
);
CREATE POLICY "client creates own provider conversation" ON public.provider_conversations FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.providers p WHERE p.id = provider_id AND p.is_active = TRUE AND p.has_gone_live = TRUE)
);
CREATE POLICY "provider creates booked-client conversation" ON public.provider_conversations FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM public.providers p WHERE p.id = provider_id AND p.user_id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.bookings b WHERE b.provider_id = provider_id AND b.user_id = user_id)
);

DROP POLICY IF EXISTS "Participants see conversation messages" ON public.provider_messages;
CREATE POLICY "conversation participants read messages" ON public.provider_messages FOR SELECT
USING (
  conversation_id IN (
    SELECT c.id FROM public.provider_conversations c
    WHERE c.user_id = auth.uid()
       OR c.provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
  )
);
CREATE POLICY "conversation participants send own messages" ON public.provider_messages FOR INSERT
WITH CHECK (
  (sender_type = 'user' AND sender_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.provider_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()
  ))
  OR (sender_type = 'provider' AND sender_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.provider_conversations c JOIN public.providers p ON p.id = c.provider_id
     WHERE c.id = conversation_id AND p.user_id = auth.uid()
  ))
);

-- Its body already scopes profile data to a booking relationship; make the
-- signed-in caller requirement explicit in the execute contract too.
REVOKE ALL ON FUNCTION public.get_client_beauty_profile_for_provider(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_beauty_profile_for_provider(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.expire_cart_holds() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_cart_holds() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_waitlist_holds() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_waitlist_holds() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.invite_next_waitlist_entry(
  uuid, uuid, date, time without time zone, time without time zone,
  numeric, numeric, numeric, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invite_next_waitlist_entry(
  uuid, uuid, date, time without time zone, time without time zone,
  numeric, numeric, numeric, text
) FROM anon, authenticated;

-- These RPCs are deliberately callable only by a signed-in user. Each also
-- self-scopes to auth.uid(); retaining authenticated execution preserves the
-- current Client/Provider app flows.
REVOKE ALL ON FUNCTION public.dev_reset_client() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dev_reset_client() FROM anon;
GRANT EXECUTE ON FUNCTION public.dev_reset_client() TO authenticated;

REVOKE ALL ON FUNCTION public.provider_release_booking_address(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provider_release_booking_address(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.provider_release_booking_address(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.set_booking_client_address(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_booking_client_address(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_booking_client_address(uuid, text) TO authenticated;

-- Public busy-span reads are an intentional availability feature. Keep the
-- narrow explicit grant, rather than relying on an implicit PUBLIC grant.
REVOKE ALL ON FUNCTION public.get_provider_busy_spans(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_provider_busy_spans(uuid, date, date) TO anon, authenticated;

COMMIT;
