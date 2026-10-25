-- 20261025120000_service_search.sql
--
-- Search for SERVICES, not just providers, and understand what the client
-- meant when they misspelled it ("frsnch" -> French tips, "lahses" -> lashes).
--
-- Three functions, all additive (nothing existing is redefined):
--
-- 1. search_edit_distance(a, b) — Damerau (optimal string alignment) edit
--    distance: insert, delete, substitute, and swapping two neighbouring
--    letters each count as one edit. Trigram similarity alone was tried first
--    and is too weak on short words ("lahses" vs "lashes" scores 0.27), which
--    is why search_providers_ranked's fuzzy branch misses most typos.
--
-- 2. search_query_corrections(p_query) — for each query word that is not a
--    word (or the start of a word) anywhere in live services, the nearest real
--    word within 1 edit (4–5 letters) or 2 edits (6+ letters). Words under 4
--    letters are never corrected: too many real words are one edit apart.
--    Vocabulary = live services' names, menu headings, descriptions, tags and
--    the business's name, so a correction can only ever point at something a
--    bookable provider actually offers.
--
-- 3. search_services_ranked(...) — individual services, ranked. Per query word
--    (after correction), the best field it matches scores: service name 1.0,
--    menu heading / tags / category 0.75, description 0.5, business name 0.35.
--    Rank = average over the query's words, so a service matching more of what
--    was typed ranks higher; at least half the words must match something.
--    p_synonyms ("gel nails" -> biab) are whole-phrase alternatives scored the
--    same way. At most 3 services per provider, so one business with ten
--    French variations can't fill the whole list, and nothing scoring under
--    40% of the best result (a weak side-match). Also returns the corrected
--    query (null when nothing was corrected) so the app can say
--    "Showing results for french".
--
-- Gating: has_gone_live = true AND is_active = true on the provider, is_active
-- on the service — same as every client-facing provider query. SECURITY
-- INVOKER, so table RLS still applies. Returns only columns the public
-- provider profile already shows (no address, nothing private).
--
-- Scale follow-up (not needed at launch volume, ~60 live services): the
-- vocabulary and per-service tsvectors are computed inline per call — one scan
-- of live services. When that stops being cheap, materialise a
-- search_vocabulary(word, freq) table with a trigram GIN index (maintained by
-- trigger on services/providers) and per-field tsvector columns; the function
-- signatures and the app stay the same.

