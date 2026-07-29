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
  v_windows      INT := 0;
  v_avail        INT := 0;
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

  -- Clear the schedule so the go-live checklist re-appears (ProviderHome gates
  -- go-live on an open schedule) AND has_gone_live stays false: the
  -- on_availability_window_change trigger only re-sets it TRUE on INSERT/UPDATE,
  -- never on DELETE. Services are intentionally left intact.
  DELETE FROM public.provider_availability_windows WHERE provider_id = v_provider_id;
  GET DIAGNOSTICS v_windows = ROW_COUNT;

  DELETE FROM public.provider_availability WHERE provider_id = v_provider_id;
  GET DIAGNOSTICS v_avail = ROW_COUNT;

  -- Reset go-live so the onboarding / go-live flow can be re-tested. Done last,
  -- after the schedule is gone, so nothing flips it back to TRUE.
  UPDATE public.providers SET has_gone_live = false WHERE id = v_provider_id;

  RETURN jsonb_build_object(
    'ok', true,
    'provider_id', v_provider_id,
    'deleted', jsonb_build_object(
      'bookings',           v_bookings,
      'reviews',            v_reviews,
      'transactions',       v_transactions,
      'notifications',      v_notifs,
      'schedule_windows',   v_windows,
      'availability_days',  v_avail
    ),
    'has_gone_live', false
  );
END;
$$;

-- Only logged-in users may call it; it self-scopes to their own provider.
REVOKE ALL ON FUNCTION public.dev_reset_provider() FROM public;
GRANT EXECUTE ON FUNCTION public.dev_reset_provider() TO authenticated;
