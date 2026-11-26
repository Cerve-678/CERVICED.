-- A provider's own written Terms & Conditions, readable by a signed-out
-- visitor to their web page (cerviced.co/@handle).
--
-- On the web a visitor picks their time in the booking sheet before signing in
-- with an email code. The sheet reads the provider's terms to show them with an
-- "I agree" tick, but get_provider_terms was signed-in only, so for anon the
-- sheet showed no terms and prepare_checkout then refused the booking: the copy
-- the client saw didn't match the live written terms (user, 2026-11-23: "Let
-- visitors read them").
--
-- Only the EXECUTE grant changes. The function is unchanged (md5 guard): it
-- returns the terms form's title and policy text and nothing else, and no rows
-- for a provider who isn't live (has_gone_live and is_active). The table under
-- it stays owner-only, so the medical-history and patch-test forms beside the
-- terms are still nobody else's business.

BEGIN;

DO $$
BEGIN
  IF (SELECT md5(pg_get_functiondef('public.get_provider_terms(uuid)'::regprocedure)))
     <> '9700032904eb71572a5f2ecad1146ba5' THEN
    RAISE EXCEPTION 'get_provider_terms changed live since this migration was written';
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.get_provider_terms(uuid) TO anon;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261123220000', 'provider_terms_readable_signed_out')
ON CONFLICT (version) DO NOTHING;

COMMIT;
