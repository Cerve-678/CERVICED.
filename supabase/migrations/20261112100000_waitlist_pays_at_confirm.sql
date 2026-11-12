-- A waitlist slot is paid for, like any other booking.
--
-- Until now, confirming a held waitlist slot (claim_waitlist_hold) turned it
-- into a booking with £0 paid: no deposit, no CERVICED fee, no saved card for
-- a late or no-show fee, and no record of the client agreeing to the
-- provider's policies. "Auto-fill" was worse: it made that unpaid booking
-- without asking the client at all. Decided with the user on 2026-11-10:
--
--   * Confirming a held slot goes through the normal checkout. The held row
--     is handed to prepare_checkout() (item.waitlist_hold_id), priced from the
--     database like any cart item, and becomes pending/confirmed only when
--     finalize_checkout() captures the payment. The client's 15 minutes keep
--     running while they pay. claim_waitlist_hold() is dropped.
--   * Both Auto-fill settings give the client a 15-minute hold. ON: when it
--     lapses, the slot rolls to the next person. OFF: the slot opens to
--     everyone and comes back to the provider, who can offer it to someone on
--     their waitlist (waitlist_released_slots).
--   * Missing the 15 minutes, or passing, takes the client off that waitlist.
--     The lapsed hold row is deleted, like an abandoned cart hold, so it never
--     shows as a cancelled booking. What was offered stays on the waitlist
--     entry (offered_*) for "this slot has gone".
--   * A provider's offer from the waitlist is a 15-minute hold too.
--   * The 30-day provider_waitlist.expires_at is dropped: nothing ever read it.
--
-- Also fixed: invite_next_waitlist_entry(), expire_waitlist_holds() and
-- decline_waitlist_hold() called format_notification_time(date, text), which
-- doesn't exist (only (time) does), and one-argument to_char(time). In the
-- invite, that sat inside EXCEPTION WHEN OTHERS THEN CONTINUE, so every offer
-- since 20261101190000 rolled back silently and nobody was ever offered a slot.
-- The candidate loop now logs what failed instead of swallowing it.
--
-- And: the waitlist's one RLS policy was FOR ALL, so a client could UPDATE
-- their own row and set position = 1 to jump the queue, or their status.
-- Clients now insert (as 'waiting'), read and delete their own rows; every
-- other change goes through a function here.
--
-- Changed functions are rebuilt from live (pg_get_functiondef, 2026-11-10);
-- the md5 guards refuse to run if any changed since.

BEGIN;

DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.prepare_checkout(jsonb)'::regprocedure)) <> 'b781dde02286e477413e34e2313c562d' THEN
    RAISE EXCEPTION 'prepare_checkout changed live since this migration was written; redo it from live';
  END IF;
  IF md5(pg_get_functiondef('public.cancel_checkout(uuid)'::regprocedure)) <> '6d280d53b5c69b435d1913cf36266ad5' THEN
    RAISE EXCEPTION 'cancel_checkout changed live since this migration was written; redo it from live';
  END IF;
  IF md5(pg_get_functiondef('public.expire_cart_holds()'::regprocedure)) <> '379a498c1916ce6b8d882b54fe4e1160' THEN
    RAISE EXCEPTION 'expire_cart_holds changed live since this migration was written; redo it from live';
  END IF;
  IF md5(pg_get_functiondef('public.expire_waitlist_holds()'::regprocedure)) <> '184ca3efb6a345dfb7bbc785c6840c7a' THEN
    RAISE EXCEPTION 'expire_waitlist_holds changed live since this migration was written; redo it from live';
  END IF;
  IF md5(pg_get_functiondef('public.decline_waitlist_hold(uuid)'::regprocedure)) <> 'abdcee81844a986ea7f25d7e2e6d6d39' THEN
    RAISE EXCEPTION 'decline_waitlist_hold changed live since this migration was written; redo it from live';
  END IF;
  IF md5(pg_get_functiondef('public.claim_waitlist_hold(uuid)'::regprocedure)) <> 'cf0f106e57f475c46acee43d7de61109' THEN
    RAISE EXCEPTION 'claim_waitlist_hold changed live since this migration was written; redo it from live';
  END IF;
  IF md5(pg_get_functiondef('public.invite_next_waitlist_entry(uuid, uuid, date, time without time zone, time without time zone, numeric, numeric, numeric, text)'::regprocedure)) <> '94f7aa25fdc7ae534ec2acdc44b8c966' THEN
    RAISE EXCEPTION 'invite_next_waitlist_entry changed live since this migration was written; redo it from live';
  END IF;
END
$guard$;

-- ── 1. The waitlist entry remembers its last offer ─────────────────────────
ALTER TABLE public.provider_waitlist
  ADD COLUMN IF NOT EXISTS offered_booking_id uuid,
  ADD COLUMN IF NOT EXISTS offered_date date,
  ADD COLUMN IF NOT EXISTS offered_time time,
  ADD COLUMN IF NOT EXISTS offer_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS offer_ended_at timestamptz;

COMMENT ON COLUMN public.provider_waitlist.offered_booking_id IS
  'The on_hold booking last offered to this client. Not a foreign key: a lapsed hold is deleted, and this id is how "this slot has gone" is recognised.';

ALTER TABLE public.provider_waitlist DROP COLUMN IF EXISTS expires_at;

-- ── 2. Who can change a waitlist row ───────────────────────────────────────
DROP POLICY IF EXISTS "Waitlist participants can see and manage their entries" ON public.provider_waitlist;

CREATE POLICY provider_waitlist_read ON public.provider_waitlist
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.providers p WHERE p.id = provider_id AND p.user_id = auth.uid())
  );

-- position is assigned by trg_waitlist_position whatever the insert says.
CREATE POLICY provider_waitlist_client_join ON public.provider_waitlist
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'waiting'
    AND notified_at IS NULL
    AND offered_booking_id IS NULL
    AND offered_date IS NULL
    AND offered_time IS NULL
    AND offer_expires_at IS NULL
    AND offer_ended_at IS NULL
  );

-- Not while a slot is held for them: the hold would be left with no entry.
-- They pass on it first (decline_waitlist_hold).
CREATE POLICY provider_waitlist_client_leave ON public.provider_waitlist
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND status <> 'notified');

