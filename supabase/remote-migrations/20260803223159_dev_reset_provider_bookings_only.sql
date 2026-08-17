-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260803223159
-- Remote name: dev_reset_provider_bookings_only
-- Do not edit this recovery archive; create a new tracked migration for changes.

CREATE OR REPLACE FUNCTION public.dev_reset_provider_bookings_only()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          UUID := auth.uid();
  v_provider_id  UUID;
  v_bookings     INT := 0;
  v_reviews      INT := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not authenticated');
  END IF;

  SELECT id INTO v_provider_id
    FROM public.providers
   WHERE user_id = v_uid
   LIMIT 1;

  IF v_provider_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no provider row for this user');
  END IF;

  DELETE FROM public.reviews  WHERE provider_id = v_provider_id;
  GET DIAGNOSTICS v_reviews = ROW_COUNT;

  DELETE FROM public.bookings WHERE provider_id = v_provider_id;
  GET DIAGNOSTICS v_bookings = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'provider_id', v_provider_id,
    'deleted', jsonb_build_object(
      'bookings', v_bookings,
      'reviews',  v_reviews
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dev_reset_provider_bookings_only() FROM public;
GRANT EXECUTE ON FUNCTION public.dev_reset_provider_bookings_only() TO authenticated;
