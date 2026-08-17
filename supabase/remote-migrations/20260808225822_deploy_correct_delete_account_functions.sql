-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260808225822
-- Remote name: deploy_correct_delete_account_functions
-- Do not edit this recovery archive; create a new tracked migration for changes.

DROP FUNCTION IF EXISTS public.delete_account();

-- ── Client-side deletion ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_client_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    dob               = NULL,
    hair_type         = NULL,
    skin_type         = NULL,
    allergies         = '{}',
    skin_concerns     = '{}',
    style_vibe        = NULL,
    medical_notes     = NULL,
    treatment_history = '{}',
    service_interests = '{}',
    saved_portfolio   = '[]'::jsonb
  WHERE id = v_uid;

  RETURN jsonb_build_object('ok', true, 'full_account_deleted', false);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_client_profile() FROM public;
GRANT EXECUTE ON FUNCTION public.delete_client_profile() TO authenticated;

-- ── Provider-side deletion ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_provider_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         UUID := auth.uid();
  v_provider_id UUID;
  v_has_client  BOOLEAN;
  v_upcoming    INT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not authenticated');
  END IF;

  SELECT id INTO v_provider_id FROM public.providers WHERE user_id = v_uid LIMIT 1;
  IF v_provider_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no provider profile');
  END IF;

  SELECT (dob IS NOT NULL) INTO v_has_client FROM public.users WHERE id = v_uid;

  SELECT COUNT(*) INTO v_upcoming
    FROM public.bookings
   WHERE provider_id = v_provider_id
     AND booking_date >= CURRENT_DATE
     AND status IN ('pending', 'confirmed', 'in_progress');

  IF v_upcoming > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'upcoming_bookings', 'count', v_upcoming);
  END IF;

  INSERT INTO public.account_deletion_log
    (user_id, provider_id, email, deletion_type, had_client_profile, had_provider_profile, account_created_at)
  SELECT v_uid, v_provider_id, au.email,
         CASE WHEN NOT v_has_client THEN 'full_account' ELSE 'provider_profile' END,
         v_has_client, true, au.created_at
    FROM auth.users au WHERE au.id = v_uid;

  IF NOT v_has_client THEN
    UPDATE public.users     SET deletion_requested_at = NOW() WHERE id = v_uid;
    UPDATE public.providers  SET has_gone_live = false          WHERE id = v_provider_id;
    RETURN jsonb_build_object('ok', true, 'full_account_deleted', true, 'grace_period_days', 30);
  END IF;

  DELETE FROM public.reviews  WHERE provider_id = v_provider_id;
  DELETE FROM public.bookings WHERE provider_id = v_provider_id;

  DELETE FROM public.providers WHERE id = v_provider_id;

  UPDATE public.users SET
    role           = 'user',
    business_name  = NULL,
    business_email = NULL
  WHERE id = v_uid;

  RETURN jsonb_build_object('ok', true, 'full_account_deleted', false);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_provider_profile() FROM public;
GRANT EXECUTE ON FUNCTION public.delete_provider_profile() TO authenticated;
