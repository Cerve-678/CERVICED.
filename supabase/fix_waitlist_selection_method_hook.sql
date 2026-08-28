-- ════════════════════════════════════════════════════════════════════════════
-- fix_waitlist_selection_method_hook.sql
--
-- GAP: invite_next_waitlist_entry() orders candidates strictly
-- `ORDER BY (service_id IS NOT NULL AND service_id = p_service_id) DESC,
-- position ASC` — pure FIFO (by waitlist position), zero provider input.
-- Confirmed live via pg_get_functiondef 2026-08-17.
--
-- SCOPE FOR THIS PASS: schema hook only, not a full manual-selection
-- feature. Adds booking_policies.waitlistSelectionMethod ('fifo' | 'manual',
-- default 'fifo' when absent — JSONB key, no migration needed to add it).
-- The RPC reads it defensively and keeps doing exactly what it does today
-- when the value is 'fifo' (or missing/anything other than a recognized
-- future value) — no real alternate-selection-strategy logic is implemented
-- here. This just avoids the field being a dead end for a later
-- manual-selection feature.
--
-- IMPORTANT — layered on top of in-progress work, not reverting it:
-- invite_next_waitlist_entry() is mid-edit from an unrelated fix
-- (supabase/migrations/20260817110500_waitlist_lapse_and_exhaustion_
-- notifications.sql — VOID -> BOOLEAN return type, TRUE = someone was
-- offered the slot, FALSE = queue exhausted, feeding provider "waitlist
-- exhausted" notifications from expire_waitlist_holds()/
-- decline_waitlist_hold()). Confirmed via pg_get_functiondef that this
-- BOOLEAN-returning version, byte-for-byte matching that migration file, is
-- ALREADY LIVE — i.e. that migration has already been applied. This fix is
-- written as a CREATE OR REPLACE on top of that exact live/pending body
-- (same signature, same RETURNS boolean, same loop/exception/notification
-- logic), not the old VOID version, so it does not clobber or regress that
-- work. expire_waitlist_holds() and decline_waitlist_hold() are untouched —
-- their call sites and signatures don't change.
--
-- Safe to re-run (CREATE OR REPLACE; DROP FUNCTION IF EXISTS guards the
-- original VOID-signature drop exactly as the source migration did, a no-op
-- since that signature is no longer live).
-- ════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.invite_next_waitlist_entry(UUID, UUID, DATE, TIME, TIME, NUMERIC, NUMERIC, NUMERIC, TEXT);

