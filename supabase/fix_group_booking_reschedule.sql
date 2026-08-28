-- ============================================================
-- CERVICED — Group-aware reschedule: provider proposes new days for a whole
-- group booking at once (auto-shifting each sibling service to keep the
-- same back-to-back order/gaps), and the client confirms/declines the
-- whole group as one unit, not service-by-service.
--
-- Run this in the Supabase SQL editor, whole file, top to bottom. Safe to
-- re-run. DEPLOYED LIVE 2026-08-09 via Supabase MCP apply_migration —
-- confirmed via pg_get_function_identity_arguments (all 3 RPCs) and
-- information_schema.columns (group_reschedule_batch_id).
--
-- WHY N ROWS, NOT A SCHEMA REDESIGN: booking_reschedule_requests is
-- UNIQUE(booking_id) and every existing RPC/trigger depends on that 1:1
-- invariant. Rather than changing that shape, a group reschedule proposal
-- writes ONE booking_reschedule_requests row per sibling (same as today),
-- each carrying that sibling's own shifted provider_available_slots
-- ({date,times}[] — unchanged shape), all stamped with a shared
-- group_reschedule_batch_id so the client can fetch/confirm/decline them
-- as one unit. This is the same "N rows, one shared id" pattern
-- group_booking_id already uses on `bookings` itself.
--
-- WHO COMPUTES THE SHIFTED TIMES: the RPC does NOT calculate availability
-- or chain-fitting — that logic already exists client-side in
-- AvailabilityService.findAllBackToBackSlots (real schedule/buffer/conflict
-- aware) and reimplementing it in SQL would be a second, divergent copy of
-- the same logic. The provider's app computes candidate chains client-side,
-- then calls this RPC with each candidate day's ALREADY-COMPUTED per-
-- sibling times. The RPC's job is purely to persist them atomically and
-- verify ownership/state — same division of labor provider_initiate_
-- reschedule already has for a single booking (it doesn't validate the
-- proposed slots are actually free either).
-- ============================================================

-- ── 1. group_reschedule_batch_id column ──────────────────────────────────
ALTER TABLE public.booking_reschedule_requests
  ADD COLUMN IF NOT EXISTS group_reschedule_batch_id UUID;

CREATE INDEX IF NOT EXISTS idx_reschedule_requests_group_batch
  ON public.booking_reschedule_requests (group_reschedule_batch_id)
  WHERE group_reschedule_batch_id IS NOT NULL;

