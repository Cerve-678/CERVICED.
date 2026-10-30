-- The admin Money screen: who counts as an admin, what they can see, and the
-- two actions that don't need Stripe (retry a payout, decline a refund
-- request). Approving a refund moves money, so it goes through refund-payment,
-- which now also accepts a signed-in admin (same branch).
--
-- Until now support read refund_requests and provider_shortfalls in the SQL
-- editor and resolved them with hand-written UPDATEs. Admins are accounts
-- listed in admin_users. Nobody can add themselves from the app: rows are
-- written here or in the SQL editor only. The user is the only admin for now
-- (decision 2026-10-21); support staff are added later the same way.
--
--   INSERT INTO public.admin_users (user_id, note)
--   SELECT id, 'owner' FROM auth.users WHERE email = '<the account email>';
--
-- Every action an admin takes is written to admin_actions with who and when,
-- and that table is append-only. An admin refund must answer a request the
-- provider passed to Cerviced (refund-payment checks), and is logged before
-- Stripe is called. Not yet required: a second factor (MFA) for admin
-- sessions; raised with the user 2026-10-24.
--
-- Needs 20261025211000_payout_retries_and_alerts first (attempt_count and
-- money_needing_attention()). Renumbered 2026-10-24 from 20261021202000,
-- which fell below the frontier when 20261024100000 was applied, and again
-- 2026-10-25 above 20261025120000 (service_search), into a range no other
-- session's file uses. Apply order:
-- 20261025145000 → 20261025210000 → 20261025211000 → this.

-- ── 1. who is an admin ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id  uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  note     text,
  added_at timestamptz NOT NULL DEFAULT now()
);
-- RLS on with no policies: app users can't read or write it at all. The
-- functions below read it as SECURITY DEFINER.
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_users FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.admin_actions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Kept (as NULL) if the admin's account is later deleted, so the record stays.
  admin_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action        text NOT NULL CHECK (action IN ('retry_payout', 'decline_refund_request', 'approve_refund')),
  -- What was acted on: the payout (retry_payout) or the refund request
  -- (decline_refund_request, approve_refund). detail always has booking_id.
  target_id     uuid NOT NULL,
  detail        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_actions FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS admin_actions_target_idx ON public.admin_actions (target_id, created_at DESC);

-- The record only grows: nobody, the table owner included, edits or removes
-- a row once it's written.
CREATE OR REPLACE FUNCTION public.admin_actions_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RAISE EXCEPTION 'admin_actions is append-only';
END;
$function$;
DROP TRIGGER IF EXISTS admin_actions_append_only ON public.admin_actions;
CREATE TRIGGER admin_actions_append_only
  BEFORE UPDATE OR DELETE ON public.admin_actions
  FOR EACH ROW EXECUTE FUNCTION public.admin_actions_append_only();

-- True only for the caller themselves, so the app can decide whether to show
-- the settings row. Never says anything about anyone else.
CREATE OR REPLACE FUNCTION public.is_cerviced_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid());
$function$;
REVOKE EXECUTE ON FUNCTION public.is_cerviced_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_cerviced_admin() TO authenticated;

-- ── 2. what an admin sees ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_money_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_cerviced_admin() THEN
    RAISE EXCEPTION 'Only CERVICED admins can see this.';
  END IF;
  RETURN public.money_needing_attention();
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.admin_money_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_money_overview() TO authenticated;

-- ── 3. try a payout again now ──────────────────────────────────────────────
-- Puts a failed (or waiting-to-retry) payout back as held and due now, so the
-- next 15-minute release run picks it up. attempt_count is kept: if this try
-- fails too, the payout goes straight back to 'failed' and support is emailed,
-- rather than starting three more automatic retries. Safe even if an earlier
-- try did reach Stripe: release-payouts looks up the payout's transfer group
-- first and records that transfer instead of sending a second one.
CREATE OR REPLACE FUNCTION public.admin_retry_payout(p_payout_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_status text;
  v_attempts integer;
  v_booking_id uuid;
BEGIN
  IF NOT public.is_cerviced_admin() THEN
    RAISE EXCEPTION 'Only CERVICED admins can do this.';
  END IF;

  SELECT status, attempt_count, booking_id INTO v_status, v_attempts, v_booking_id
    FROM public.provider_payouts WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found.';
  END IF;
  IF NOT (v_status = 'failed' OR (v_status = 'held' AND v_attempts > 0)) THEN
    RAISE EXCEPTION 'This payment isn''t waiting on a retry any more.';
  END IF;

  UPDATE public.provider_payouts
     SET status = 'held', release_after = now(), updated_at = now()
   WHERE id = p_payout_id;

  INSERT INTO public.admin_actions (admin_user_id, action, target_id, detail)
  VALUES (auth.uid(), 'retry_payout', p_payout_id,
          jsonb_build_object('booking_id', v_booking_id, 'from_status', v_status, 'attempt_count', v_attempts));
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.admin_retry_payout(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_retry_payout(uuid) TO authenticated;

-- ── 4. decline a refund request ────────────────────────────────────────────
-- Cerviced's "no", only once the provider has passed the request on (while
-- it's with them, it's theirs to answer). A note is required
-- (refund_requests' CHECK already refuses a decline without one); it is what
-- the client is told. The refund_requests trigger tells the client and the
-- provider.
CREATE OR REPLACE FUNCTION public.admin_decline_refund_request(p_request_id uuid, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_note text := NULLIF(BTRIM(COALESCE(p_note, '')), '');
  v_booking_id uuid;
BEGIN
  IF NOT public.is_cerviced_admin() THEN
    RAISE EXCEPTION 'Only CERVICED admins can do this.';
  END IF;
  IF v_note IS NULL THEN
    RAISE EXCEPTION 'Write a note to the client saying why.';
  END IF;

  UPDATE public.refund_requests
     SET status = 'declined', outcome_note = LEFT(v_note, 1000), resolved_at = now()
   WHERE id = p_request_id AND status = 'under_review'
  RETURNING booking_id INTO v_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This refund request isn''t waiting on Cerviced.';
  END IF;

  INSERT INTO public.admin_actions (admin_user_id, action, target_id, detail)
  VALUES (auth.uid(), 'decline_refund_request', p_request_id,
          jsonb_build_object('booking_id', v_booking_id, 'note', LEFT(v_note, 1000)));
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.admin_decline_refund_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_decline_refund_request(uuid, text) TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261025212000', 'admin_money_screen')
ON CONFLICT (version) DO NOTHING;
