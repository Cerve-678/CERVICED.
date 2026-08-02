-- ============================================================
-- CERVICED — Fix: "REVOKE ALL ... FROM public" doesn't block anon on this
-- project. Run in the Supabase SQL editor. Safe to re-run.
--
-- FOUND WHILE: consolidating address-release notifications
-- (consolidate_address_release_notification.sql). A new internal-only helper
-- there showed up in `get_advisors` as callable by the `anon` role despite
-- having no GRANT at all — investigating why led here.
--
-- ROOT CAUSE
-- This Supabase project grants EXECUTE on new public-schema functions to
-- anon/authenticated/service_role via schema-level default privileges — a
-- named-role grant, separate from the special PUBLIC pseudo-role. Confirmed
-- directly against pg_proc.proacl: "REVOKE ALL ... FROM public;" removes
-- only the PUBLIC pseudo-role's entry; the named anon/authenticated grants
-- survive untouched. So the established pattern used across this codebase —
--   REVOKE ALL ON FUNCTION public.foo() FROM public;
--   GRANT EXECUTE ON FUNCTION public.foo() TO authenticated;
-- — has never actually blocked anon. It reads as "authenticated only" but
-- has always also meant "anon too."
--
-- ACTUAL IMPACT (checked each function body before writing this)
-- None of the five affected functions are exploitable as a result — every
-- one independently guards on `auth.uid() IS NULL` (or, for
-- replace_provider_services, also verifies the target provider's user_id
-- matches auth.uid()) and fails safe: anon gets back a graceful
-- {"ok": false, "error": "not authenticated"} / a RAISE EXCEPTION, not the
-- action. This migration is a hardening fix (move that rejection to the
-- permission layer, matching intent, and remove needless anon attack
-- surface / probing ability) — not a live-vulnerability patch. Do not treat
-- "no exploit found" as license to skip this though: the NEXT function
-- written with this same copy-pasted pattern might not have that internal
-- guard, and whoever writes it will reasonably believe the REVOKE already
-- did its job.
--
-- Affected functions (all take no destructive path for anon, per above):
--   cancel_account_deletion()            — account_deletion_grace_period.sql
--   dev_reset_provider()                 — dev_reset_provider.sql
--   delete_client_profile()              — delete_account.sql
--   delete_provider_profile()            — delete_account.sql
--   replace_provider_services(uuid,jsonb) — replace_provider_services.sql
--
-- VERIFY
--   select proname, proacl from pg_proc
--   where pronamespace = 'public'::regnamespace
--     and proname in ('cancel_account_deletion','dev_reset_provider',
--                      'delete_client_profile','delete_provider_profile',
--                      'replace_provider_services');
--     → expect no "anon=X" entry in any proacl; "authenticated=X" still
--       present on every one.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.cancel_account_deletion() FROM anon;
REVOKE EXECUTE ON FUNCTION public.dev_reset_provider() FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_client_profile() FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_provider_profile() FROM anon;
REVOKE EXECUTE ON FUNCTION public.replace_provider_services(uuid, jsonb) FROM anon;