-- ── 2. provider_initiate_group_reschedule ────────────────────────────────
-- p_proposals: one entry per sibling booking, each carrying that sibling's
-- own shifted provider_available_slots — computed client-side by
-- AvailabilityService.findAllBackToBackSlots, one call per candidate day,
-- collected into this shape before calling here:
--   [ { booking_id: uuid, available_slots: [{date, times[]}, ...] }, ... ]
-- All-or-nothing like the other group RPCs: every booking_id must belong to
-- the calling provider AND share the same group_booking_id AND be
-- 'confirmed', or the whole call raises and writes nothing.
CREATE OR REPLACE FUNCTION public.provider_initiate_group_reschedule(
  p_group_booking_id UUID,
  p_proposals JSONB  -- [{booking_id, available_slots}, ...]
) RETURNS TABLE(booking_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider_id UUID;
  v_batch_id UUID := gen_random_uuid();
  v_proposal JSONB;
  v_booking_id UUID;
  v_booking RECORD;
BEGIN
  SELECT p.id INTO v_provider_id
    FROM public.providers p WHERE p.user_id = auth.uid();

  IF v_provider_id IS NULL THEN
    RAISE EXCEPTION 'No provider profile for caller';
  END IF;

  IF jsonb_array_length(p_proposals) = 0 THEN
    RAISE EXCEPTION 'No proposals supplied';
  END IF;

  -- Phase 1: lock + validate every proposed booking belongs to this
  -- provider, is in this exact group, and is confirmed.
  FOR v_proposal IN SELECT * FROM jsonb_array_elements(p_proposals)
  LOOP
    v_booking_id := (v_proposal->>'booking_id')::UUID;

    SELECT b.id, b.status, b.group_booking_id
      INTO v_booking
      FROM public.bookings b
     WHERE b.id = v_booking_id
       AND b.provider_id = v_provider_id
     FOR UPDATE OF b;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Booking % not found or not owned by caller', v_booking_id;
    END IF;

    IF v_booking.group_booking_id IS DISTINCT FROM p_group_booking_id THEN
      RAISE EXCEPTION 'Booking % is not part of group %', v_booking_id, p_group_booking_id;
    END IF;

    IF v_booking.status <> 'confirmed' THEN
      RAISE EXCEPTION 'Only confirmed bookings can be rescheduled (booking % is %)', v_booking_id, v_booking.status;
    END IF;
  END LOOP;

  -- Phase 2: every proposal validated — write one request row per sibling,
  -- all sharing the same freshly-minted batch id.
  FOR v_proposal IN SELECT * FROM jsonb_array_elements(p_proposals)
  LOOP
    v_booking_id := (v_proposal->>'booking_id')::UUID;

    SELECT b.booking_date, b.booking_time INTO v_booking
      FROM public.bookings b WHERE b.id = v_booking_id;

    INSERT INTO public.booking_reschedule_requests
      (booking_id, requested_by, original_date, original_time, requested_dates,
       provider_available_slots, status, reschedule_count, updated_at,
       group_reschedule_batch_id)
    VALUES
      (v_booking_id, 'provider', v_booking.booking_date, v_booking.booking_time,
       ARRAY[]::DATE[], v_proposal->'available_slots', 'provider_responded', 0, NOW(),
       v_batch_id)
    ON CONFLICT (booking_id) DO UPDATE
      SET requested_by = 'provider',
          original_date = v_booking.booking_date,
          original_time = v_booking.booking_time,
          requested_dates = ARRAY[]::DATE[],
          provider_available_slots = v_proposal->'available_slots',
          status = 'provider_responded',
          updated_at = NOW(),
          group_reschedule_batch_id = v_batch_id;
  END LOOP;

  RETURN QUERY
    SELECT (v_proposal->>'booking_id')::UUID
    FROM jsonb_array_elements(p_proposals) v_proposal;
END;
$$;

REVOKE ALL ON FUNCTION public.provider_initiate_group_reschedule(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provider_initiate_group_reschedule(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.provider_initiate_group_reschedule(uuid, jsonb) TO authenticated;

-- ── 3. confirm_group_reschedule ──────────────────────────────────────────
-- Client confirms one specific day for the whole group. p_selections: one
-- entry per sibling with the EXACT date/time/end_time the client is
-- confirming for that sibling (client picked ONE chain from the proposed
-- options — see AvailabilityService client-side; this RPC trusts the
-- caller picked a self-consistent chain, same as confirm_reschedule_own_
-- booking already trusts newDate/newTime for a single booking without
-- re-deriving them from provider_available_slots server-side).
-- All-or-nothing: every sibling must have an active 'provider_responded'
-- request row owned by this client, or nothing is written.
CREATE OR REPLACE FUNCTION public.confirm_group_reschedule(
  p_group_booking_id UUID,
  p_selections JSONB  -- [{booking_id, new_date, new_time, new_end_time}, ...]
) RETURNS TABLE(booking_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_selection JSONB;
  v_booking_id UUID;
  v_found BOOLEAN;
BEGIN
  IF jsonb_array_length(p_selections) = 0 THEN
    RAISE EXCEPTION 'No selections supplied';
  END IF;

  -- Phase 1: lock + validate every sibling has an active provider-responded
  -- request, owned by the calling client, in this exact group.
  FOR v_selection IN SELECT * FROM jsonb_array_elements(p_selections)
  LOOP
    v_booking_id := (v_selection->>'booking_id')::UUID;

    SELECT EXISTS (
      SELECT 1
      FROM public.booking_reschedule_requests r
      JOIN public.bookings b ON b.id = r.booking_id
      WHERE r.booking_id = v_booking_id
        AND b.user_id = auth.uid()
        AND b.group_booking_id = p_group_booking_id
        AND r.status = 'provider_responded'
      FOR UPDATE OF r, b
    ) INTO v_found;

    IF NOT v_found THEN
      RAISE EXCEPTION 'No provider-responded reschedule request found for booking % in this group', v_booking_id;
    END IF;
  END LOOP;

  -- Phase 2: every sibling validated — apply each one's confirmed
  -- date/time, increment reschedule bookkeeping, close its request row.
  FOR v_selection IN SELECT * FROM jsonb_array_elements(p_selections)
  LOOP
    v_booking_id := (v_selection->>'booking_id')::UUID;

    UPDATE public.bookings
       SET booking_date = (v_selection->>'new_date')::DATE,
           booking_time = (v_selection->>'new_time')::TIME,
           end_time = (v_selection->>'new_end_time')::TIME,
           reschedule_count = COALESCE(reschedule_count, 0) + 1,
           last_rescheduled_at = NOW()
     WHERE id = v_booking_id;

    UPDATE public.booking_reschedule_requests
       SET status = 'confirmed',
           updated_at = NOW()
     WHERE booking_id = v_booking_id;
  END LOOP;

  RETURN QUERY
    SELECT (v_selection->>'booking_id')::UUID
    FROM jsonb_array_elements(p_selections) v_selection;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_group_reschedule(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.confirm_group_reschedule(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.confirm_group_reschedule(uuid, jsonb) TO authenticated;

-- ── 4. decline_group_reschedule_offer ────────────────────────────────────
-- Client declines the whole group's offered times at once. Symmetrical to
-- decline_reschedule_offer — bookings are untouched, only the request rows
-- close. All-or-nothing on the LOCK/validate phase (every sibling must have
-- an active provider_responded row owned by this client in this group) —
-- but note declining is idempotent/harmless to partially apply, unlike
-- confirm, so this still validates all-up-front for consistency with the
-- other group RPCs' shape, not because a partial decline would be unsafe.
CREATE OR REPLACE FUNCTION public.decline_group_reschedule_offer(
  p_group_booking_id UUID
) RETURNS TABLE(booking_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT r.booking_id
      FROM public.booking_reschedule_requests r
      JOIN public.bookings b ON b.id = r.booking_id
     WHERE b.user_id = auth.uid()
       AND b.group_booking_id = p_group_booking_id
       AND r.status = 'provider_responded'
     FOR UPDATE OF r
  LOOP
    NULL; -- lock pass
  END LOOP;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No provider-responded reschedule requests found for this group';
  END IF;

  RETURN QUERY
    UPDATE public.booking_reschedule_requests r
       SET status = 'rejected',
           updated_at = NOW()
      FROM public.bookings b
     WHERE r.booking_id = b.id
       AND b.user_id = auth.uid()
       AND b.group_booking_id = p_group_booking_id
       AND r.status = 'provider_responded'
    RETURNING r.booking_id;
END;
$$;

REVOKE ALL ON FUNCTION public.decline_group_reschedule_offer(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decline_group_reschedule_offer(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.decline_group_reschedule_offer(uuid) TO authenticated;

-- ── Notes on notification fan-out ────────────────────────────────────────
-- The group_reschedule_batch_id column this file adds is what makes the
-- reschedule-notification dedup possible — see the follow-up file
-- supabase/fix_group_reschedule_notification_dedup.sql (deployed
-- 2026-08-09), which redefines handle_reschedule_request_change() to send
-- exactly ONE notification per group per lifecycle event (proposal /
-- confirm / decline) instead of one per sibling, using the same
-- representative-row pattern as the booking-status trigger but keyed on
-- group_reschedule_batch_id. When this file first shipped that dedup was
-- deliberately left as a flagged follow-up rather than deciding
-- notification copy unilaterally; it's since been done.
--
-- ── Verification (once Supabase MCP reconnects) ─────────────────────────
--   select proname, pg_get_function_identity_arguments(oid) from pg_proc
--   where proname in ('provider_initiate_group_reschedule',
--                      'confirm_group_reschedule',
--                      'decline_group_reschedule_offer')
--   and pronamespace = 'public'::regnamespace;
--
--   select column_name from information_schema.columns
--   where table_name = 'booking_reschedule_requests'
--     and column_name = 'group_reschedule_batch_id';
-- ============================================================