-- The names on a waitlist row reach other people (the provider's list and
-- notifications, the client's notices), so the server writes them, not the
-- client. A row can only be for a live provider, and for one of their own
-- active services. An "any service" row (service_id NULL, how Becca joins)
-- keeps the client's own description of what they want.
CREATE OR REPLACE FUNCTION public.set_waitlist_entry_snapshots()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_provider_name text;
  v_service_name text;
BEGIN
  SELECT p.display_name INTO v_provider_name
    FROM public.providers p
   WHERE p.id = NEW.provider_id AND p.has_gone_live = true AND p.is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This provider isn''t taking bookings right now';
  END IF;
  NEW.provider_name_snapshot := COALESCE(v_provider_name, NEW.provider_name_snapshot);

  IF NEW.service_id IS NOT NULL THEN
    SELECT s.name INTO v_service_name
      FROM public.services s
     WHERE s.id = NEW.service_id AND s.provider_id = NEW.provider_id AND s.is_active = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That service is no longer available';
    END IF;
    NEW.service_name_snapshot := v_service_name;
  END IF;

  SELECT NULLIF(btrim(u.name), '') INTO NEW.user_name_snapshot
    FROM public.users u WHERE u.id = NEW.user_id;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_waitlist_entry_snapshots() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_waitlist_entry_snapshots ON public.provider_waitlist;
CREATE TRIGGER trg_waitlist_entry_snapshots
  BEFORE INSERT ON public.provider_waitlist
  FOR EACH ROW EXECUTE FUNCTION public.set_waitlist_entry_snapshots();

-- ── 3. Slots that came back to a provider with Auto-fill off ───────────────
CREATE TABLE IF NOT EXISTS public.waitlist_released_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.services(id) ON DELETE CASCADE,
  service_name_snapshot text NOT NULL,
  booking_date date NOT NULL,
  booking_time time NOT NULL,
  end_time time,
  released_by_name text,
  reason text NOT NULL CHECK (reason IN ('missed', 'passed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS waitlist_released_slots_open_idx
  ON public.waitlist_released_slots (provider_id, booking_date)
  WHERE resolved_at IS NULL;

ALTER TABLE public.waitlist_released_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY waitlist_released_slots_provider_read ON public.waitlist_released_slots
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.providers p WHERE p.id = provider_id AND p.user_id = auth.uid()));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.waitlist_released_slots FROM PUBLIC, anon, authenticated;

-- ── 4. Offer one slot to one waitlist entry: a 15-minute hold ──────────────
-- Raises on failure (taken, outside hours or notice...), so a provider offering
-- by hand sees why. The automatic loop catches and logs it per candidate.
CREATE OR REPLACE FUNCTION public.offer_waitlist_slot(
  p_entry_id uuid,
  p_service_id uuid,
  p_booking_date date,
  p_booking_time time,
  p_end_time time DEFAULT NULL
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  w public.provider_waitlist%ROWTYPE;
  v_service public.services%ROWTYPE;
  v_provider public.providers%ROWTYPE;
  v_hold interval := public.waitlist_hold_duration();
  v_end time;
  v_booking_id uuid;
BEGIN
  SELECT * INTO w FROM public.provider_waitlist WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND OR w.status <> 'waiting' THEN
    RAISE EXCEPTION 'This client is no longer waiting for a slot';
  END IF;
  SELECT * INTO v_provider FROM public.providers WHERE id = w.provider_id;
  SELECT * INTO v_service FROM public.services
   WHERE id = p_service_id AND provider_id = w.provider_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That service is no longer available';
  END IF;
  v_end := COALESCE(p_end_time, p_booking_time + make_interval(mins => v_service.duration_minutes));

  -- Placeholder money: prepare_checkout() prices the row from the database
  -- when the client pays, and nothing is final until finalize_checkout().
  INSERT INTO public.bookings (
    user_id, provider_id, service_id, status,
    booking_date, booking_time, end_time,
    payment_type, base_price, add_ons_total, service_charge,
    deposit_amount, amount_paid, remaining_balance, payment_status,
    is_group_booking, group_booking_count,
    provider_name_snapshot, service_name_snapshot, service_category_snapshot,
    provider_logo_snapshot, customer_name, waitlist_entry_id, hold_expires_at
  ) VALUES (
    w.user_id, w.provider_id, v_service.id, 'on_hold',
    p_booking_date, p_booking_time, v_end,
    'full', v_service.price, 0, 0,
    0, 0, v_service.price, 'pending',
    FALSE, 1,
    COALESCE(v_provider.display_name, w.provider_name_snapshot), v_service.name, v_provider.service_category,
    v_provider.logo_url, w.user_name_snapshot, w.id, now() + v_hold
  )
  RETURNING id INTO v_booking_id;

  UPDATE public.provider_waitlist
     SET status = 'notified',
         notified_at = now(),
         offered_booking_id = v_booking_id,
         offered_date = p_booking_date,
         offered_time = p_booking_time,
         offer_expires_at = now() + v_hold,
         offer_ended_at = NULL
   WHERE id = w.id;

  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, provider_id, recipient_role, booking_id)
  VALUES (
    w.user_id, 'waitlist_slot_available', 'A slot opened up!',
    v_service.name || ' with ' || COALESCE(v_provider.display_name, w.provider_name_snapshot) ||
      ' on ' || TO_CHAR(p_booking_date, 'FMDD Mon') || ' at ' || public.format_notification_time(p_booking_time) ||
      ' is held for you for ' || (EXTRACT(EPOCH FROM v_hold) / 60)::int ||
      ' minutes. Confirm and pay in Bookings before it''s offered to someone else.',
    'high', TRUE, w.provider_id, 'client', v_booking_id
  );

  RETURN v_booking_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.offer_waitlist_slot(uuid, uuid, date, time, time) FROM PUBLIC, anon, authenticated;

-- ── 5. The next person in line (same signature; the status trigger calls it) ─
CREATE OR REPLACE FUNCTION public.invite_next_waitlist_entry(p_provider_id uuid, p_service_id uuid, p_booking_date date DEFAULT NULL::date, p_booking_time time without time zone DEFAULT NULL::time without time zone, p_end_time time without time zone DEFAULT NULL::time without time zone, p_base_price numeric DEFAULT NULL::numeric, p_add_ons_total numeric DEFAULT NULL::numeric, p_service_charge numeric DEFAULT NULL::numeric, p_service_category_snapshot text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  w RECORD;
  v_waitlist_enabled BOOLEAN;
BEGIN
  -- p_base_price, p_add_ons_total, p_service_charge and
  -- p_service_category_snapshot are unused since 20261112100000: the hold is
  -- priced at checkout. Kept so callers don't change.
  SELECT COALESCE((automation_settings->>'waitlistEnabled')::boolean, TRUE)
    INTO v_waitlist_enabled
    FROM public.providers WHERE id = p_provider_id;

  IF NOT COALESCE(v_waitlist_enabled, TRUE) THEN
    RETURN FALSE;
  END IF;
  IF p_booking_date IS NULL OR p_booking_time IS NULL OR p_service_id IS NULL THEN
    RETURN FALSE;
  END IF;
  -- Checked here as well as in the booking gate: the gate lets the provider's
  -- own inserts through, and this can run as the provider when they cancel.
  IF public.provider_schedule_is_closed(p_provider_id) THEN
    RETURN FALSE;
  END IF;

  -- Queue order. "Anytime" and a date range are equal; the dates only decide
  -- whether someone matches (decided 2026-11-10).
  FOR w IN
    SELECT id
      FROM public.provider_waitlist
     WHERE provider_id = p_provider_id
       AND status = 'waiting'
       AND (service_id = p_service_id OR service_id IS NULL)
       AND (
         preferred_dates IS NULL
         OR (p_booking_date >= preferred_dates[1]
             AND p_booking_date <= COALESCE(preferred_dates[2], 'infinity'::date))
       )
     ORDER BY (service_id IS NOT NULL AND service_id = p_service_id) DESC,
              position ASC,
              created_at ASC
  LOOP
    BEGIN
      PERFORM public.offer_waitlist_slot(w.id, p_service_id, p_booking_date, p_booking_time, p_end_time);
      RETURN TRUE;
    EXCEPTION WHEN OTHERS THEN
      -- This candidate can't take it (a rule, or a clash); try the next. Logged
      -- so a failure that hits everyone is visible, not just "nobody matched".
      RAISE WARNING 'invite_next_waitlist_entry: entry % skipped: % (%)', w.id, SQLERRM, SQLSTATE;
    END;
  END LOOP;
  RETURN FALSE;
END;
$function$;

-- ── 6. A hold ends without being paid for ──────────────────────────────────
-- p_missed: the 15 minutes ran out, rather than the client passing (what the
-- provider is told). p_tell_client: send "Your held slot has gone" — not when
-- the client ended it themselves.
CREATE OR REPLACE FUNCTION public.end_waitlist_hold(p_booking_id uuid, p_missed boolean, p_tell_client boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  h public.bookings%ROWTYPE;
  v_rolling BOOLEAN;
  v_enabled BOOLEAN;
  v_provider_user_id UUID;
  v_offered BOOLEAN;
  v_when TEXT;
  v_who TEXT;
BEGIN
  SELECT * INTO h FROM public.bookings
   WHERE id = p_booking_id AND status = 'on_hold' AND waitlist_entry_id IS NOT NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;  -- already paid for, or already ended
  END IF;

  -- An unfinished checkout on this hold ends with it. One with a payment
  -- started is left to reconcile-checkouts: its batch can't outlast the hold,
  -- so finalize_checkout() refuses it and the payment is cancelled or refunded.
  IF h.hold_batch_id IS NOT NULL THEN
    UPDATE public.checkout_batches
       SET status = 'cancelled'
     WHERE id = h.hold_batch_id AND status = 'prepared' AND payment_intent_id IS NULL;
  END IF;

  UPDATE public.provider_waitlist
     SET status = 'expired', offer_ended_at = now()
   WHERE id = h.waitlist_entry_id;

  -- Like an abandoned cart hold: never a booking, so never a cancelled one.
  -- Its notifications stay (booking_id is ON DELETE SET NULL).
  DELETE FROM public.bookings WHERE id = h.id;

  v_when := TO_CHAR(h.booking_date, 'FMDD Mon') || ' at ' || public.format_notification_time(h.booking_time);
  v_who := COALESCE(NULLIF(btrim(h.customer_name), ''), 'Your waitlist client');

  IF p_tell_client THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, provider_id, recipient_role)
    VALUES (
      h.user_id, 'waitlist_slot_available', 'Your held slot has gone',
      h.service_name_snapshot || ' with ' || h.provider_name_snapshot || ' on ' || v_when ||
        ' was held for you until ' || public.format_notification_time((h.hold_expires_at AT TIME ZONE 'Europe/London')::time) ||
        '. You''ve come off this waitlist, but you can rejoin from Bookings.' ||
        -- A payment caught by the clock is cancelled or refunded by
        -- reconcile-checkouts, which sends its own payment_not_completed notice.
        CASE WHEN h.hold_batch_id IS NOT NULL AND EXISTS (
               SELECT 1 FROM public.checkout_batches cb
                WHERE cb.id = h.hold_batch_id AND cb.payment_intent_id IS NOT NULL)
             THEN ' If you''d started paying, that payment is cancelled or refunded in full.'
             ELSE '' END,
      'medium', TRUE, h.provider_id, 'client'
    );
  END IF;

  IF public.provider_schedule_is_closed(h.provider_id) THEN
    RETURN;  -- the slot isn't open to anyone
  END IF;

  SELECT COALESCE((automation_settings->>'waitlistEnabled')::boolean, TRUE),
         COALESCE((automation_settings->>'autoAcceptWaitlist')::boolean, FALSE),
         user_id
    INTO v_enabled, v_rolling, v_provider_user_id
    FROM public.providers WHERE id = h.provider_id;
  IF NOT COALESCE(v_enabled, TRUE) THEN
    RETURN;
  END IF;

  IF v_rolling THEN
    v_offered := public.invite_next_waitlist_entry(
      h.provider_id, h.service_id, h.booking_date, h.booking_time, h.end_time);
    IF v_offered THEN
      RETURN;
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM public.provider_waitlist o
     WHERE o.provider_id = h.provider_id
       AND o.status = 'waiting'
       AND (o.service_id = h.service_id OR o.service_id IS NULL)
       AND (o.preferred_dates IS NULL
            OR (h.booking_date >= o.preferred_dates[1]
                AND h.booking_date <= COALESCE(o.preferred_dates[2], 'infinity'::date)))
  ) THEN
    -- Auto-fill off: open to everyone now, and back to the provider to offer.
    INSERT INTO public.waitlist_released_slots
      (provider_id, service_id, service_name_snapshot, booking_date, booking_time, end_time, released_by_name, reason)
    VALUES
      (h.provider_id, h.service_id, h.service_name_snapshot, h.booking_date, h.booking_time, h.end_time,
       h.customer_name, CASE WHEN p_missed THEN 'missed' ELSE 'passed' END);
    IF v_provider_user_id IS NOT NULL THEN
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, provider_id, recipient_role)
      VALUES (
        v_provider_user_id, 'waitlist_slot_available',
        v_who || ' didn''t take ' || v_when,
        CASE WHEN p_missed THEN 'Their 15 minutes ran out.' ELSE 'They passed on it.' END ||
          ' The time is open to everyone now. You can offer it to someone on your waitlist from Bookings.',
        'medium', TRUE, h.provider_id, 'provider'
      );
    END IF;
    RETURN;
  END IF;

  -- Nobody left who can take it.
  IF v_provider_user_id IS NOT NULL THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, provider_id, recipient_role)
    VALUES (
      v_provider_user_id, 'waitlist_slot_available', 'Waitlist exhausted',
      'Nobody on the waitlist took ' || h.service_name_snapshot || ' on ' || v_when ||
        '. The time is open to everyone again.',
      'medium', FALSE, h.provider_id, 'provider'
    );
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.end_waitlist_hold(uuid, boolean, boolean) FROM PUBLIC, anon, authenticated;

