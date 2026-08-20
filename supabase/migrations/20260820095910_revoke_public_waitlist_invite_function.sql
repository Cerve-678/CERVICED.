-- This SECURITY DEFINER function creates bookings and notifications. It is
-- invoked only by trusted booking-status triggers and the waitlist-expiry cron
-- function, so it must never be exposed as a client RPC.
REVOKE ALL ON FUNCTION public.expire_cart_holds() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_waitlist_holds() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.invite_next_waitlist_entry(
  uuid,
  uuid,
  date,
  time without time zone,
  time without time zone,
  numeric,
  numeric,
  numeric,
  text
) FROM PUBLIC, anon, authenticated;
