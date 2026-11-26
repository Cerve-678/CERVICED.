-- A client booking can only be made by paying for it.
--
-- hold_cart_booking_slots + claim_cart_booking_slots were the app's original
-- checkout, from before Stripe: hold the times, then claim them as real
-- bookings. The claim wrote whatever the caller sent into payment_status,
-- amount_paid and payment_intent_id, and confirmed the booking at once for a
-- provider with auto-accept on (16 of 17 live providers on 2026-11-26). Both
-- were still executable by any signed-in user, so anyone calling the API
-- directly could book without paying, the booking showing as paid.
-- 20260810180952_restore_legacy_booking_writes_pending_stripe said to revoke
-- these once Stripe checkout was on; every build has used Stripe
-- (prepare_checkout + create-payment-intent + finalize-payment-intent) since
-- 2026-10-18, and the app's old route is deleted in the same change.
--
-- Checked live before writing: nothing calls these three (no function, no
-- cron job; prepare_checkout and get_provider_busy_spans only mention them in
-- comments), no booking from the last 30 days lacks a payment intent, and the
-- 19 bookings that never went through a checkout all date from 30 Sep–10 Oct,
-- when builds still used the practice card form.
--
-- expire_cart_holds() stays: prepare_checkout's holds carry a hold_batch_id
-- too (the checkout batch), and it clears those once their time runs out.

BEGIN;

-- Stop if live has changed since this was written (md5 of
-- pg_get_functiondef, read 2026-11-26).
DO $$
DECLARE
  v_expected CONSTANT jsonb := jsonb_build_object(
    'hold_cart_booking_slots(uuid,jsonb)', 'fac4fd250d5d5ebb07fa660ca0a88870',
    'claim_cart_booking_slots(uuid,jsonb)', '46299b81722f6f1f384a87860f437f99',
    'release_cart_booking_slots(uuid)', 'a19638daa9c23fb1c45400278e7545cb'
  );
  v_sig text;
  v_md5 text;
BEGIN
  FOR v_sig IN SELECT jsonb_object_keys(v_expected) LOOP
    SELECT md5(pg_get_functiondef(to_regprocedure('public.' || v_sig))) INTO v_md5;
    IF v_md5 IS DISTINCT FROM v_expected->>v_sig THEN
      RAISE EXCEPTION 'public.% is not the version this migration was written against (md5 %)', v_sig, v_md5;
    END IF;
  END LOOP;
END $$;

DROP FUNCTION public.claim_cart_booking_slots(uuid, jsonb);
DROP FUNCTION public.hold_cart_booking_slots(uuid, jsonb);
DROP FUNCTION public.release_cart_booking_slots(uuid);

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261126120000', 'checkout_only_through_payment')
ON CONFLICT DO NOTHING;

COMMIT;