-- The every-minute sweep. Now includes holds with a checkout attached.
CREATE OR REPLACE FUNCTION public.expire_waitlist_holds()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  FOR v_id IN
    SELECT id FROM public.bookings
     WHERE status = 'on_hold'
       AND waitlist_entry_id IS NOT NULL
       AND hold_expires_at < now()
  LOOP
    PERFORM public.end_waitlist_hold(v_id, true, true);
  END LOOP;
END;
$function$;

-- "Pass it on". The client chose this, so they aren't told back. Also how the
-- app clears a hold whose time ran out before the sweep reached it (Rejoin or
-- Dismiss on a "has gone" card), which the provider hears as missed.
CREATE OR REPLACE FUNCTION public.decline_waitlist_hold(p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_booking public.bookings%ROWTYPE;
BEGIN
  SELECT * INTO v_booking FROM public.bookings
   WHERE id = p_booking_id AND status = 'on_hold' AND waitlist_entry_id IS NOT NULL;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF v_booking.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not your hold';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.checkout_batches
     WHERE id = v_booking.hold_batch_id AND status = 'prepared' AND payment_intent_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Your payment for this slot is still going through. Check your bookings in a moment.';
  END IF;
  PERFORM public.end_waitlist_hold(p_booking_id, v_booking.hold_expires_at <= now(), false);
END;
$function$;

-- ── 7. Paid for: the entry is done ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_waitlist_entry_booked()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.provider_waitlist
     SET status = 'booked', offer_ended_at = now()
   WHERE id = NEW.waitlist_entry_id;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_waitlist_entry_booked() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_waitlist_hold_paid ON public.bookings;
CREATE TRIGGER on_waitlist_hold_paid
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW
  WHEN (OLD.status = 'on_hold' AND NEW.status IN ('pending', 'confirmed') AND NEW.waitlist_entry_id IS NOT NULL)
  EXECUTE FUNCTION public.mark_waitlist_entry_booked();

-- No more unpaid claim.
DROP FUNCTION IF EXISTS public.claim_waitlist_hold(uuid);

-- ── 8. The client's own waitlist, with their real place in line ────────────
-- position isn't renumbered when someone ahead leaves, so the place is
-- counted. Clients can't read anyone else's rows, hence SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.get_my_waitlist()
 RETURNS TABLE(
   id uuid, provider_id uuid, service_id uuid,
   service_name_snapshot text, provider_name_snapshot text,
   preferred_dates date[], notes text, status text, place_in_line integer,
   created_at timestamptz, hold_booking_id uuid,
   offered_booking_id uuid, offered_date date, offered_time time,
   offer_expires_at timestamptz, offer_ended_at timestamptz
 )
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT w.id, w.provider_id, w.service_id,
         w.service_name_snapshot, w.provider_name_snapshot,
         w.preferred_dates, w.notes, w.status,
         CASE WHEN w.status = 'waiting' THEN (
           SELECT count(*)::integer + 1
             FROM public.provider_waitlist o
            WHERE o.provider_id = w.provider_id
              AND o.service_id IS NOT DISTINCT FROM w.service_id
              AND o.status = 'waiting'
              AND (o.position, o.created_at) < (w.position, w.created_at)
         ) END,
         w.created_at,
         CASE WHEN w.status = 'notified' THEN (
           SELECT b.id FROM public.bookings b
            WHERE b.id = w.offered_booking_id AND b.status = 'on_hold' AND b.hold_expires_at > now()
         ) END,
         w.offered_booking_id, w.offered_date, w.offered_time,
         w.offer_expires_at, w.offer_ended_at
    FROM public.provider_waitlist w
   WHERE w.user_id = auth.uid()
     AND (w.status IN ('waiting', 'notified')
          OR (w.status = 'expired' AND w.offer_ended_at > now() - interval '30 days'))
   ORDER BY w.created_at DESC
   LIMIT 200;
$function$;

REVOKE ALL ON FUNCTION public.get_my_waitlist() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_waitlist() TO authenticated;

-- Change dates without going to the back of the line.
CREATE OR REPLACE FUNCTION public.update_my_waitlist_dates(p_entry_id uuid, p_preferred_dates date[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_preferred_dates IS NOT NULL THEN
    IF cardinality(p_preferred_dates) NOT IN (1, 2) THEN
      RAISE EXCEPTION 'Pick a start date, and an end date if you have one';
    END IF;
    IF cardinality(p_preferred_dates) = 2 AND p_preferred_dates[2] < p_preferred_dates[1] THEN
      RAISE EXCEPTION 'The end date is before the start date';
    END IF;
  END IF;
  UPDATE public.provider_waitlist
     SET preferred_dates = p_preferred_dates
   WHERE id = p_entry_id AND user_id = auth.uid() AND status = 'waiting';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'You can only change dates while you''re waiting';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_my_waitlist_dates(uuid, date[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_waitlist_dates(uuid, date[]) TO authenticated;

-- ── 9. The provider's side ─────────────────────────────────────────────────
-- Replaces "Schedule & Invite", which booked the client in with nothing paid.
CREATE OR REPLACE FUNCTION public.provider_offer_waitlist_slot(p_entry_id uuid, p_booking_date date, p_booking_time time)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  w public.provider_waitlist%ROWTYPE;
  v_id uuid;
BEGIN
  SELECT pw.* INTO w
    FROM public.provider_waitlist pw
    JOIN public.providers p ON p.id = pw.provider_id
   WHERE pw.id = p_entry_id AND p.user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That client isn''t on your waitlist';
  END IF;
  IF w.service_id IS NULL THEN
    RAISE EXCEPTION 'This client joined for any service. Offer them a slot when one opens up';
  END IF;
  v_id := public.offer_waitlist_slot(p_entry_id, w.service_id, p_booking_date, p_booking_time);
  UPDATE public.waitlist_released_slots
     SET resolved_at = now()
   WHERE provider_id = w.provider_id AND booking_date = p_booking_date
     AND booking_time = p_booking_time AND resolved_at IS NULL;
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.provider_offer_waitlist_slot(uuid, date, time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provider_offer_waitlist_slot(uuid, date, time) TO authenticated;

-- A released slot: offer it to the next person (p_entry_id NULL) or to one.
CREATE OR REPLACE FUNCTION public.provider_offer_released_waitlist_slot(p_slot_id uuid, p_entry_id uuid DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  s public.waitlist_released_slots%ROWTYPE;
  v_entry_service uuid;
BEGIN
  SELECT r.* INTO s
    FROM public.waitlist_released_slots r
    JOIN public.providers p ON p.id = r.provider_id
   WHERE r.id = p_slot_id AND p.user_id = auth.uid() AND r.resolved_at IS NULL
   FOR UPDATE OF r;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This slot has already been dealt with';
  END IF;

  IF p_entry_id IS NULL THEN
    IF NOT public.invite_next_waitlist_entry(
         s.provider_id, s.service_id, s.booking_date, s.booking_time, s.end_time) THEN
      RAISE EXCEPTION 'Nobody on your waitlist can take this time now. It may have been booked, or nobody''s dates fit';
    END IF;
  ELSE
    SELECT service_id INTO v_entry_service FROM public.provider_waitlist
     WHERE id = p_entry_id AND provider_id = s.provider_id AND status = 'waiting';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That client is no longer waiting';
    END IF;
    -- The slot's end time belongs to its own service; another service's
    -- length is worked out from that service instead.
    PERFORM public.offer_waitlist_slot(
      p_entry_id, COALESCE(v_entry_service, s.service_id), s.booking_date, s.booking_time,
      CASE WHEN v_entry_service IS NULL OR v_entry_service = s.service_id THEN s.end_time END);
  END IF;

  UPDATE public.waitlist_released_slots SET resolved_at = now() WHERE id = s.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.provider_offer_released_waitlist_slot(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provider_offer_released_waitlist_slot(uuid, uuid) TO authenticated;

-- "Leave it open": the time already is; this just clears the card.
CREATE OR REPLACE FUNCTION public.dismiss_released_waitlist_slot(p_slot_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.waitlist_released_slots r
     SET resolved_at = now()
    FROM public.providers p
   WHERE r.id = p_slot_id AND p.id = r.provider_id AND p.user_id = auth.uid()
     AND r.resolved_at IS NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.dismiss_released_waitlist_slot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dismiss_released_waitlist_slot(uuid) TO authenticated;

-- The provider's open released slots that are still worth offering: in the
-- future and not booked since.
CREATE OR REPLACE FUNCTION public.get_provider_released_waitlist_slots(p_provider_id uuid)
 RETURNS SETOF public.waitlist_released_slots
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT r.*
    FROM public.waitlist_released_slots r
    JOIN public.providers p ON p.id = r.provider_id
   WHERE r.provider_id = p_provider_id
     AND p.user_id = auth.uid()
     AND r.resolved_at IS NULL
     AND (r.booking_date + r.booking_time) > (now() AT TIME ZONE 'Europe/London')
     AND NOT EXISTS (
       SELECT 1 FROM public.bookings b
        WHERE b.provider_id = r.provider_id AND b.booking_date = r.booking_date
          AND b.status IN ('pending', 'confirmed', 'in_progress', 'on_hold')
          AND (b.status <> 'on_hold' OR b.hold_expires_at IS NULL OR b.hold_expires_at > now())
          AND r.booking_time < b.end_time
          AND COALESCE(r.end_time, r.booking_time + interval '1 minute') > b.booking_time
     )
   ORDER BY r.booking_date, r.booking_time
   LIMIT 50;
$function$;

REVOKE ALL ON FUNCTION public.get_provider_released_waitlist_slots(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_provider_released_waitlist_slots(uuid) TO authenticated;

-- Remove someone, and tell them.
CREATE OR REPLACE FUNCTION public.provider_remove_waitlist_entry(p_entry_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  w public.provider_waitlist%ROWTYPE;
  v_provider_name text;
BEGIN
  SELECT pw.* INTO w
    FROM public.provider_waitlist pw
    JOIN public.providers p ON p.id = pw.provider_id
   WHERE pw.id = p_entry_id AND p.user_id = auth.uid()
   FOR UPDATE OF pw;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That client isn''t on your waitlist';
  END IF;
  IF w.status = 'notified' THEN
    RAISE EXCEPTION 'A slot is held for this client right now. Wait for them to pay or for it to end';
  END IF;
  SELECT display_name INTO v_provider_name FROM public.providers WHERE id = w.provider_id;

  DELETE FROM public.provider_waitlist WHERE id = w.id;

  IF w.status = 'waiting' THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, provider_id, recipient_role)
    VALUES (
      w.user_id, 'waitlist_slot_available', 'Taken off a waitlist',
      COALESCE(v_provider_name, w.provider_name_snapshot) || ' took you off their waitlist for ' ||
        w.service_name_snapshot || '.',
      'medium', FALSE, w.provider_id, 'client'
    );
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.provider_remove_waitlist_entry(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provider_remove_waitlist_entry(uuid) TO authenticated;

-- ── 10. Checkout takes a waitlist hold ─────────────────────────────────────
-- ── prepare_checkout (live + waitlist holds) ──
CREATE OR REPLACE FUNCTION public.prepare_checkout(p_items jsonb)
 RETURNS TABLE(checkout_batch_id uuid, amount_due numeric, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_item jsonb;
  v_provider public.providers%ROWTYPE;
  v_service public.services%ROWTYPE;
  v_booking_id uuid;
  v_batch_id uuid := gen_random_uuid();
  v_add_on_ids jsonb;
  v_add_ons_total numeric(10,2);
  v_add_on_minutes integer;
  v_subtotal numeric(10,2);
  v_deposit numeric(10,2);
  v_due numeric(10,2) := 0;
  v_use_deposit boolean;
  v_deposit_type text;
  v_deposit_amount numeric(10,2);
  v_end_time time;
  v_user public.users%ROWTYPE;
  v_expiry timestamptz := now() + interval '5 minutes';
  v_daily_booking_cap integer;
  v_active_booking_count integer;
  v_safety_required boolean;
  v_safety_ack boolean;
  v_emergency boolean;
  v_emergency_ack boolean;
  v_stale_batch_id uuid;
  -- A waitlist hold paid for through this checkout (20261112100000).
  v_wl_hold public.bookings%ROWTYPE;
  v_wl_count integer;
  v_is_wl boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in is required'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one booking is required';
  END IF;
  IF jsonb_array_length(p_items) > 20 THEN RAISE EXCEPTION 'Too many bookings in one checkout'; END IF;

  SELECT u.* INTO v_user FROM public.users u WHERE u.id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Client profile was not found'; END IF;

  -- NEW: release the caller's own abandoned, unpaid checkouts that hold a
  -- slot with a provider on a date this checkout books (see header).
  FOR v_stale_batch_id IN
    SELECT DISTINCT cb.id
      FROM public.checkout_batches cb
      JOIN public.bookings b ON b.hold_batch_id = cb.id
     WHERE cb.user_id = auth.uid()
       AND cb.status = 'prepared'
       AND cb.payment_intent_id IS NULL
       AND b.status = 'on_hold'
       AND EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_items) AS i(value)
          WHERE NULLIF(i.value->>'provider_id', '')::uuid = b.provider_id
            AND NULLIF(i.value->>'booking_date', '')::date = b.booking_date
       )
  LOOP
    PERFORM public.cancel_checkout(v_stale_batch_id);
  END LOOP;

  -- A waitlist hold can be paid for here. Its row is reused, so it keeps its
  -- id and its own 15 minutes, and this checkout can't outlast it: the
  -- client's time keeps running while they pay (decided 2026-11-10).
  SELECT count(*) INTO v_wl_count
    FROM jsonb_array_elements(p_items) AS i(value)
   WHERE NULLIF(i.value->>'waitlist_hold_id', '') IS NOT NULL;
  IF v_wl_count > 1 THEN RAISE EXCEPTION 'Pay for one waitlist slot at a time'; END IF;
  IF v_wl_count = 1 THEN
    SELECT b.* INTO v_wl_hold
      FROM public.bookings b
     WHERE b.id = (SELECT NULLIF(i.value->>'waitlist_hold_id', '')::uuid
                     FROM jsonb_array_elements(p_items) AS i(value)
                    WHERE NULLIF(i.value->>'waitlist_hold_id', '') IS NOT NULL)
       AND b.user_id = auth.uid()
       AND b.status = 'on_hold'
       AND b.waitlist_entry_id IS NOT NULL
       AND b.hold_expires_at > now()
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'This waitlist slot is no longer held for you'; END IF;
    -- A payment already started on this hold must finish (or be cancelled)
    -- first. Re-pointing the row at a new checkout would leave the first
    -- payment finalising with no booking, and the client charged twice.
    IF v_wl_hold.hold_batch_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.checkout_batches cb
       WHERE cb.id = v_wl_hold.hold_batch_id
         AND cb.status = 'prepared'
         AND cb.payment_intent_id IS NOT NULL
         AND cb.expires_at > now()
    ) THEN
      RAISE EXCEPTION 'Your payment for this slot is still going through. Check your bookings in a moment.';
    END IF;
    v_expiry := LEAST(v_expiry, v_wl_hold.hold_expires_at);
  END IF;

  INSERT INTO public.checkout_batches (id, user_id, amount_due, expires_at)
  VALUES (v_batch_id, auth.uid(), 0, v_expiry);

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF NULLIF(v_item->>'provider_id', '') IS NULL
       OR NULLIF(v_item->>'service_id', '') IS NULL
       OR NULLIF(v_item->>'booking_date', '') IS NULL
       OR NULLIF(v_item->>'booking_time', '') IS NULL THEN
      RAISE EXCEPTION 'Each booking needs a provider, service, date and time';
    END IF;

    SELECT p.* INTO v_provider FROM public.providers p
     WHERE p.id = (v_item->>'provider_id')::uuid AND p.has_gone_live = true FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Provider is not available for booking'; END IF;
    SELECT s.* INTO v_service FROM public.services s
     WHERE s.id = (v_item->>'service_id')::uuid AND s.provider_id = v_provider.id AND s.is_active = true FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Service is no longer available'; END IF;

    v_add_on_ids := COALESCE(v_item->'add_on_ids', '[]'::jsonb);
    IF jsonb_typeof(v_add_on_ids) <> 'array' THEN RAISE EXCEPTION 'Invalid add-ons'; END IF;
    -- Universal add-ons: an add-on can make the appointment longer, so its
    -- extra time is summed from the same rows that price it.
    SELECT COALESCE(sum(a.price), 0), COALESCE(sum(a.extra_minutes), 0)
      INTO v_add_ons_total, v_add_on_minutes
      FROM public.service_add_ons a
     WHERE a.service_id = v_service.id AND a.is_active = true
       AND a.id IN (SELECT e.value::uuid FROM jsonb_array_elements_text(v_add_on_ids) AS e(value));
    IF (SELECT count(*) FROM jsonb_array_elements_text(v_add_on_ids)) <>
       (SELECT count(*) FROM public.service_add_ons a WHERE a.service_id = v_service.id AND a.is_active = true
          AND a.id IN (SELECT e.value::uuid FROM jsonb_array_elements_text(v_add_on_ids) AS e(value))) THEN
      RAISE EXCEPTION 'One or more add-ons are unavailable';
    END IF;

    v_safety_required := COALESCE(v_service.patch_test_required, false)
      OR v_service.is_pregnancy_safe = false;
    v_safety_ack := COALESCE((v_item->>'safety_ack')::boolean, false);
    IF v_safety_required AND NOT v_safety_ack THEN
      RAISE EXCEPTION 'Please confirm you have seen this treatment''s safety information before continuing';
    END IF;

    v_emergency := COALESCE((v_item->>'emergency')::boolean, false);
    v_is_wl := NULLIF(v_item->>'waitlist_hold_id', '') IS NOT NULL;
    IF v_is_wl THEN
      IF v_wl_hold.provider_id <> v_provider.id
         OR v_wl_hold.service_id IS DISTINCT FROM v_service.id
         OR v_wl_hold.booking_date <> (v_item->>'booking_date')::date
         OR v_wl_hold.booking_time <> (v_item->>'booking_time')::time THEN
        RAISE EXCEPTION 'This waitlist slot is held for a different time';
      END IF;
      IF v_emergency THEN
        RAISE EXCEPTION 'A waitlist slot can''t be an out-of-hours request';
      END IF;
    END IF;
    v_emergency_ack := COALESCE((v_item->>'emergency_ack')::boolean, false);
    IF v_emergency AND NOT v_emergency_ack THEN
      RAISE EXCEPTION 'Please confirm you have read this provider''s policy before requesting a time outside their availability';
    END IF;

    -- Mobile-address gate: a mobile provider travels TO the client, so a mobile
    -- booking with no client address is a provider sent nowhere. Fail closed
    -- here -- same shape as the two gates above. business_type is read from the
    -- provider row, never trusted from the client payload.
    IF v_provider.business_type = 'mobile'
       AND NULLIF(btrim(v_item->>'client_address'), '') IS NULL THEN
      RAISE EXCEPTION 'A mobile booking needs the client''s address before payment';
    END IF;

    v_subtotal := v_service.price + v_add_ons_total;
    v_use_deposit := COALESCE((v_item->>'use_deposit')::boolean, false);
    v_deposit_type := COALESCE(v_provider.booking_policies->>'depositType', 'percentage');
    v_deposit_amount := NULLIF(v_provider.booking_policies->>'depositAmount', '')::numeric;
    IF COALESCE((v_provider.booking_policies->>'depositRequired')::boolean, true) = false THEN v_use_deposit := false; END IF;
    IF COALESCE((v_provider.booking_policies->>'depositOnly')::boolean, false) THEN v_use_deposit := true; END IF;
    v_deposit := CASE WHEN v_use_deposit THEN LEAST(v_subtotal,
      CASE WHEN v_deposit_type = 'fixed' THEN COALESCE(v_deposit_amount, 0)
           ELSE round(v_subtotal * COALESCE(v_deposit_amount, 20) / 100, 2) END)
      ELSE 0 END;
    v_due := v_due + CASE WHEN v_use_deposit THEN v_deposit ELSE v_subtotal END;
    v_end_time := (v_item->>'booking_time')::time + make_interval(mins => v_service.duration_minutes + v_add_on_minutes);

    v_daily_booking_cap := COALESCE(v_provider.max_bookings_per_day, 0);
    IF v_daily_booking_cap > 0 THEN
      SELECT count(*) INTO v_active_booking_count
        FROM public.bookings b
       WHERE b.provider_id = v_provider.id
         AND b.booking_date = (v_item->>'booking_date')::date
         AND b.status IN ('pending', 'confirmed', 'in_progress', 'on_hold')
         -- The waitlist hold being paid for is this booking, not another one.
         AND b.id IS DISTINCT FROM v_wl_hold.id;
      IF v_active_booking_count >= v_daily_booking_cap THEN
        RAISE EXCEPTION 'This provider has reached their booking limit for that date';
      END IF;
    END IF;

    IF v_is_wl THEN
      -- Price and consent are written onto the held row exactly as an insert
      -- below would write them. hold_expires_at is left alone.
      UPDATE public.bookings SET
        notes = NULLIF(btrim(v_item->>'notes'), ''),
        payment_type = CASE WHEN v_use_deposit THEN 'deposit' ELSE 'full' END,
        base_price = v_service.price,
        add_ons_total = v_add_ons_total,
        service_charge = 0,
        deposit_amount = v_deposit,
        amount_paid = CASE WHEN v_use_deposit THEN v_deposit ELSE v_subtotal END,
        remaining_balance = CASE WHEN v_use_deposit THEN v_subtotal - v_deposit ELSE 0 END,
        payment_status = CASE WHEN v_use_deposit THEN 'deposit_paid' ELSE 'fully_paid' END,
        provider_name_snapshot = v_provider.display_name,
        service_name_snapshot = v_service.name,
        service_category_snapshot = v_provider.service_category,
        provider_logo_snapshot = v_provider.logo_url,
        customer_name = v_user.name,
        customer_email = v_user.email,
        customer_phone = v_user.phone,
        hold_batch_id = v_batch_id,
        safety_ack_required = v_safety_required,
        safety_ack_at = CASE WHEN v_safety_required THEN now() ELSE NULL END,
        client_address = CASE WHEN v_provider.business_type = 'mobile' THEN NULLIF(btrim(v_item->>'client_address'), '') ELSE NULL END,
        client_area = CASE WHEN v_provider.business_type = 'mobile' THEN NULLIF(btrim(v_item->>'client_area'), '') ELSE NULL END
      WHERE id = v_wl_hold.id;
      -- Only when add-ons make it longer: writing end_time re-runs the
      -- booking gate, which must not refuse an unchanged held time.
      IF v_end_time IS DISTINCT FROM v_wl_hold.end_time THEN
        UPDATE public.bookings SET end_time = v_end_time WHERE id = v_wl_hold.id;
      END IF;
      v_booking_id := v_wl_hold.id;
    ELSE
    INSERT INTO public.bookings (
      user_id, provider_id, service_id, status, booking_date, booking_time, end_time, notes,
      payment_type, base_price, add_ons_total, service_charge, deposit_amount, amount_paid,
      remaining_balance, payment_status, provider_name_snapshot, service_name_snapshot,
      service_category_snapshot, provider_logo_snapshot, customer_name, customer_email,
      customer_phone, hold_batch_id, hold_expires_at, safety_ack_required, safety_ack_at,
      is_emergency_request, emergency_ack_at, client_address, client_area
    ) VALUES (
      auth.uid(), v_provider.id, v_service.id, 'on_hold', (v_item->>'booking_date')::date,
      (v_item->>'booking_time')::time, v_end_time, NULLIF(btrim(v_item->>'notes'), ''),
      CASE WHEN v_use_deposit THEN 'deposit' ELSE 'full' END, v_service.price, v_add_ons_total, 0,
      v_deposit, CASE WHEN v_use_deposit THEN v_deposit ELSE v_subtotal END,
      CASE WHEN v_use_deposit THEN v_subtotal - v_deposit ELSE 0 END,
      CASE WHEN v_use_deposit THEN 'deposit_paid' ELSE 'fully_paid' END,
      v_provider.display_name, v_service.name, v_provider.service_category, v_provider.logo_url,
      v_user.name, v_user.email, v_user.phone, v_batch_id, v_expiry,
      v_safety_required, CASE WHEN v_safety_required THEN now() ELSE NULL END,
      v_emergency, CASE WHEN v_emergency THEN now() ELSE NULL END,
      CASE WHEN v_provider.business_type = 'mobile' THEN NULLIF(btrim(v_item->>'client_address'), '') ELSE NULL END,
      CASE WHEN v_provider.business_type = 'mobile' THEN NULLIF(btrim(v_item->>'client_area'), '') ELSE NULL END
    ) RETURNING id INTO v_booking_id;
    END IF;
    INSERT INTO public.checkout_batch_items (checkout_batch_id, booking_id, add_on_ids)
    VALUES (v_batch_id, v_booking_id, v_add_on_ids);
  END LOOP;

  UPDATE public.checkout_batches SET amount_due = v_due WHERE id = v_batch_id;
  RETURN QUERY SELECT v_batch_id, v_due, v_expiry;
END;
$function$;

-- ── cancel_checkout (live + detach waitlist holds) ──
CREATE OR REPLACE FUNCTION public.cancel_checkout(p_checkout_batch_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in is required';
  END IF;

  UPDATE public.checkout_batches
     SET status = 'cancelled'
   WHERE id = p_checkout_batch_id
     AND user_id = auth.uid()
     AND status = 'prepared';

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- A waitlist hold outlives a checkout that was closed: it stays held for
  -- its own 15 minutes so the client can try again (20261112100000).
  UPDATE public.bookings
     SET hold_batch_id = NULL
   WHERE hold_batch_id = p_checkout_batch_id
     AND user_id = auth.uid()
     AND status = 'on_hold'
     AND waitlist_entry_id IS NOT NULL;

  DELETE FROM public.notifications n
   USING public.bookings b
   WHERE n.booking_id = b.id
     AND b.hold_batch_id = p_checkout_batch_id
     AND b.user_id = auth.uid()
     AND b.status = 'on_hold'
     AND NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.booking_id = b.id)
     AND NOT EXISTS (SELECT 1 FROM public.reviews r WHERE r.booking_id = b.id);

  DELETE FROM public.bookings b
   WHERE b.hold_batch_id = p_checkout_batch_id
     AND b.user_id = auth.uid()
     AND b.status = 'on_hold'
     AND NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.booking_id = b.id)
     AND NOT EXISTS (SELECT 1 FROM public.reviews r WHERE r.booking_id = b.id);
END;
$function$;

-- ── expire_cart_holds (live + skip waitlist holds) ──
CREATE OR REPLACE FUNCTION public.expire_cart_holds()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.notifications n
   USING public.bookings b
   WHERE n.booking_id = b.id
     AND b.status = 'on_hold'
     AND b.hold_batch_id IS NOT NULL
     -- A waitlist hold ends through expire_waitlist_holds(), which tells the
     -- client and offers the slot on (20261112100000).
     AND b.waitlist_entry_id IS NULL
     AND b.hold_expires_at < NOW()
     AND NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.booking_id = b.id)
     AND NOT EXISTS (SELECT 1 FROM public.reviews r WHERE r.booking_id = b.id);

  DELETE FROM public.bookings b
   WHERE b.status = 'on_hold'
     AND b.hold_batch_id IS NOT NULL
     -- A waitlist hold ends through expire_waitlist_holds(), which tells the
     -- client and offers the slot on (20261112100000).
     AND b.waitlist_entry_id IS NULL
     AND b.hold_expires_at < NOW()
     AND NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.booking_id = b.id)
     AND NOT EXISTS (SELECT 1 FROM public.reviews r WHERE r.booking_id = b.id);
END;
$function$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261112100000', 'waitlist_pays_at_confirm')
ON CONFLICT (version) DO NOTHING;

COMMIT;
