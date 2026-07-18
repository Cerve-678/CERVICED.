-- ============================================================
-- DEV TOOL: full provider reset  (DESTRUCTIVE, self-scoped)
-- ------------------------------------------------------------
-- Run once in the Supabase SQL editor. The app calls it via
--   supabase.rpc('dev_reset_provider')
-- from the Developer Settings screen.
--
-- SECURITY: runs as definer (bypasses RLS so it can delete), but
-- every statement is scoped to auth.uid()'s OWN provider, so a
-- caller can only ever wipe their own data. A non-provider caller
-- is a no-op.
-- ============================================================

CREATE OR REPLACE FUNCTION public.dev_reset_provider()
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
  v_transactions INT := 0;
  v_notifs       INT := 0;
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

  -- reviews + transactions have NOT NULL booking_id with no ON DELETE CASCADE,
  -- so they must be removed before the bookings they point at.
  DELETE FROM public.reviews      WHERE provider_id = v_provider_id;
  GET DIAGNOSTICS v_reviews = ROW_COUNT;

  DELETE FROM public.transactions WHERE provider_id = v_provider_id;
  GET DIAGNOSTICS v_transactions = ROW_COUNT;

  -- Bookings cascade to add-ons, reschedule requests, intake forms + info packs.
  DELETE FROM public.bookings     WHERE provider_id = v_provider_id;
  GET DIAGNOSTICS v_bookings = ROW_COUNT;

  -- This user's own notifications.
  DELETE FROM public.notifications WHERE user_id = v_uid;
  GET DIAGNOSTICS v_notifs = ROW_COUNT;

  -- Reset go-live so the onboarding / go-live flow can be re-tested.
  UPDATE public.providers SET has_gone_live = false WHERE id = v_provider_id;

  RETURN jsonb_build_object(
    'ok', true,
    'provider_id', v_provider_id,
    'deleted', jsonb_build_object(
      'bookings',      v_bookings,
      'reviews',       v_reviews,
      'transactions',  v_transactions,
      'notifications', v_notifs
    ),
    'has_gone_live', false
  );
END;
$$;

-- Only logged-in users may call it; it self-scopes to their own provider.
REVOKE ALL ON FUNCTION public.dev_reset_provider() FROM public;
GRANT EXECUTE ON FUNCTION public.dev_reset_provider() TO authenticated;
