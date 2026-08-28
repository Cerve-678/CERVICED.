-- Companion to 20260823105742. This function revoked a dual-hat account's client
-- hat by nulling `dob`, because dob WAS the hat marker. Now that the hat has its
-- own column, clearing dob alone would leave has_client_profile = true and the
-- provider would keep seeing a client hat they had just deleted.
--
-- Body is the live definition with `has_client_profile = false` added to the
-- existing UPDATE — deliberately not rebuilt from an older file, since replacing
-- a live function from a stale baseline has silently reverted fixes here before.

CREATE OR REPLACE FUNCTION public.delete_client_profile()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid         UUID := auth.uid();
  v_provider_id UUID;
  v_upcoming    INT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not authenticated');
  END IF;

  SELECT id INTO v_provider_id FROM public.providers WHERE user_id = v_uid LIMIT 1;

  SELECT COUNT(*) INTO v_upcoming
    FROM public.bookings
   WHERE user_id = v_uid
     AND booking_date >= CURRENT_DATE
     AND status IN ('pending', 'confirmed', 'in_progress');

  IF v_upcoming > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'upcoming_bookings', 'count', v_upcoming);
  END IF;

  INSERT INTO public.account_deletion_log
    (user_id, provider_id, email, deletion_type, had_client_profile, had_provider_profile, account_created_at)
  SELECT v_uid, v_provider_id, au.email,
         CASE WHEN v_provider_id IS NULL THEN 'full_account' ELSE 'client_profile' END,
         true, (v_provider_id IS NOT NULL), au.created_at
    FROM auth.users au WHERE au.id = v_uid;

  IF v_provider_id IS NULL THEN
    UPDATE public.users SET deletion_requested_at = NOW() WHERE id = v_uid;
    RETURN jsonb_build_object('ok', true, 'full_account_deleted', true, 'grace_period_days', 30);
  END IF;

  DELETE FROM public.reviews  WHERE user_id = v_uid;
  DELETE FROM public.bookings WHERE user_id = v_uid;

  DELETE FROM public.bookmarks              WHERE user_id = v_uid;
  DELETE FROM public.event_plans            WHERE user_id = v_uid;
  DELETE FROM public.payment_methods        WHERE user_id = v_uid;
  DELETE FROM public.becca_chat_sessions    WHERE user_id = v_uid;
  DELETE FROM public.user_interactions      WHERE user_id = v_uid;
  DELETE FROM public.provider_follows       WHERE user_id = v_uid;
  DELETE FROM public.provider_conversations WHERE user_id = v_uid;
  DELETE FROM public.notifications          WHERE user_id = v_uid;

  UPDATE public.users SET
    dob                = NULL,
    has_client_profile = false,
    hair_type          = NULL,
    skin_type          = NULL,
    allergies          = '{}',
    skin_concerns      = '{}',
    style_vibe         = NULL,
    medical_notes      = NULL,
    treatment_history  = '{}',
    service_interests  = '{}',
    saved_portfolio    = '[]'::jsonb
  WHERE id = v_uid;

  RETURN jsonb_build_object('ok', true, 'full_account_deleted', false);
END;
$function$;
