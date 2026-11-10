-- A declined request says "Declined", not "Cancelled" — and an accepted
-- request records when it was accepted (confirmed_at, step 2b).
--
-- A provider declining a request and the request timing out unanswered both
-- end as status = 'cancelled', the same as a booking cancelled after it was
-- confirmed. The client's Bookings list then said "Cancelled" for a request
-- the provider never accepted. Nothing exposed to the client could tell the
-- two apart: confirmed_at isn't stamped when a provider accepts by hand
-- (provider_update_booking_status), and a booking cancelled because its
-- payment failed is also cancelled by 'system' with no confirmed_at.
--
-- bookings.declined_at is stamped by the existing cancellation trigger at the
-- one moment the difference is known: a PENDING booking (a request, including
-- an emergency out-of-hours request) cancelled by anyone other than the
-- client. That is exactly when handle_booking_status_change sends the client
-- its 'booking_declined' notice, so the label and the notice always agree.
--
-- Redefined from live with md5 guards; the view keeps every column in order
-- and appends declined_at at the end.

BEGIN;

-- 1. The column ─────────────────────────────────────────────────────────────
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS declined_at timestamptz;

COMMENT ON COLUMN public.bookings.declined_at IS
  'When a request (status was pending) was cancelled by the provider or by the '
  'unanswered-request expiry. NULL for every other cancellation. Stamped by '
  'stamp_booking_cancellation().';

-- 2. Stamp it with the cancellation ────────────────────────────────────────
DO $$
BEGIN
  IF md5(pg_get_functiondef('public.stamp_booking_cancellation'::regproc))
     <> '09c925da25d353b27cae0337388205ac' THEN
    RAISE EXCEPTION 'stamp_booking_cancellation changed since this migration was written';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.stamp_booking_cancellation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    NEW.cancelled_at := now();
    NEW.cancelled_by := CASE
      WHEN auth.uid() IS NULL THEN 'system'
      WHEN auth.uid() = NEW.user_id THEN 'client'
      ELSE 'provider'
    END;
    -- A request the provider declined, or that expired unanswered. A client
    -- withdrawing their own request is a cancellation, not a decline.
    IF OLD.status = 'pending' AND NEW.cancelled_by <> 'client' THEN
      NEW.declined_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 2b. Record when a request was accepted ──────────────────────────────────
-- confirmed_at was only written by the paths that create a booking already
-- confirmed (checkout, manual booking, waitlist claim). A provider accepting
-- a request goes through provider_update_booking_status, which set status
-- alone, so an accepted request had no confirmed_at at all. Stamped here for
-- every path at once, and never overwritten once set. Nothing branches on the
-- value today; it is a record, read by the client view.
CREATE OR REPLACE FUNCTION public.stamp_booking_confirmation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM 'confirmed'
     AND NEW.confirmed_at IS NULL THEN
    NEW.confirmed_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.stamp_booking_confirmation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_stamp_booking_confirmation ON public.bookings;
CREATE TRIGGER trg_stamp_booking_confirmation
  BEFORE UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.stamp_booking_confirmation();

-- Past accepts, from the 'booking_confirmed' notice the client was sent at the
-- time (same group matching as below). Rows with no notice stay NULL rather
-- than getting a guessed time.
UPDATE public.bookings b
   SET confirmed_at = c.confirmed_at
  FROM (
    SELECT DISTINCT ON (target.id) target.id, n.created_at AS confirmed_at
      FROM public.notifications n
      JOIN public.bookings rep ON rep.id = n.booking_id
      JOIN public.bookings target
        ON target.id = rep.id
        OR (rep.group_booking_id IS NOT NULL AND target.group_booking_id = rep.group_booking_id)
     WHERE n.type = 'booking_confirmed'
     ORDER BY target.id, n.created_at ASC
  ) c
 WHERE b.id = c.id
   AND b.confirmed_at IS NULL;

-- 3. Past declines, from the notice the client was already sent ────────────
-- handle_booking_status_change sends 'booking_declined' on exactly this
-- transition. For a group it goes to one representative booking, so the rest
-- of that group is matched through group_booking_id.
UPDATE public.bookings b
   SET declined_at = d.declined_at
  FROM (
    SELECT DISTINCT ON (target.id) target.id, n.created_at AS declined_at
      FROM public.notifications n
      JOIN public.bookings rep ON rep.id = n.booking_id
      JOIN public.bookings target
        ON target.id = rep.id
        OR (rep.group_booking_id IS NOT NULL AND target.group_booking_id = rep.group_booking_id)
     WHERE n.type = 'booking_declined'
       AND target.status = 'cancelled'
     ORDER BY target.id, n.created_at DESC
  ) d
 WHERE b.id = d.id
   AND b.declined_at IS NULL;

-- 4. Show it to the client ─────────────────────────────────────────────────
-- Live definition (pg_get_viewdef), every column kept in order, declined_at
-- appended at the end.
DO $$
BEGIN
  IF md5(pg_get_viewdef('public.client_bookings'::regclass)) <> 'fd79d868dd052967caa76a33d4952cce' THEN
    RAISE EXCEPTION 'client_bookings changed since this migration was written';
  END IF;
END $$;

CREATE OR REPLACE VIEW public.client_bookings WITH (security_invoker = true) AS
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
    venue.address AS provider_address_snapshot,
    b.provider_phone_snapshot,
    venue.coordinates AS provider_coordinates,
    b.customer_name,
    b.customer_email,
    b.customer_phone,
    b.confirmed_at,
    b.address_released_at,
    ca.address AS client_address,
    b.occasion_type,
    b.style_request,
    b.reference_image_url,
    b.created_at,
    b.updated_at,
    ( SELECT COALESCE(jsonb_agg(to_jsonb(a.*) ORDER BY a.id), '[]'::jsonb) AS "coalesce"
           FROM booking_add_ons a
          WHERE (a.booking_id = b.id)) AS add_ons,
    jsonb_build_object('logo_url', p.logo_url) AS provider,
    p.business_type AS provider_business_type,
    b.no_show_marked_at,
    b.no_show_disputed_at,
    b.no_show_dispute_reason,
    b.no_show_counted_at,
    b.booking_ref,
    b.refunded_amount,
    b.cancelled_by,
    b.policy_retained_amount,
    venue.directions AS provider_directions_snapshot,
    b.late_reschedule_from,
    (b.created_at >= late_reschedule_rule_starts_at()) AS late_reschedule_rule_applies,
    b.declined_at
   FROM (((bookings b
     LEFT JOIN providers p ON ((p.id = b.provider_id)))
     LEFT JOIN booking_client_addresses ca ON ((ca.booking_id = b.id)))
     LEFT JOIN LATERAL client_booking_venue(b.id) venue(address, directions, coordinates) ON (true))
  WHERE (b.status <> 'on_hold'::text);

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261110200000', 'booking_request_declined_at')
ON CONFLICT (version) DO NOTHING;

COMMIT;