CREATE OR REPLACE FUNCTION public.search_edit_distance(a text, b text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE STRICT PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
DECLARE
  la integer := length(a);
  lb integer := length(b);
  prev2 integer[];
  prev integer[];
  cur integer[];
  i integer;
  j integer;
  cost integer;
  v integer;
BEGIN
  IF a = b THEN RETURN 0; END IF;
  IF la = 0 THEN RETURN lb; END IF;
  IF lb = 0 THEN RETURN la; END IF;
  -- Callable by anyone (functions are PUBLIC-executable), and the loop is
  -- length(a) × length(b): refuse to spend CPU on anything longer than a word.
  IF la > 40 OR lb > 40 THEN RETURN greatest(la, lb); END IF;
  -- Row k of the DP table lives at array index k+1 (column j at index j+1).
  prev := ARRAY(SELECT generate_series(0, lb));
  FOR i IN 1..la LOOP
    cur := array_fill(0, ARRAY[lb + 1]);
    cur[1] := i;
    FOR j IN 1..lb LOOP
      cost := CASE WHEN substr(a, i, 1) = substr(b, j, 1) THEN 0 ELSE 1 END;
      v := least(prev[j + 1] + 1, cur[j] + 1, prev[j] + cost);
      IF i > 1 AND j > 1
         AND substr(a, i, 1) = substr(b, j - 1, 1)
         AND substr(a, i - 1, 1) = substr(b, j, 1) THEN
        v := least(v, prev2[j - 1] + 1);
      END IF;
      cur[j + 1] := v;
    END LOOP;
    prev2 := prev;
    prev := cur;
  END LOOP;
  RETURN prev[lb + 1];
END;
$$;

CREATE OR REPLACE FUNCTION public.search_query_corrections(p_query text)
RETURNS TABLE(original text, corrected text)
LANGUAGE sql
STABLE
SET search_path = public, extensions, pg_temp
AS $$
  WITH toks AS (
    -- Bounded work per call: the first 200 characters, at most 8 words, each
    -- word at most 40 letters (a search box, not a document).
    SELECT DISTINCT tok
    FROM (
      SELECT t AS tok
      FROM regexp_split_to_table(lower(unaccent(left(coalesce(p_query, ''), 200))), '[^a-z0-9]+') AS t
      WHERE length(t) BETWEEN 4 AND 40 AND t !~ '^[0-9]+$'
      LIMIT 8
    ) first_words
  ),
  vocab AS (
    SELECT w, count(*) AS freq
    FROM (
      SELECT regexp_split_to_table(lower(unaccent(concat_ws(' ',
               s.name, s.category_name, s.description, s.service_category, p.display_name,
               array_to_string(
                 coalesce(s.tags, '{}') || coalesce(s.technique_tags, '{}') || coalesce(s.outcome_tags, '{}')
                 || coalesce(s.occasion_tags, '{}') || coalesce(s.trend_names, '{}'), ' ')
             ))), '[^a-z0-9]+') AS w
      FROM public.services s
      JOIN public.providers p ON p.id = s.provider_id
      WHERE p.has_gone_live = true AND p.is_active = true AND s.is_active = true
    ) words
    WHERE length(w) >= 3
    GROUP BY w
  ),
  unknown AS (
    -- A word that starts a real word ("fren" while still typing "french") is
    -- not a typo; leave it for the prefix match.
    SELECT tok FROM toks
    WHERE NOT EXISTS (SELECT 1 FROM vocab WHERE vocab.w LIKE toks.tok || '%')
  )
  -- One best candidate per word: fewest edits, then same first letter (people
  -- rarely mistype the first letter), then the word more services use, then
  -- alphabetical so the answer is stable.
  SELECT DISTINCT ON (u.tok) u.tok, c.w
  FROM unknown u
  CROSS JOIN LATERAL (
    SELECT v.w, v.freq, public.search_edit_distance(u.tok, v.w) AS d
    FROM vocab v
    WHERE abs(length(v.w) - length(u.tok)) <= CASE WHEN length(u.tok) >= 6 THEN 2 ELSE 1 END
  ) AS c
  WHERE c.d <= CASE WHEN length(u.tok) >= 6 THEN 2 ELSE 1 END
  ORDER BY u.tok, c.d, (left(c.w, 1) <> left(u.tok, 1)), c.freq DESC, c.w;
$$;

CREATE OR REPLACE FUNCTION public.search_services_ranked(
  p_query text,
  p_category text DEFAULT NULL,
  p_locations text[] DEFAULT '{}'::text[],
  p_synonyms text[] DEFAULT '{}'::text[],
  p_limit integer DEFAULT 60
)
RETURNS TABLE(
  service_id uuid,
  provider_id uuid,
  provider_slug text,
  provider_name text,
  provider_logo_url text,
  provider_location text,
  booking_mode text,
  service_name text,
  service_description text,
  menu_heading text,
  service_category text,
  price numeric,
  price_max numeric,
  duration_minutes integer,
  rank real,
  corrected_query text
)
LANGUAGE sql
STABLE
SET search_path = public, extensions, pg_temp
AS $$
  WITH fixes AS (
    SELECT original, corrected FROM public.search_query_corrections(p_query)
  ),
  words AS (
    -- Same bounds as search_query_corrections: 200 characters, 8 words.
    SELECT DISTINCT coalesce(f.corrected, w.t) AS word
    FROM (
      SELECT t
      FROM regexp_split_to_table(lower(unaccent(left(coalesce(p_query, ''), 200))), '[^a-z0-9]+') AS t
      WHERE length(t) BETWEEN 2 AND 40
      LIMIT 8
    ) w
    LEFT JOIN fixes f ON f.original = w.t
  ),
  qwords AS (
    -- Prefix-match words of 3+ letters so results appear while still typing.
    -- Stopwords ("the", "for") come back as an empty query and are dropped, so
    -- they don't count against how much of the query a service matched.
    SELECT word, q
    FROM (
      SELECT word,
             to_tsquery('english', CASE WHEN length(word) >= 3 THEN word || ':*' ELSE word END) AS q
      FROM words
    ) x
    WHERE numnode(q) > 0
  ),
  nwords AS (SELECT count(*)::real AS n FROM qwords),
  syn AS (
    SELECT phraseto_tsquery('english', unaccent(s)) AS q
    FROM unnest(coalesce(p_synonyms[1:20], '{}'::text[])) AS s
    WHERE length(s) <= 60 AND numnode(phraseto_tsquery('english', unaccent(s))) > 0
  ),
  corrected AS (
    SELECT CASE WHEN EXISTS (SELECT 1 FROM fixes)
      THEN (
        SELECT string_agg(coalesce(f.corrected, t), ' ' ORDER BY ord)
        FROM regexp_split_to_table(lower(unaccent(left(coalesce(p_query, ''), 200))), '[^a-z0-9]+') WITH ORDINALITY AS r(t, ord)
        LEFT JOIN fixes f ON f.original = r.t
        WHERE r.t <> ''
      )
    END AS text
  ),
  live AS (
    SELECT
      s.id, s.provider_id, s.name, s.description, s.category_name, s.service_category,
      s.price, s.price_max, s.duration_minutes, s.sort_order,
      p.slug, p.display_name, p.logo_url, p.location_text, p.booking_mode, p.is_featured, p.rating,
      to_tsvector('english', unaccent(coalesce(s.name, ''))) AS name_v,
      to_tsvector('english', unaccent(concat_ws(' ',
        s.category_name, s.service_category,
        array_to_string(
          coalesce(s.tags, '{}') || coalesce(s.technique_tags, '{}') || coalesce(s.outcome_tags, '{}')
          || coalesce(s.occasion_tags, '{}') || coalesce(s.trend_names, '{}'), ' ')
      ))) AS tag_v,
      to_tsvector('english', unaccent(concat_ws(' ', s.description, s.category_description))) AS desc_v,
      to_tsvector('english', unaccent(coalesce(p.display_name, ''))) AS prov_v
    FROM public.services s
    JOIN public.providers p ON p.id = s.provider_id
    WHERE p.has_gone_live = true
      AND p.is_active = true
      AND s.is_active = true
      AND (p_category IS NULL OR p_category = 'ALL'
           OR coalesce(s.service_category, p.service_category) = p_category)
      AND (coalesce(array_length(p_locations, 1), 0) = 0
           OR p.location_text ILIKE ANY (
             SELECT '%' || l || '%' FROM unnest(p_locations[1:5]) AS l WHERE l <> ''
           ))
  ),
  scored AS (
    SELECT
      live.*,
      (SELECT coalesce(sum(
                CASE WHEN live.name_v @@ qw.q THEN 1.0
                     WHEN live.tag_v  @@ qw.q THEN 0.75
                     WHEN live.desc_v @@ qw.q THEN 0.5
                     WHEN live.prov_v @@ qw.q THEN 0.35
                     ELSE 0 END), 0)
       FROM qwords qw) AS word_score,
      (SELECT count(*) FROM qwords qw
       WHERE live.name_v @@ qw.q OR live.tag_v @@ qw.q
          OR live.desc_v @@ qw.q OR live.prov_v @@ qw.q) AS matched,
      (SELECT coalesce(max(
                CASE WHEN live.name_v @@ sy.q THEN 0.9
                     WHEN live.tag_v  @@ sy.q THEN 0.7
                     WHEN live.desc_v @@ sy.q THEN 0.45
                     ELSE 0 END), 0)
       FROM syn sy) AS syn_score
    FROM live
  ),
  ranked AS (
    SELECT
      scored.*,
      greatest(
        CASE WHEN nw.n > 0 THEN scored.word_score / nw.n ELSE 0 END,
        scored.syn_score
      ) AS score,
      row_number() OVER (
        PARTITION BY scored.provider_id
        ORDER BY greatest(CASE WHEN nw.n > 0 THEN scored.word_score / nw.n ELSE 0 END, scored.syn_score) DESC,
                 scored.sort_order NULLS LAST
      ) AS per_provider
    FROM scored, nwords nw
    WHERE (nw.n > 0 AND scored.matched * 2 >= nw.n AND scored.word_score > 0)
       OR scored.syn_score > 0
  )
  SELECT
    r.id, r.provider_id, r.slug, r.display_name, r.logo_url, r.location_text, r.booking_mode,
    r.name, r.description, r.category_name, r.service_category,
    r.price, r.price_max, r.duration_minutes,
    r.score::real,
    (SELECT text FROM corrected)
  FROM ranked r
  WHERE r.per_provider <= 3
    -- A weak side-match ("volume" in a lip filler's description, for
    -- "volume lashes") shouldn't sit in the list beside real answers: keep
    -- only results within reach of the best one.
    AND r.score >= 0.4 * (SELECT max(score) FROM ranked)
  ORDER BY r.score DESC, r.is_featured DESC NULLS LAST, r.rating DESC NULLS LAST, r.sort_order NULLS LAST
  LIMIT least(greatest(p_limit, 1), 200);
$$;

GRANT EXECUTE ON FUNCTION public.search_edit_distance(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_query_corrections(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_services_ranked(text, text, text[], text[], integer) TO anon, authenticated;
