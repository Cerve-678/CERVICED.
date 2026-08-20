-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260820095910
-- Remote name: revoke_public_waitlist_invite_function
-- Do not edit this recovery archive; create a new tracked migration for changes.

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
