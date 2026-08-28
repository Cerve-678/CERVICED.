-- PROVENANCE: applied out-of-band (SQL editor), so it has NO row in
-- supabase_migrations.schema_migrations and does NOT appear in
-- supabase/remote-migrations/. Confirmed live 2026-08-20 during the
-- migration-record reconciliation: provider_create_manual_booking() carries p_extra_minutes live.
-- BACKFILLED 2026-08-27: it now HAS a schema_migrations row at the version
-- above, so it no longer reads as unapplied to a ledger diff. Leaving it
-- un-backfilled had cost three separate re-investigations (2026-08-20,
-- 08-25, 08-27), which is what the missing row actually buys you. The row's
-- `statements` records only a pointer back to this file plus how it was
-- verified -- no SQL was re-executed to create it, because the text actually
-- run out-of-band was never captured. THIS FILE remains the authoritative
-- body; the ledger row is a record that it ran, not a copy of what ran.

-- ════════════════════════════════════════════════════════════════════════════
-- manual_booking_extra_minutes.sql
--
-- GAP: provider_create_manual_booking() locked a manual booking's duration
-- 100% to the service definition (v_service.duration_minutes) with no
-- provider override — even though the provider often has better information
-- at booking time than at service-creation time (e.g. "this client's hair
-- is extra thick, I need 30 extra minutes").
--
-- FIX: add p_extra_minutes, purely a scheduling buffer, NOT a paid add-on.
--   - Extends v_end_time only. base_price/add_ons_total/service_charge are
--     untouched — zero billing effect, by design.
--   - Clamped 0..240 (4 hours) so a fat-fingered or malicious value can't
--     block out a provider's entire day; rejects negative values outright
--     rather than silently clamping them to 0, so a caller bug is loud.
--
-- Verified live via pg_get_functiondef (Supabase CLI `supabase db query
-- --linked`, MCP tool connector was down) immediately before writing this —
-- signature matches supabase/migrations/20260817150000_manual_booking_
-- scheduling_policy_override.sql exactly (8 args, v_end_time computed from
-- v_service.duration_minutes alone). This migration only touches the
-- v_end_time line and the parameter list; every other line is unchanged
-- from that file.
-- ════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.provider_create_manual_booking(
  uuid, uuid, date, time, text, uuid[], boolean, boolean
);

CREATE OR REPLACE FUNCTION public.provider_create_manual_booking(
  p_client_user_id uuid,
  p_service_id uuid,
  p_booking_date date,
  p_booking_time time without time zone,
  p_notes text DEFAULT NULL::text,
  p_add_on_ids uuid[] DEFAULT '{}'::uuid[],
  p_safety_ack boolean DEFAULT false,
  p_override_scheduling boolean DEFAULT false,
  p_extra_minutes integer DEFAULT 0
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_provider public.providers%ROWTYPE;
  v_service public.services%ROWTYPE;
  v_client public.users%ROWTYPE;
  v_booking_id uuid;
  v_end_time time;
  v_daily_booking_cap integer;
  v_active_booking_count integer;
  v_add_ons_total numeric(10,2) := 0;
  v_safety_required boolean;
  v_extra_minutes integer;
BEGIN
  SELECT p.* INTO v_provider
    FROM public.providers p
   WHERE p.user_id = auth.uid()
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only the owning provider can add a booking';
  END IF;

  SELECT s.* INTO v_service
    FROM public.services s
   WHERE s.id = p_service_id
     AND s.provider_id = v_provider.id
     AND s.is_active = TRUE
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service is not active for this provider';
  END IF;

  SELECT u.* INTO v_client
    FROM public.users u
   WHERE u.id = p_client_user_id
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client account was not found';
  END IF;

  IF p_booking_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Booking date cannot be in the past';
  END IF;
  IF p_booking_time IS NULL THEN
    RAISE EXCEPTION 'Booking time is required';
  END IF;

  v_extra_minutes := COALESCE(p_extra_minutes, 0);
  IF v_extra_minutes < 0 THEN
    RAISE EXCEPTION 'Extra time cannot be negative';
  END IF;
  IF v_extra_minutes > 240 THEN
    RAISE EXCEPTION 'Extra time cannot exceed 4 hours';
  END IF;

  v_safety_required := COALESCE(v_service.patch_test_required, false)
    OR v_service.is_pregnancy_safe = false;
  IF v_safety_required AND NOT COALESCE(p_safety_ack, false) THEN
    RAISE EXCEPTION 'Please confirm the client has been told this treatment''s safety requirements';
  END IF;

  v_end_time := p_booking_time + make_interval(mins => v_service.duration_minutes + v_extra_minutes);

  IF p_add_on_ids IS NOT NULL AND array_length(p_add_on_ids, 1) > 0 THEN
    SELECT COALESCE(SUM(sao.price), 0) INTO v_add_ons_total
      FROM public.service_add_ons sao
     WHERE sao.id = ANY(p_add_on_ids)
       AND sao.service_id = p_service_id
       AND sao.is_active = TRUE;
  END IF;

  v_daily_booking_cap := COALESCE(v_provider.max_bookings_per_day, 0);
  IF v_daily_booking_cap > 0 THEN
    SELECT count(*) INTO v_active_booking_count
      FROM public.bookings b
     WHERE b.provider_id = v_provider.id
       AND b.booking_date = p_booking_date
       AND b.status IN ('pending', 'confirmed', 'in_progress', 'on_hold');
    IF v_active_booking_count >= v_daily_booking_cap THEN
      RAISE EXCEPTION 'This provider has reached their booking limit for that date';
    END IF;
  END IF;

  PERFORM set_config('cerviced.bypass_working_hours', 'on', true);

  IF p_override_scheduling THEN
    PERFORM set_config('cerviced.bypass_scheduling_policy', 'on', true);
  END IF;

  INSERT INTO public.bookings (
    user_id, provider_id, service_id, status,
    booking_date, booking_time, end_time, notes,
    payment_type, base_price, add_ons_total, service_charge,
    deposit_amount, amount_paid, remaining_balance, payment_status,
    provider_name_snapshot, service_name_snapshot, service_category_snapshot,
    provider_logo_snapshot, customer_name, customer_email, customer_phone,
    safety_ack_required, safety_ack_at
  ) VALUES (
    v_client.id, v_provider.id, v_service.id, 'on_hold',
    p_booking_date, p_booking_time, v_end_time, NULLIF(btrim(p_notes), ''),
    'full', v_service.price, v_add_ons_total, 0,
    0, 0, v_service.price + v_add_ons_total, 'pending',
    v_provider.display_name, v_service.name, v_provider.service_category,
    v_provider.logo_url, v_client.name, v_client.email, v_client.phone,
    v_safety_required, CASE WHEN v_safety_required THEN now() ELSE NULL END
  ) RETURNING id INTO v_booking_id;

  IF p_add_on_ids IS NOT NULL AND array_length(p_add_on_ids, 1) > 0 THEN
    INSERT INTO public.booking_add_ons (booking_id, add_on_id, name_snapshot, price_snapshot)
    SELECT v_booking_id, sao.id, sao.name, sao.price
      FROM public.service_add_ons sao
     WHERE sao.id = ANY(p_add_on_ids)
       AND sao.service_id = p_service_id
       AND sao.is_active = TRUE;
  END IF;

  UPDATE public.bookings
     SET status = 'confirmed', confirmed_at = now()
   WHERE id = v_booking_id;

  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
  VALUES (
    v_client.id, 'booking_confirmed', 'Booking Confirmed! 🎉',
    v_provider.display_name || ' booked your ' || v_service.name ||
      ' for ' || to_char(p_booking_date, 'DD Mon YYYY') ||
      ' at ' || to_char(p_booking_time, 'HH12:MI AM') || '.',
    'high', TRUE, v_booking_id, v_provider.id, 'client'
  );
  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
  VALUES (
    v_provider.user_id, 'booking_confirmed', 'Manual Booking Added',
    COALESCE(v_client.name, 'Client') || ' was added for ' || v_service.name ||
      ' on ' || to_char(p_booking_date, 'DD Mon YYYY') ||
      ' at ' || to_char(p_booking_time, 'HH12:MI AM') || '.',
    'medium', FALSE, v_booking_id, v_provider.id, 'provider'
  );

  RETURN v_booking_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.provider_create_manual_booking(
  uuid, uuid, date, time, text, uuid[], boolean, boolean, integer
) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.provider_create_manual_booking(
  uuid, uuid, date, time, text, uuid[], boolean, boolean, integer
) FROM public;
REVOKE EXECUTE ON FUNCTION public.provider_create_manual_booking(
  uuid, uuid, date, time, text, uuid[], boolean, boolean, integer
) FROM anon;
