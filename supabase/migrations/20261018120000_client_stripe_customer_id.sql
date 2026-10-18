-- Client-side Stripe Customer mapping for saved cards.
--
-- Adds public.users.stripe_customer_id: the Stripe Customer (cus_...) that a
-- client's saved cards hang off. NULL until the client first opens Payment
-- Methods or checks out, at which point the client-saved-cards /
-- create-payment-intent functions get-or-create it and write it back with the
-- service role.
--
-- Why a Customer at all: a card saved through Stripe is only reusable at
-- checkout if the SAME Customer is used to save it and to charge it. The
-- existing create-payment-intent created a bare PaymentIntent with no
-- customer, so nothing could be saved or reused. This column is the join.
--
-- Card details themselves are never stored here or anywhere in CERVICED: the
-- Payment Methods screen reads brand/last4/expiry live from Stripe.
--
-- ADDITIVE and SAFE to apply on its own: one nullable column + a guard
-- trigger. Nothing reads it until the matching functions are deployed and the
-- client build ships; an absent value just means "no customer yet".
--
-- Frontier at authoring: 20261011102423.

ALTER TABLE public.users
  -- UNIQUE so two user rows can never share one Stripe Customer.
  ADD COLUMN IF NOT EXISTS stripe_customer_id text UNIQUE;

COMMENT ON COLUMN public.users.stripe_customer_id IS
  'Stripe Customer id (cus_...) for this client''s saved cards. Written '
  'server-side only (client-saved-cards / create-payment-intent, service '
  'role); a client write is rejected by enforce_user_stripe_customer_server_only.';

-- SERVER-ONLY WRITE GUARD. Same reasoning as the provider guard
-- (20260929050657_guard_provider_stripe_columns_server_only): a column-level
-- REVOKE is a no-op here because clients hold a table-level UPDATE grant on
-- public.users and the users-own-row RLS policy lets them update every column
-- of their own row. Left unguarded, a client could point stripe_customer_id at
-- someone else's Customer (reading or paying with another person's saved
-- cards) or clear it. These writes must only ever come from the service role.
--
-- SECURITY INVOKER on purpose: the guard must read the REAL request role via
-- current_user (PostgREST SET ROLEs to 'authenticated'/'anon'/'service_role'
-- per request); a DEFINER function would report the owner and defeat the check.
CREATE OR REPLACE FUNCTION public.enforce_user_stripe_customer_server_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
     AND current_user IN ('authenticated', 'anon')
  THEN
    RAISE EXCEPTION 'Saved-card account is managed by the payment system and cannot be changed directly.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

-- Covers INSERT too: a client creating their own users row must not seed it.
CREATE OR REPLACE FUNCTION public.enforce_user_stripe_customer_server_only_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.stripe_customer_id IS NOT NULL
     AND current_user IN ('authenticated', 'anon')
  THEN
    RAISE EXCEPTION 'Saved-card account is managed by the payment system and cannot be changed directly.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.enforce_user_stripe_customer_server_only() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_user_stripe_customer_server_only_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_user_stripe_customer_server_only ON public.users;
CREATE TRIGGER enforce_user_stripe_customer_server_only
  BEFORE UPDATE OF stripe_customer_id
  ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_user_stripe_customer_server_only();

DROP TRIGGER IF EXISTS enforce_user_stripe_customer_server_only_insert ON public.users;
CREATE TRIGGER enforce_user_stripe_customer_server_only_insert
  BEFORE INSERT
  ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_user_stripe_customer_server_only_insert();
