-- One top tier: £9.99 for all full-payment checkouts from £200 upward.
CREATE OR REPLACE FUNCTION public.calculate_platform_fee(p_full_payment_subtotal numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $function$
  SELECT CASE
    WHEN COALESCE(p_full_payment_subtotal, 0) <= 0 THEN 0
    WHEN p_full_payment_subtotal < 50 THEN 1.99
    WHEN p_full_payment_subtotal < 100 THEN 3.99
    WHEN p_full_payment_subtotal < 200 THEN 5.99
    ELSE 9.99
  END::numeric(10,2);
$function$;

REVOKE ALL ON FUNCTION public.calculate_platform_fee(numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_platform_fee(numeric) FROM anon, authenticated;