CREATE OR REPLACE FUNCTION public.invite_next_waitlist_entry(
  p_provider_id UUID,
  p_service_id  UUID,
  p_booking_date DATE DEFAULT NULL,
  p_booking_time TIME DEFAULT NULL,
  p_end_time TIME DEFAULT NULL,
  p_base_price NUMERIC DEFAULT NULL,
  p_add_ons_total NUMERIC DEFAULT NULL,
  p_service_charge NUMERIC DEFAULT NULL,
  p_service_category_snapshot TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  w                   RECORD;
  v_waitlist_enabled  BOOLEAN;
  v_auto_accept       BOOLEAN;
  v_selection_method  TEXT;
  v_new_booking_id    UUID;
BEGIN
  SELECT COALESCE((automation_settings->>'waitlistEnabled')::boolean, TRUE),
         COALESCE((automation_settings->>'autoAcceptWaitlist')::boolean, FALSE),
         COALESCE(booking_policies->>'waitlistSelectionMethod', 'fifo')
    INTO v_waitlist_enabled, v_auto_accept, v_selection_method
    FROM public.providers WHERE id = p_provider_id;

  IF NOT COALESCE(v_waitlist_enabled, TRUE) THEN
    RETURN FALSE;
  END IF;
  IF p_booking_date IS NULL OR p_booking_time IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Selection strategy hook: 'manual' is reserved for a future feature (a
  -- provider hand-picking who gets offered a freed slot instead of strict
  -- FIFO). No selection logic is implemented for it yet — every value,
  -- including 'manual' today, falls through to the same FIFO ordering below,
  -- so this is a schema/read hook only, not a behavior change.
  IF v_selection_method IS DISTINCT FROM 'fifo' THEN
    NULL; -- reserved for future manual-selection logic; FIFO fallback below
  END IF;

  FOR w IN
    SELECT *
      FROM public.provider_waitlist
     WHERE provider_id = p_provider_id
       AND status = 'waiting'
       AND (service_id = p_service_id OR service_id IS NULL)
       -- preferred_dates[1] = range start, preferred_dates[2] = range end
       -- (absent = open-ended); NULL array = no preference, any date works.
       AND (
         preferred_dates IS NULL
         OR (p_booking_date >= preferred_dates[1]
             AND p_booking_date <= COALESCE(preferred_dates[2], 'infinity'::date))
       )
     ORDER BY (service_id IS NOT NULL AND service_id = p_service_id) DESC,
              position ASC
  LOOP
    BEGIN
      IF v_auto_accept THEN
        INSERT INTO public.bookings (
          user_id, provider_id, service_id, status,
          booking_date, booking_time, end_time,
          payment_type, base_price, add_ons_total, service_charge,
          deposit_amount, amount_paid, remaining_balance, payment_status,
          is_group_booking, group_booking_count,
          provider_name_snapshot, service_name_snapshot, service_category_snapshot,
          customer_name, waitlist_entry_id
        ) VALUES (
          w.user_id, p_provider_id, p_service_id, 'pending',
          p_booking_date, p_booking_time, p_end_time,
          'full', COALESCE(p_base_price, 0), COALESCE(p_add_ons_total, 0), COALESCE(p_service_charge, 0),
          0, 0, COALESCE(p_base_price, 0) + COALESCE(p_add_ons_total, 0) + COALESCE(p_service_charge, 0), 'pending',
          FALSE, 1,
          w.provider_name_snapshot, w.service_name_snapshot, p_service_category_snapshot,
          w.user_name_snapshot, w.id
        )
        RETURNING id INTO v_new_booking_id;

        UPDATE public.provider_waitlist SET status = 'booked', notified_at = NOW() WHERE id = w.id;
        RETURN TRUE;
      ELSE
        -- Real, exclusive hold — not just a notification. Blocks the slot
        -- from everyone else via bookings_no_overlap (prevent_overlapping_
        -- bookings.sql) and enforce_booking_bookability's own overlap check.
        INSERT INTO public.bookings (
          user_id, provider_id, service_id, status,
          booking_date, booking_time, end_time,
          payment_type, base_price, add_ons_total, service_charge,
          deposit_amount, amount_paid, remaining_balance, payment_status,
          is_group_booking, group_booking_count,
          provider_name_snapshot, service_name_snapshot, service_category_snapshot,
          customer_name, waitlist_entry_id, hold_expires_at
        ) VALUES (
          w.user_id, p_provider_id, p_service_id, 'on_hold',
          p_booking_date, p_booking_time, p_end_time,
          'full', COALESCE(p_base_price, 0), COALESCE(p_add_ons_total, 0), COALESCE(p_service_charge, 0),
          0, 0, COALESCE(p_base_price, 0) + COALESCE(p_add_ons_total, 0) + COALESCE(p_service_charge, 0), 'pending',
          FALSE, 1,
          w.provider_name_snapshot, w.service_name_snapshot, p_service_category_snapshot,
          w.user_name_snapshot, w.id, NOW() + INTERVAL '3 hours'
        )
        RETURNING id INTO v_new_booking_id;

        UPDATE public.provider_waitlist SET status = 'notified', notified_at = NOW() WHERE id = w.id;

        INSERT INTO public.notifications
          (user_id, type, title, message, priority, is_actionable, provider_id, recipient_role, booking_id)
        VALUES (
          w.user_id,
          'waitlist_slot_available',
          'A slot opened up!',
          w.service_name_snapshot || ' with ' || w.provider_name_snapshot ||
            ' — ' || TO_CHAR(p_booking_date, 'DD Mon') || ' at ' || TO_CHAR(p_booking_time, 'HH12:MI AM') ||
            ' is held for you for 3 hours. Confirm now before it goes to the next person.',
          'high',
          TRUE,
          p_provider_id,
          'client',
          v_new_booking_id
        );
        RETURN TRUE;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Bookability rules changed since the original booking was made (or a
      -- concurrent write already claimed the slot) — try the next candidate
      -- instead of leaving the slot un-offered to anyone.
      CONTINUE;
    END;
  END LOOP;
  -- Loop exhausted with no eligible candidate.
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Preserve existing lockdown pattern (CREATE OR REPLACE preserves existing
-- grants, but stay explicit and match waitlist_holds.sql's original list).
GRANT EXECUTE ON FUNCTION public.invite_next_waitlist_entry(UUID, UUID, DATE, TIME, TIME, NUMERIC, NUMERIC, NUMERIC, TEXT) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.invite_next_waitlist_entry(UUID, UUID, DATE, TIME, TIME, NUMERIC, NUMERIC, NUMERIC, TEXT) FROM public;
REVOKE EXECUTE ON FUNCTION public.invite_next_waitlist_entry(UUID, UUID, DATE, TIME, TIME, NUMERIC, NUMERIC, NUMERIC, TEXT) FROM anon;

-- ───────────────────────────────────────────────────────────
-- VERIFY
--   SELECT prorettype::regtype FROM pg_proc
--    WHERE proname = 'invite_next_waitlist_entry' AND pronamespace = 'public'::regnamespace;
--    → expect boolean (unchanged by this file)
--
--   SELECT pg_get_functiondef(oid) FROM pg_proc
--    WHERE proname = 'invite_next_waitlist_entry';
--    → expect v_selection_method read present, FIFO ORDER BY unchanged
-- ───────────────────────────────────────────────────────────

-- ============================================================
-- DONE — schema hook only: booking_policies.waitlistSelectionMethod read
-- defensively, FIFO behavior unchanged. No manual-selection logic; no
-- provider-facing UI added (InfoRegScreen.tsx has no existing waitlist-
-- settings section — waitlistEnabled/autoAcceptWaitlist live in
-- automation_settings and are edited in ProviderAutomationsScreen.tsx, a
-- different screen/JSONB column than this task's UI instruction targeted).
-- ============================================================
