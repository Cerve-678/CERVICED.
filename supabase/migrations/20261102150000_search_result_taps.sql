-- 20261102150000_search_result_taps.sql
--
-- Search learns which result people actually wanted. When a signed-in client
-- taps a provider or service after searching, we keep (search, what they
-- tapped). search_services_ranked (20261102150100) then lifts what several
-- different people chose for the same search, and can surface a service for a
-- search it doesn't literally match once enough people have linked the two:
-- "infills" with no hit, then "acrylic" and a tap, teaches that people who
-- say "infills" want that service.
--
-- What is kept, and for how long:
--  * the search as the ranking reads it (search_rewrite_query, so "acrilic"
--    and "acrylic" are one key), the provider, the service if one was tapped,
--    the day, and the account — the account only so one person counts once
--    and can't flood it. Nothing here is ever readable by the app: rows are
--    reachable only through record_search_tap (write) and
--    private.search_learned_boosts (counts of 3+ different people, no ids,
--    and not callable through the API).
--  * deleted with the account, the provider or the service, and after 180
--    days by a daily job.
--
-- Abuse: the RPC can't prove the search ran or the result was shown, so
-- writing a row is cheap and reading one back is what's guarded. A provider
-- tapping their own listing is ignored; a person counts once per search,
-- result and day; 60 taps a day per person at most; and only accounts with a
-- confirmed email, at least 7 days old, count towards the 3+ at all.

BEGIN;

-- Not exposed by the Data API (only public and graphql_public are), so what's
-- in here can be used by search_services_ranked but not queried directly.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO anon, authenticated;

CREATE TABLE public.search_result_taps (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  query_key text NOT NULL CHECK (length(query_key) BETWEEN 1 AND 200),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.services(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- The tap answered an EARLIER search in the same sitting that the client
  -- gave up on and reworded, rather than the search on screen.
  via_earlier_search boolean NOT NULL DEFAULT false,
  tapped_on date NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/London')::date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX search_result_taps_once_a_day
  ON public.search_result_taps (user_id, query_key, provider_id,
                                coalesce(service_id, '00000000-0000-0000-0000-000000000000'::uuid), tapped_on);
CREATE INDEX search_result_taps_by_query ON public.search_result_taps (query_key);
CREATE INDEX search_result_taps_by_age ON public.search_result_taps (created_at);

ALTER TABLE public.search_result_taps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.search_result_taps FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_search_tap(
  p_query text,
  p_provider_id uuid,
  p_service_id uuid DEFAULT NULL,
  p_earlier_queries text[] DEFAULT '{}'::text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_key text;
  v_earlier text;
  v_earlier_key text;
BEGIN
  IF v_uid IS NULL OR p_provider_id IS NULL THEN RETURN; END IF;

  -- Only a live provider, and only their own active service.
  IF NOT EXISTS (
    SELECT 1 FROM public.providers p
     WHERE p.id = p_provider_id AND p.has_gone_live AND p.is_active
       AND p.user_id IS DISTINCT FROM v_uid  -- your own listing teaches nothing
  ) THEN RETURN; END IF;
  IF p_service_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.services s
     WHERE s.id = p_service_id AND s.provider_id = p_provider_id AND s.is_active
  ) THEN RETURN; END IF;

  IF (SELECT count(*) FROM public.search_result_taps t
       WHERE t.user_id = v_uid AND t.created_at > now() - interval '1 day') >= 60 THEN
    RETURN;
  END IF;

  v_key := left(array_to_string(public.search_rewrite_query(left(p_query, 200)), ' '), 200);
  IF coalesce(v_key, '') = '' THEN RETURN; END IF;

  INSERT INTO public.search_result_taps (query_key, provider_id, service_id, user_id)
  VALUES (v_key, p_provider_id, p_service_id, v_uid)
  ON CONFLICT DO NOTHING;

  -- At most two earlier, reworded searches from the same sitting.
  FOR v_earlier IN
    SELECT DISTINCT e FROM unnest((coalesce(p_earlier_queries, '{}'))[1:2]) e
     WHERE coalesce(trim(e), '') <> ''
  LOOP
    v_earlier_key := left(array_to_string(public.search_rewrite_query(left(v_earlier, 200)), ' '), 200);
    CONTINUE WHEN coalesce(v_earlier_key, '') = '' OR v_earlier_key = v_key;
    INSERT INTO public.search_result_taps (query_key, provider_id, service_id, user_id, via_earlier_search)
    VALUES (v_earlier_key, p_provider_id, p_service_id, v_uid, true)
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.record_search_tap(text, uuid, uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_search_tap(text, uuid, uuid, text[]) TO authenticated;

-- The Privacy Policy says 180 days, so it has to hold when nobody is tapping.
SELECT cron.schedule(
  'purge-search-result-taps',
  '23 4 * * *',
  $$ DELETE FROM public.search_result_taps WHERE created_at < now() - interval '180 days' $$
);

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261102150000', 'search_result_taps')
ON CONFLICT (version) DO NOTHING;

COMMIT;
