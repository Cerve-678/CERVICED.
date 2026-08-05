-- ============================================================
-- DEV TOOL: provider bookings-only reset  (DESTRUCTIVE, self-scoped)
-- ------------------------------------------------------------
-- Run once in the Supabase SQL editor. Narrower sibling of
-- dev_reset_provider.sql — that one also wipes transactions, the
-- schedule (provider_availability / provider_availability_windows),
-- and resets has_gone_live to false. This one ONLY clears bookings
-- (and reviews, which cannot outlive the booking they reference) made
-- by OTHER users against this provider's profile. Use this when you
-- want a clean booking list without re-doing the go-live checklist or
-- losing your schedule/services.
--
-- SECURITY: runs as definer (bypasses RLS so it can delete), but
-- every statement is scoped to auth.uid()'s OWN provider, so a
-- caller can only ever wipe their own provider's bookings. A
-- non-provider caller is a no-op.
--
-- transactions are NOT deleted (transactions_survive_account_deletion.sql
-- already dropped the FK to bookings — transaction history is
-- permanent/pseudonymised, never tied to a live booking row).
-- Schedule, services, has_gone_live are NOT touched.
-- ============================================================

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

  -- reviews have NOT NULL booking_id with no ON DELETE CASCADE (NO ACTION),
  -- so they must be removed before the bookings they point at.
  DELETE FROM public.reviews  WHERE provider_id = v_provider_id;
  GET DIAGNOSTICS v_reviews = ROW_COUNT;

  -- Bookings made by OTHER users against this provider. Cascades to
  -- add-ons, reschedule requests, intake forms, info packs, messages.
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

-- Only logged-in users may call it; it self-scopes to their own provider.
REVOKE ALL ON FUNCTION public.dev_reset_provider_bookings_only() FROM public;
GRANT EXECUTE ON FUNCTION public.dev_reset_provider_bookings_only() TO authenticated;
