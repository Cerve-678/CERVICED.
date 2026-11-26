-- 20261109240000_drop_people_name_search.sql
--
-- Contacts only (decided 2026-11-09): you can find people only through your
-- phone contacts (match_contact_hashes), never by typing a name. The app no
-- longer has a name search box, so the server's name search goes too.
-- Otherwise anyone signed in could still call it directly and list members
-- by name.
--
-- Drops public.search_people(text, integer) from
-- 20261108220000_follow_people_and_recommend.sql. Nothing else calls it.
-- Leftover 'people_search' rows in the rate-limit table are harmless and
-- age out like any other budget.

BEGIN;

DROP FUNCTION IF EXISTS public.search_people(text, integer);

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261109240000', 'drop_people_name_search')
ON CONFLICT (version) DO NOTHING;

COMMIT;
