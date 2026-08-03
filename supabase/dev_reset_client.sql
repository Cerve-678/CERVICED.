-- ============================================================
-- DEV TOOL: full client reset  (DESTRUCTIVE, self-scoped)
-- ------------------------------------------------------------
-- Run once in the Supabase SQL editor. Client-side counterpart to
-- dev_reset_provider.sql (that one only clears bookings where
-- provider_id = your own provider row, so it does nothing for a
-- booking you made as a client with someone else's provider).
--
-- SECURITY: runs as definer (bypasses RLS so it can delete), but
-- every statement is scoped to auth.uid()'s OWN client-side rows,
-- so a caller can only ever wipe bookings/reviews/notifications
-- they themselves authored as a customer — never another user's
-- data, and never the provider side of a dual-hat account.
--
-- transactions are deliberately NOT deleted here — see
-- transactions_survive_account_deletion.sql / delete_account.sql,
-- which treat transaction history as permanent (pseudonymised on
-- account deletion, never dropped) even for a real account close.
-- A dev reset shouldn't touch it either.
-- ============================================================

CREATE OR REPLACE FUNCTION public.dev_reset_client()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_bookings  INT := 0;
  v_reviews   INT := 0;
  v_notifs    INT := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not authenticated');
  END IF;

  -- reviews reference bookings with no ON DELETE CASCADE, so they
  -- must be removed before the bookings they point at.
  DELETE FROM public.reviews  WHERE user_id = v_uid;
  GET DIAGNOSTICS v_reviews = ROW_COUNT;

  -- Bookings made BY this user as a client. Cascades to add-ons,
  -- reschedule requests, intake forms + info packs.
  DELETE FROM public.bookings WHERE user_id = v_uid;
  GET DIAGNOSTICS v_bookings = ROW_COUNT;

  -- This user's own notifications.
  DELETE FROM public.notifications WHERE user_id = v_uid;
  GET DIAGNOSTICS v_notifs = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', v_uid,
    'deleted', jsonb_build_object(
      'bookings',      v_bookings,
      'reviews',       v_reviews,
      'notifications', v_notifs
    )
  );
END;
$$;

-- Only logged-in users may call it; it self-scopes to their own rows.
REVOKE ALL ON FUNCTION public.dev_reset_client() FROM public;
GRANT EXECUTE ON FUNCTION public.dev_reset_client() TO authenticated;
