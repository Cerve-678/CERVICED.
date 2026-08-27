-- ════════════════════════════════════════════════════════════════════════════
-- 20260827154500_no_show_disputes.sql
--
-- WHY: a no-show is an accusation made about someone who is not in the room to
-- answer it, and it is terminal — provider_update_booking_status() and
-- client_mark_provider_no_show() both refuse to write over 'no_show' /
-- 'provider_no_show', so nothing in the app can move a booking back out of one.
-- Until now the accused party's only recourse was a support email that carried
-- no link to the booking, and marking a client no-show incremented
-- client_provider_reliability.no_show_count IMMEDIATELY — a permanent mark
-- against them, applied before they had heard about it, let alone answered.
--
-- Both confirmation dialogs (ProviderBookingDetailScreen.handleStatusChange and
-- BookingDetailScreen's "Provider didn't show up?" modal) now tell the person
-- pressing the button that the other party "will have a chance to dispute and
-- escalate the no-show if it's false". This migration is what makes that true.
--
-- WHAT THIS IS NOT: an adjudication system. Cerviced does not decide who is
-- right, and nothing here reverses a no-show. It records the disagreement,
-- tells the other party, and stops an uncontested counter from hardening
-- against someone who says it did not happen. Any actual resolution is a human
-- reading the support ticket. Options that WOULD adjudicate or reverse are
-- deliberately deferred — see FUTURE_LOGIC.md "No-show disputes".
--
-- VERIFIED LIVE BEFORE WRITING (pg_get_functiondef / pg_get_viewdef /
-- pg_constraint, 2026-08-27 — this repo has documented drift between
-- supabase/*.sql files and what is actually deployed, see
-- supabase-migration-tracking-gap in memory). The two RPC bodies and the
-- client_bookings view below are the live definitions with only the changes
-- described here applied to them.
--
-- ── The counter, restated ──────────────────────────────────────────────────
-- no_show_count is no longer incremented at the moment of the accusation.
-- A no-show now becomes a permanent count only after NO_SHOW_DISPUTE_WINDOW
-- has passed with no dispute, applied by settle_no_show_reliability() on a
-- daily cron. A dispute stops that clock permanently: the booking stays
-- uncounted until a human resolves it. This is the whole point — a contested
-- accusation must not quietly score against someone while it is contested.
--
-- Existing counts are NOT backfilled or unwound. They were applied under the
-- old immediate rule and there is no per-booking record of which booking
-- caused which increment, so there is nothing to reconcile them against.
--
-- Safe to re-run (IF NOT EXISTS / CREATE OR REPLACE / idempotent constraint
-- drop-then-add / cron unschedule-then-schedule).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Dispute + settlement bookkeeping on the booking itself ──────────────
-- On bookings rather than a side table: there is exactly one no-show per
-- booking, the accused party is already whoever the booking says it is, and
-- every read that needs the dispute state is already reading the booking.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS no_show_marked_at     timestamptz,
  ADD COLUMN IF NOT EXISTS no_show_disputed_at   timestamptz,
  ADD COLUMN IF NOT EXISTS no_show_dispute_reason text,
  ADD COLUMN IF NOT EXISTS no_show_counted_at    timestamptz;

COMMENT ON COLUMN public.bookings.no_show_marked_at IS
  'When a no-show was recorded, in either direction. Opens the dispute window and starts the clock settle_no_show_reliability() waits on. NULL for every booking that was never marked.';
COMMENT ON COLUMN public.bookings.no_show_disputed_at IS
  'When the ACCUSED party said the no-show was false. Records a disagreement; it does not reverse the status and nothing adjudicates it.';
COMMENT ON COLUMN public.bookings.no_show_dispute_reason IS
  'The accused party''s own words, shown to the other party and quoted in the support ticket.';
COMMENT ON COLUMN public.bookings.no_show_counted_at IS
  'When this no-show was folded into client_provider_reliability.no_show_count. Idempotency for the settle job — a booking is counted once or never.';

-- Partial index: the settle job only ever looks at unsettled, undisputed
-- no-shows, which is a vanishing fraction of the table.
CREATE INDEX IF NOT EXISTS idx_bookings_no_show_pending_settlement
  ON public.bookings (no_show_marked_at)
  WHERE no_show_marked_at IS NOT NULL
    AND no_show_counted_at IS NULL
    AND no_show_disputed_at IS NULL;

-- ── 2. Allow the new notification type ─────────────────────────────────────
-- Same DROP/ADD pattern every other type addition in this repo uses; the list
-- below is the live constraint plus 'no_show_disputed'.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'booking_pending'::text, 'booking_confirmed'::text, 'booking_declined'::text,
  'booking_cancelled'::text, 'booking_reminder'::text, 'booking_in_progress'::text,
  'booking_not_started'::text, 'no_show'::text, 'payment_success'::text,
  'new_provider'::text, 'reschedule_request'::text, 'reschedule_provider_response'::text,
  'reschedule_confirmed'::text, 'reschedule_declined'::text, 'reschedule_expired'::text,
  'review_request'::text, 'review_received'::text, 'promotion'::text,
  'intake_form_reminder'::text, 'intake_form_received'::text, 'intake_form_completed'::text,
  'info_pack_received'::text, 'provider_message'::text, 'announcement'::text,
  'balance_reminder'::text, 'waitlist_slot_available'::text, 'new_message'::text,
  'address_released'::text, 'birthday_greeting'::text, 'post_appt_check_in'::text,
  'rebooking_nudge'::text, 'daily_recap'::text, 'schedule_fully_booked'::text,
  'pending_booking_reminder'::text, 'provider_no_show'::text,
  -- added by this migration:
  'no_show_disputed'::text
]));

-- ── 3. Provider marks a client no-show ─────────────────────────────────────
-- Live definition, with two changes: stamp no_show_marked_at, and DROP the
-- inline reliability increment (settle_no_show_reliability() now owns it).
CREATE OR REPLACE FUNCTION public.provider_update_booking_status(p_booking_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_status  text;
  v_booking_date    date;
  v_booking_time    time;
  v_appt_start      timestamp;
  v_active_reschedule boolean;
  v_provider_id     uuid;
  v_client_user_id  uuid;
  v_grace_minutes   integer;
BEGIN
  SELECT b.status, b.booking_date, b.booking_time, b.provider_id, b.user_id
    INTO v_current_status, v_booking_date, v_booking_time, v_provider_id, v_client_user_id
    FROM public.bookings b
   WHERE b.id = p_booking_id
     AND b.provider_id IN (SELECT p.id FROM public.providers p WHERE p.user_id = auth.uid())
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found or not owned by caller';
  END IF;

  IF v_current_status IN ('cancelled', 'completed', 'no_show') THEN
    RAISE EXCEPTION 'Booking is already %, no further status changes allowed', v_current_status;
  END IF;

  IF p_status = 'cancelled' THEN
    RAISE EXCEPTION 'Use provider_cancel_own_booking() to cancel a booking';
  END IF;

  v_appt_start := (v_booking_date + v_booking_time)::timestamp;

  SELECT COALESCE((booking_policies->>'noShowGraceMinutes')::integer, 0)
    INTO v_grace_minutes
    FROM public.providers
   WHERE id = v_provider_id;
  v_grace_minutes := GREATEST(COALESCE(v_grace_minutes, 0), 0);

  IF p_status = 'no_show' THEN
    IF v_booking_date <> CURRENT_DATE THEN
      RAISE EXCEPTION 'no_show can only be marked on the day of the appointment';
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.booking_reschedule_requests r
       WHERE r.booking_id = p_booking_id
         AND r.status IN ('pending', 'provider_responded')
    ) INTO v_active_reschedule;
    IF v_active_reschedule THEN
      RAISE EXCEPTION 'Cannot mark no_show while a reschedule request is active for this booking';
    END IF;
  END IF;

  IF v_current_status = 'pending' THEN
    IF p_status <> 'confirmed' THEN
      RAISE EXCEPTION 'Invalid status transition: % -> %', v_current_status, p_status;
    END IF;

  ELSIF v_current_status = 'confirmed' THEN
    IF p_status = 'in_progress' THEN
      NULL;
    ELSIF p_status = 'no_show' THEN
      IF NOW() < v_appt_start + (v_grace_minutes * INTERVAL '1 minute') THEN
        RAISE EXCEPTION 'Cannot mark no_show until % minute(s) after the appointment start time', v_grace_minutes;
      END IF;
    ELSIF p_status = 'completed' THEN
      IF v_appt_start >= NOW() THEN
        RAISE EXCEPTION 'Cannot mark % before the appointment start time', p_status;
      END IF;
    ELSE
      RAISE EXCEPTION 'Invalid status transition: % -> %', v_current_status, p_status;
    END IF;

  ELSIF v_current_status = 'in_progress' THEN
    IF p_status = 'completed' THEN
      NULL;
    ELSIF p_status = 'no_show' THEN
      IF NOW() < v_appt_start + (v_grace_minutes * INTERVAL '1 minute') THEN
        RAISE EXCEPTION 'Cannot mark no_show until % minute(s) after the appointment start time', v_grace_minutes;
      END IF;
    ELSE
      RAISE EXCEPTION 'Invalid status transition: % -> %', v_current_status, p_status;
    END IF;

  ELSE
    RAISE EXCEPTION 'Unrecognized current status: %', v_current_status;
  END IF;

  -- The client_provider_reliability increment that used to live here is gone
  -- on purpose. It ran before the client had been told, on an accusation they
  -- had no way to answer. settle_no_show_reliability() applies it only once
  -- the dispute window has closed undisputed.
  IF p_status = 'no_show' THEN
    UPDATE public.bookings
       SET status = p_status,
           no_show_marked_at = NOW()
     WHERE id = p_booking_id;
  ELSE
    UPDATE public.bookings SET status = p_status WHERE id = p_booking_id;
  END IF;
END;
$function$;

-- ── 4. Client marks a provider no-show ─────────────────────────────────────
-- Live definition, with one change: stamp no_show_marked_at. There is no
-- reliability counter in this direction (no provider-side equivalent table),
-- so the stamp exists here purely to open the dispute window.
CREATE OR REPLACE FUNCTION public.client_mark_provider_no_show(p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_status    text;
  v_booking_date      date;
  v_booking_time      time;
  v_appt_start        timestamp;
  v_active_reschedule boolean;
BEGIN
  SELECT b.status, b.booking_date, b.booking_time
    INTO v_current_status, v_booking_date, v_booking_time
    FROM public.bookings b
   WHERE b.id = p_booking_id
     AND b.user_id = auth.uid()
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_current_status IN ('cancelled', 'completed', 'no_show', 'provider_no_show') THEN
    RAISE EXCEPTION 'Booking is already %, no further status changes allowed', v_current_status;
  END IF;

  IF v_current_status NOT IN ('confirmed', 'in_progress') THEN
    RAISE EXCEPTION 'Cannot mark provider no-show from status %', v_current_status;
  END IF;

  v_appt_start := (v_booking_date + v_booking_time)::timestamp;

  IF v_booking_date <> CURRENT_DATE THEN
    RAISE EXCEPTION 'Provider no-show can only be marked on the day of the appointment';
  END IF;

  IF NOW() < v_appt_start THEN
    RAISE EXCEPTION 'Cannot mark provider no-show before the appointment start time';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.booking_reschedule_requests r
     WHERE r.booking_id = p_booking_id
       AND r.status IN ('pending', 'provider_responded')
  ) INTO v_active_reschedule;
  IF v_active_reschedule THEN
    RAISE EXCEPTION 'Cannot mark provider no-show while a reschedule request is active for this booking';
  END IF;

  UPDATE public.bookings
     SET status = 'provider_no_show',
         no_show_marked_at = NOW()
   WHERE id = p_booking_id;
END;
$function$;

-- ── 5. The dispute itself ──────────────────────────────────────────────────
-- Callable only by the ACCUSED party, in whichever direction the accusation
-- runs. Ownership is derived from auth.uid() against the booking, never taken
-- from a parameter — same shape as cancel_own_booking() and
-- client_mark_provider_no_show().
--
-- The notification is inserted here rather than by handle_booking_status_change
-- because a dispute is not a status change and that trigger never fires for it.
-- This is still a single server-side writer, which is what the "DB owns
-- notifications, app code never inserts them" rule is actually protecting.
CREATE OR REPLACE FUNCTION public.dispute_no_show(p_booking_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_window          CONSTANT interval := interval '7 days';
  v_max_reason      CONSTANT integer  := 1000;
  v_status          text;
  v_marked_at       timestamptz;
  v_disputed_at     timestamptz;
  v_user_id         uuid;
  v_provider_id     uuid;
  v_provider_user   uuid;
  v_customer_name   text;
  v_provider_name   text;
  v_service_name    text;
  v_booking_date    date;
  v_reason          text;
  v_is_client       boolean;
BEGIN
  v_reason := NULLIF(BTRIM(COALESCE(p_reason, '')), '');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Please say what actually happened.';
  END IF;
  v_reason := LEFT(v_reason, v_max_reason);

  SELECT b.status, b.no_show_marked_at, b.no_show_disputed_at, b.user_id, b.provider_id,
         b.customer_name, b.provider_name_snapshot, b.service_name_snapshot, b.booking_date
    INTO v_status, v_marked_at, v_disputed_at, v_user_id, v_provider_id,
         v_customer_name, v_provider_name, v_service_name, v_booking_date
    FROM public.bookings b
   WHERE b.id = p_booking_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  SELECT p.user_id INTO v_provider_user FROM public.providers p WHERE p.id = v_provider_id;

  -- Only the accused may dispute, and only the accusation made against them:
  -- 'no_show' accuses the client, 'provider_no_show' accuses the provider.
  IF v_status = 'no_show' THEN
    IF v_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Only the client this no-show was recorded against can dispute it';
    END IF;
    v_is_client := TRUE;
  ELSIF v_status = 'provider_no_show' THEN
    IF v_provider_user IS NULL OR v_provider_user IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Only the provider this no-show was recorded against can dispute it';
    END IF;
    v_is_client := FALSE;
  ELSE
    RAISE EXCEPTION 'This booking is not marked as a no-show';
  END IF;

  IF v_disputed_at IS NOT NULL THEN
    RAISE EXCEPTION 'You have already disputed this no-show';
  END IF;

  -- A booking marked before this migration has no stamp; treat the window as
  -- open rather than refusing a dispute on a technicality of when it landed.
  IF v_marked_at IS NOT NULL AND NOW() > v_marked_at + v_window THEN
    RAISE EXCEPTION 'The window to dispute this no-show has closed. Contact support if you still need help.';
  END IF;

  UPDATE public.bookings
     SET no_show_disputed_at    = NOW(),
         no_show_dispute_reason = v_reason
   WHERE id = p_booking_id;

  -- Tell the other party. is_actionable FALSE: there is no action for them to
  -- take in the app, and offering one would imply a resolution flow that does
  -- not exist.
  IF v_is_client THEN
    IF v_provider_user IS NOT NULL THEN
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
      VALUES (
        v_provider_user, 'no_show_disputed', 'No-Show Disputed',
        COALESCE(v_customer_name, 'A client') || ' disputes the no-show on ' ||
          COALESCE(v_service_name, 'their booking') || ' on ' ||
          TO_CHAR(v_booking_date, 'DD Mon YYYY') || '. Cerviced support has a copy.',
        'high', FALSE, p_booking_id, v_provider_id, 'provider'
      );
    END IF;
  ELSE
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
    VALUES (
      v_user_id, 'no_show_disputed', 'No-Show Disputed',
      COALESCE(v_provider_name, 'Your provider') || ' disputes the missed appointment you reported for ' ||
        COALESCE(v_service_name, 'your booking') || ' on ' ||
        TO_CHAR(v_booking_date, 'DD Mon YYYY') || '. Cerviced support has a copy.',
      'high', FALSE, p_booking_id, v_provider_id, 'client'
    );
  END IF;
END;
$function$;

-- ── 6. Settling the reliability counter ────────────────────────────────────
-- Applies the increment the marking RPC no longer does, but only to no-shows
-- that went the full window without being disputed. no_show_counted_at makes
-- it idempotent: a booking is counted once or never, no matter how often this
-- runs. A disputed booking is skipped forever — it stays uncounted unless a
-- human clears no_show_disputed_at, which is deliberately a manual act.
CREATE OR REPLACE FUNCTION public.settle_no_show_reliability()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_window CONSTANT interval := interval '7 days';
  v_count  integer := 0;
  r        record;
BEGIN
  FOR r IN
    SELECT b.id, b.provider_id, b.user_id
      FROM public.bookings b
     WHERE b.status = 'no_show'
       AND b.no_show_marked_at IS NOT NULL
       AND b.no_show_marked_at < NOW() - v_window
       AND b.no_show_disputed_at IS NULL
       AND b.no_show_counted_at IS NULL
     FOR UPDATE SKIP LOCKED
  LOOP
    INSERT INTO public.client_provider_reliability (provider_id, client_user_id, no_show_count, updated_at)
    VALUES (r.provider_id, r.user_id, 1, NOW())
    ON CONFLICT (provider_id, client_user_id)
    DO UPDATE SET no_show_count = client_provider_reliability.no_show_count + 1,
                  updated_at = NOW();

    UPDATE public.bookings SET no_show_counted_at = NOW() WHERE id = r.id;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

-- ── 7. Expose the dispute state to the client ──────────────────────────────
-- Live view definition with the four columns appended. Nothing else changes;
-- the address masking below is the existing policy gate, reproduced verbatim.
CREATE OR REPLACE VIEW public.client_bookings AS
 SELECT b.id,
    b.user_id,
    b.provider_id,
    b.service_id,
    b.status,
    b.booking_date,
    b.booking_time,
    b.end_time,
    b.notes,
    b.booking_instructions,
    b.payment_type,
    b.base_price,
    b.add_ons_total,
    b.service_charge,
    b.deposit_amount,
    b.amount_paid,
    b.remaining_balance,
    b.payment_status,
    b.payment_method,
    b.payment_intent_id,
    b.is_group_booking,
    b.group_booking_id,
    b.group_booking_count,
    b.provider_name_snapshot,
    b.service_name_snapshot,
    b.service_category_snapshot,
    b.provider_logo_snapshot,
        CASE
            WHEN is_address_released(b.status, p.address_release_policy, b.address_released_at, b.booking_date, b.booking_time) THEN b.provider_address_snapshot
            ELSE NULL::text
        END AS provider_address_snapshot,
    b.provider_phone_snapshot,
        CASE
            WHEN is_address_released(b.status, p.address_release_policy, b.address_released_at, b.booking_date, b.booking_time) THEN b.provider_coordinates
            ELSE NULL::jsonb
        END AS provider_coordinates,
    b.customer_name,
    b.customer_email,
    b.customer_phone,
    b.confirmed_at,
    b.address_released_at,
    b.client_address,
    b.occasion_type,
    b.style_request,
    b.reference_image_url,
    b.created_at,
    b.updated_at,
    ( SELECT COALESCE(jsonb_agg(to_jsonb(a.*) ORDER BY a.id), '[]'::jsonb) AS "coalesce"
           FROM booking_add_ons a
          WHERE a.booking_id = b.id) AS add_ons,
    jsonb_build_object('logo_url', p.logo_url) AS provider,
    p.business_type AS provider_business_type,
    b.no_show_marked_at,
    b.no_show_disputed_at,
    b.no_show_dispute_reason,
    b.no_show_counted_at
   FROM bookings b
     LEFT JOIN providers p ON p.id = b.provider_id
  WHERE b.status <> 'on_hold'::text;

-- ── 8. Grants ──────────────────────────────────────────────────────────────
-- anon gets nothing: both of these act on a specific person's booking and both
-- are SECURITY DEFINER (see the anon EXECUTE hardening pass, 2026-08-20).
REVOKE ALL ON FUNCTION public.dispute_no_show(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dispute_no_show(uuid, text) TO authenticated;

-- The settle job is cron-only. No user of any kind should be able to force
-- someone's reliability counter forward by hand.
REVOKE ALL ON FUNCTION public.settle_no_show_reliability() FROM PUBLIC, anon, authenticated;

-- ── 9. Daily settlement cron ───────────────────────────────────────────────
SELECT cron.unschedule('settle-no-show-reliability')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'settle-no-show-reliability');

SELECT cron.schedule(
  'settle-no-show-reliability',
  '20 3 * * *',
  $cron$SELECT public.settle_no_show_reliability();$cron$
);
