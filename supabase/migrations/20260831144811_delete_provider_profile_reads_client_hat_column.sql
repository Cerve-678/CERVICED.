-- delete_provider_profile() decided whether the account keeps living by asking
-- `dob IS NOT NULL` — the exact inference migration 20260823105742 replaced
-- when the client hat got its own column. Its sibling delete_client_profile()
-- was updated at the time (it writes has_client_profile = false); this one was
-- missed, so it has been answering the question with the wrong column ever
-- since. Two ways that goes wrong, both bad:
--
--   * provider with a DOB but no client hat -> reads as dual-hat, so the
--     account is kept with role reset to 'user' and no client profile: an
--     account with no hats at all, and an account_deletion_log row claiming
--     had_client_profile = true.
--   * provider with a real client hat but no DOB (the client->provider upgrade
--     never collected one, which is what the column was introduced to fix) ->
--     reads as provider-only, so the WHOLE account is scheduled for deletion,
--     taking a live client profile with it.
--
-- Body below is the live definition, unchanged except for that read and the
-- metadata reset noted inline. SECURITY DEFINER and SET search_path are
-- reproduced deliberately — CREATE OR REPLACE would otherwise drop them.
CREATE OR REPLACE FUNCTION public.delete_provider_profile()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- The column that owns the client hat. Was `(dob IS NOT NULL)`.
  SELECT COALESCE(has_client_profile, false) INTO v_has_client
    FROM public.users WHERE id = v_uid;

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

  -- auth metadata carries a `role` mirror that AuthContext falls back to when
  -- the profile fetch fails. Nothing ever reset it here, so an account that
  -- dropped its provider hat kept advertising one forever — which is how a hat
  -- the user no longer holds comes back on a bad launch. users.role stays the
  -- source of truth; this only stops the mirror contradicting it.
  UPDATE auth.users
     SET raw_user_meta_data =
           jsonb_set(COALESCE(raw_user_meta_data, '{}'::jsonb), '{role}', '"user"')
   WHERE id = v_uid;

  RETURN jsonb_build_object('ok', true, 'full_account_deleted', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_provider_profile() FROM public;
GRANT EXECUTE ON FUNCTION public.delete_provider_profile() TO authenticated;

-- One-off repair of the drift that already exists: users.role is the source of
-- truth, the metadata copy is only a mirror, and at least one live account
-- (role 'provider', metadata 'user') disagrees. Caused by promoteUserToProvider,
-- the second writer of users.role, which never synced the mirror the way
-- upgradeUserToProvider does.
UPDATE auth.users au
   SET raw_user_meta_data =
         jsonb_set(COALESCE(au.raw_user_meta_data, '{}'::jsonb), '{role}', to_jsonb(u.role))
  FROM public.users u
 WHERE u.id = au.id
   AND COALESCE(au.raw_user_meta_data->>'role', '') IS DISTINCT FROM u.role;
