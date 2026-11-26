-- A card the bank refused, with nobody left to see it, now tells the client.
--
-- When the client closes the app while paying and the card is then declined,
-- nothing was shown anywhere: reconcile-checkouts cancelled the payment once
-- the hold ran out and recorded 'abandoned', which says nothing. The client
-- never learnt the payment had failed. (Leaving the Cart with the app still
-- open is handled in the app, #727.)
--
-- reconcile-checkouts now records 'declined' for such a checkout when Stripe
-- shows a refused attempt (last_payment_error) and no approved charge. This
-- migration lets the column hold it and sends the client the same
-- "Payment didn't go through" notice the other unpaid outcomes use. A
-- checkout simply walked away from (no attempt refused) stays 'abandoned' and
-- silent, as before.
--
-- Frontier: live 20261125100000 (2026-11-25). Lock taken in
-- MIGRATION_OWNER.md on fix/declined-payment-told-and-freed. Re-check
-- max(version) and the lock before applying.
--
-- What this changes:
--   - checkout_batches_outcome_check also allows 'declined'.
--   - record_checkout_outcome: accepts 'declined' and notifies the client.
--     Like 'abandoned', a later real money outcome ('not_charged', 'refunded')
--     still replaces it, so an approval that lands after all is explained.
--     Otherwise the live function is unchanged (md5-guarded).

BEGIN;

DO $$
BEGIN
  IF md5(pg_get_functiondef('public.record_checkout_outcome(uuid,text)'::regprocedure))
     <> '30c5228a80a7e1d54b6d04a5ff4cd832' THEN
    RAISE EXCEPTION 'record_checkout_outcome changed since this was written; re-read it before applying';
  END IF;
END $$;

ALTER TABLE public.checkout_batches DROP CONSTRAINT checkout_batches_outcome_check;
ALTER TABLE public.checkout_batches ADD CONSTRAINT checkout_batches_outcome_check
  CHECK (outcome = ANY (ARRAY['not_charged'::text, 'refunded'::text, 'abandoned'::text, 'declined'::text]));

CREATE OR REPLACE FUNCTION public.record_checkout_outcome(p_checkout_batch_id uuid, p_outcome text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid;
  v_amount  numeric;
  v_figure  text;
BEGIN
  IF p_outcome NOT IN ('not_charged', 'refunded', 'abandoned', 'declined') THEN
    RAISE EXCEPTION 'Unknown checkout outcome %', p_outcome;
  END IF;

  -- Once only: a second settle of the same checkout records nothing more. The
  -- exceptions are 'abandoned' and 'declined', which say nothing was taken: if
  -- money did move after all, the real outcome replaces them and the client is
  -- told. 'declined' never replaces anything.
  UPDATE public.checkout_batches
     SET outcome = p_outcome,
         status  = CASE WHEN status = 'prepared' THEN 'expired' ELSE status END
   WHERE id = p_checkout_batch_id
     AND (outcome IS NULL
          OR (outcome IN ('abandoned', 'declined') AND p_outcome IN ('not_charged', 'refunded')))
     AND status <> 'finalised'
  RETURNING user_id, amount_due INTO v_user_id, v_amount;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF p_outcome = 'abandoned' THEN
    RETURN true;
  END IF;

  v_figure := '£' || TO_CHAR(COALESCE(v_amount, 0), 'FM999990.00');
  -- The held bookings may already have been cleared by expire_cart_holds, so
  -- the notice names the amount rather than a service. 'declined' can come
  -- from the app or the website, so it doesn't mention the Cart.
  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role, metadata)
  VALUES (
    v_user_id, 'payment_not_completed',
    CASE p_outcome WHEN 'refunded' THEN 'Booking not completed' ELSE 'Payment didn''t go through' END,
    CASE p_outcome
      WHEN 'refunded' THEN
        'Your time was no longer available by the time your payment of ' || v_figure ||
        ' went through, so we''ve refunded it in full. It can take 5–10 working days to show on your statement.'
      WHEN 'declined' THEN
        'Your payment of ' || v_figure || ' didn''t go through, so you haven''t been charged and nothing was booked. ' ||
        'You can try again whenever you''re ready.'
      ELSE
        'We couldn''t confirm your booking in time, so your payment of ' || v_figure ||
        ' was cancelled and you haven''t been charged. If your bank shows it as pending, it will drop off in a few days.'
    END,
    'high', FALSE, NULL, NULL, 'client',
    jsonb_build_object('checkout_batch_id', p_checkout_batch_id, 'outcome', p_outcome,
                       'amount_pence', ROUND(COALESCE(v_amount, 0) * 100))
  );
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_checkout_outcome(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_checkout_outcome(uuid, text) TO service_role;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261125140000', 'declined_payment_tells_client')
ON CONFLICT (version) DO NOTHING;

COMMIT;
