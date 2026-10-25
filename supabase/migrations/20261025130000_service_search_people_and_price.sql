-- 20261025130000_service_search_people_and_price.sql
--
-- Second pass on service search, from what clients actually typed
-- (search_events): "male services", "mens haircut", "i am looking for
-- install", "makeup artists for £70". Supersedes the function bodies in
-- 20261025120000_service_search.sql, and is a complete copy of every search_*
-- function, so scripts/search-eval.sh can grade this file on its own.
--
-- Changes from 20261025120000:
--  * Who it's for: search_audience_words() gives a service the words people
--    use for men or kids ("male", "mens", "guys", "kids"...) when its audience
--    is set, or its name or menu heading says so ("Men's Hair", "Male
--    facial"). When the query names an audience, services not for it score
--    half, the same as for a named category.
--  * Conversational filler is ignored: "i am looking for", "i need", "near
--    me", "please", and the words service(s)/appointment/booking.
--  * Money is not a search word: "£70", "70 pounds" and "under/for £70" are
--    dropped from the words, and p_max_price (the app parses it) keeps only
--    services priced at or under it. A price range counts by its lower end.
--  * Role words count as their category: "artist" (MUA), "tech" (nails),
--    "stylist" / "braider" / "barber" (hair).
--  * search_services_ranked gains p_max_price, so the old 4-argument version
--    is dropped rather than left behind as a second overload.
--
-- Unchanged: gating (has_gone_live AND is_active), SECURITY INVOKER, public
-- columns only, bounded inputs. Graded by supabase/tests/service_search_eval.sql.

BEGIN;

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
  -- The loop is length(a) × length(b): refuse anything longer than a word.
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

CREATE OR REPLACE FUNCTION public.search_category_words(p_category text)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT CASE upper(coalesce(p_category, ''))
    WHEN 'NAILS'      THEN 'nails nail tech technician manicurist'
    WHEN 'HAIR'       THEN 'hair hairstyle hairstylist hairdresser stylist braider barber'
    WHEN 'LASHES'     THEN 'lashes lash eyelashes eyelash technician'
    WHEN 'BROWS'      THEN 'brows brow eyebrows eyebrow technician'
    WHEN 'MUA'        THEN 'makeup mua artist artists'
    WHEN 'AESTHETICS' THEN 'aesthetics aesthetic skin practitioner clinic'
    ELSE ''
  END;
$$;

CREATE OR REPLACE FUNCTION public.search_audience_words(p_audience text, p_heading text, p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  -- 58 of 60 live services had no audience set on 2026-10-25, so the name
  -- and menu heading count too: "Men's Hair", "Male facial", "Kids braids".
  SELECT concat_ws(' ',
    CASE WHEN lower(coalesce(p_audience, '')) = 'men'
           OR lower(concat_ws(' ', p_heading, p_name)) ~ '\m(men|mens|men''s|male|gents|gentlemen|barber|beard)\M'
         THEN 'men mens male man guys gents gentlemen' END,
    CASE WHEN lower(coalesce(p_audience, '')) = 'kids'
           OR lower(concat_ws(' ', p_heading, p_name)) ~ '\m(kids|kid|children|child|childrens|girls|boys|teen|teens)\M'
         THEN 'kids kid children child girls boys teen teens' END,
    CASE WHEN lower(coalesce(p_audience, '')) = 'women'
         THEN 'women womens ladies female' END
  );
$$;

CREATE OR REPLACE FUNCTION public.search_synonym_map()
RETURNS TABLE(trigger text, expansions text[])
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  -- trigger: whole word or phrase, lowercase, as search_rewrite_query outputs
  -- it. Only aliases a client would be happy to be shown, not "related" ideas.
  VALUES
    ('gel nails',          ARRAY['biab', 'builder gel', 'gel manicure']),
    ('biab',               ARRAY['builder gel', 'gel overlay']),
    ('builder gel',        ARRAY['biab', 'gel overlay']),
    ('nail extensions',    ARRAY['acrylic', 'full set']),
    ('dip powder',         ARRAY['sns', 'dip nails']),
    ('sns',                ARRAY['dip powder']),
    ('mani',               ARRAY['manicure']),
    ('pedi',               ARRAY['pedicure', 'feet']),
    ('pedicure',           ARRAY['feet', 'toe']),
    ('mani pedi',          ARRAY['hands feet', 'manicure', 'pedicure']),
    ('lvl',                ARRAY['lash lift']),
    ('lash lift',          ARRAY['lvl']),
    ('russian lashes',     ARRAY['russian volume', 'volume lashes']),
    ('eyelash extensions', ARRAY['lashes', 'lash extensions']),
    ('silk press',         ARRAY['dominican blowout', 'blow out']),
    ('dominican blowout',  ARRAY['silk press']),
    ('knotless',           ARRAY['knotless braids', 'box braids']),
    ('box braids',         ARRAY['braids', 'knotless']),
    ('cornrows',           ARRAY['braids', 'canerows']),
    ('wig install',        ARRAY['frontal', 'closure', 'wig fitting']),
    ('frontal',            ARRAY['wig install', 'closure']),
    ('weave',              ARRAY['sew in', 'hair extensions']),
    ('sew in',             ARRAY['weave']),
    ('hair extensions',    ARRAY['tape ins', 'tap ins', 'micro rings', 'nano rings', 'weave']),
    ('tape in',            ARRAY['tap ins', 'tape ins']),
    ('tape ins',           ARRAY['tap ins']),
    ('balayage',           ARRAY['highlights']),
    ('ombre',              ARRAY['balayage', 'colour melt']),
    ('highlights',         ARRAY['balayage', 'foils']),
    ('hair colour',        ARRAY['colour', 'highlights', 'balayage']),
    ('hair color',         ARRAY['colour', 'highlights', 'balayage']),
    ('dye',                ARRAY['colour']),
    ('haircut',            ARRAY['cut']),
    ('trim',               ARRAY['cut']),
    ('blowout',            ARRAY['blow dry']),
    ('blow out',           ARRAY['blow dry', 'blowout']),
    ('blow dry',           ARRAY['blowout']),
    ('microblading',       ARRAY['eyebrow tattoo', 'semi permanent brows']),
    ('hd brows',           ARRAY['brow lamination']),
    ('brow lamination',    ARRAY['hd brows', 'laminated brows']),
    ('botox',              ARRAY['anti wrinkle', 'injectables']),
    ('anti wrinkle',       ARRAY['botox']),
    ('filler',             ARRAY['dermal filler', 'lip filler']),
    ('hydrafacial',        ARRAY['facial']),
    ('spray tan',          ARRAY['tanning']),
    ('mua',                ARRAY['makeup', 'makeup artist']),
    ('makeup artist',      ARRAY['makeup']),
    ('wedding',            ARRAY['bridal', 'bride']),
    ('bride',              ARRAY['bridal', 'wedding']),
    ('bridal',             ARRAY['wedding']),
    ('prom',               ARRAY['special occasion', 'glam']),
    ('photoshoot',         ARRAY['editorial']),
    ('photo shoot',        ARRAY['editorial', 'photoshoot'])
$$;

CREATE OR REPLACE FUNCTION public.search_clean_query(p_query text)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
SET search_path = public, extensions, pg_temp
AS $$
  -- Lowercase, unaccented, without money ("under £70", "70 pounds") or the
  -- conversational filler around what the client actually wants.
  SELECT regexp_replace(
           regexp_replace(
             regexp_replace(
               lower(unaccent(left(coalesce(p_query, ''), 200))),
               '\m(under|below|less than|max|maximum|up to|upto|for|around|about|budget)?\s*(£|gbp\s*)\s*[0-9]+([.,][0-9]+)?|\m[0-9]+([.,][0-9]+)?\s*(pounds|quid|gbp)\M',
               ' ', 'g'),
             '\m(i am|i''m|im|i want|i would like|i''d like|id like|i need|can i get|can i book|could i get|looking for|searching for|search for|find me|show me|get me|near me|nearby|close to me|around me|please|someone who does|someone to do|anyone who does|who does|do you do|does anyone do)\M',
             ' ', 'g'),
           '\m(service|services|appointment|appointments|booking|bookings|book|a|an)\M',
           ' ', 'g');
$$;

CREATE OR REPLACE FUNCTION public.search_rewrite_query(p_query text)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  toks text[];
  n integer;
  freq jsonb;
  words text[];
  out_words text[] := '{}';
  i integer := 1;
  t text;
  joined text;
  best text;
  k integer;
  split_score integer;
  best_split_score integer;
  split_a text;
  split_b text;
BEGIN
  SELECT coalesce(array_agg(t0), '{}') INTO toks
  FROM (
    SELECT t0
    FROM regexp_split_to_table(public.search_clean_query(p_query), '[^a-z0-9]+') AS t0
    WHERE t0 <> '' AND length(t0) <= 40
    LIMIT 8
  ) first_words;
  n := coalesce(array_length(toks, 1), 0);
  IF n = 0 THEN RETURN toks; END IF;

  -- word -> how many live services use it
  SELECT coalesce(jsonb_object_agg(w, c), '{}'::jsonb), coalesce(array_agg(w), '{}')
  INTO freq, words
  FROM (
    SELECT w, count(*) AS c
    FROM (
      SELECT regexp_split_to_table(lower(unaccent(concat_ws(' ',
               s.name, s.category_name, s.description, s.category_description, p.display_name,
               public.search_category_words(coalesce(s.service_category, p.service_category)),
               array_to_string(
                 coalesce(s.tags, '{}') || coalesce(s.technique_tags, '{}') || coalesce(s.outcome_tags, '{}')
                 || coalesce(s.occasion_tags, '{}') || coalesce(s.trend_names, '{}'), ' ')
             ))), '[^a-z0-9]+') AS w
      FROM public.services s
      JOIN public.providers p ON p.id = s.provider_id
      WHERE p.has_gone_live = true AND p.is_active = true AND s.is_active = true
    ) all_words
    WHERE length(w) BETWEEN 3 AND 40
    GROUP BY w
  ) vocab;

  -- Role words ("braider", "tech") are words a client may type, so they count
  -- as known, but nobody books a "braider": never correct a typo INTO one, or
  -- "brades" would become "braider" instead of braids.
  words := ARRAY(
    SELECT w FROM unnest(words) w
    WHERE w <> ALL (ARRAY['tech', 'technician', 'manicurist', 'stylist', 'braider', 'barber',
                          'artist', 'artists', 'practitioner', 'clinic', 'hairdresser', 'hairstylist'])
  );

  WHILE i <= n LOOP
    t := toks[i];

    -- a. two words that are one word in the catalogue ("pony tail")
    IF i < n THEN
      joined := t || toks[i + 1];
      IF length(joined) >= 5 AND freq ? joined THEN
        out_words := out_words || joined;
        i := i + 2;
        CONTINUE;
      END IF;
    END IF;

    -- b. short, numeric, a real word, or the start of one: leave it alone
    IF length(t) < 4 OR t ~ '^[0-9]+$' OR freq ? t
       OR EXISTS (SELECT 1 FROM unnest(words) w WHERE w LIKE t || '%') THEN
      out_words := out_words || t;
      i := i + 1;
      CONTINUE;
    END IF;

    -- c. two real words run together ("blowdry", "nailart")
    best_split_score := 0;
    FOR k IN 3..(length(t) - 3) LOOP
      IF freq ? left(t, k) AND freq ? substr(t, k + 1) THEN
        split_score := (freq ->> left(t, k))::integer + (freq ->> substr(t, k + 1))::integer;
        IF split_score > best_split_score THEN
          best_split_score := split_score;
          split_a := left(t, k);
          split_b := substr(t, k + 1);
        END IF;
      END IF;
    END LOOP;
    IF best_split_score > 0 THEN
      out_words := out_words || split_a || split_b;
      i := i + 1;
      CONTINUE;
    END IF;

    -- d. the nearest real word. Fewest edits, then same first letter (people
    -- rarely mistype the first letter), then the commoner word, then
    -- alphabetical so the answer is stable.
    SELECT w INTO best
    FROM (
      SELECT w, public.search_edit_distance(t, w) AS d
      FROM unnest(words) w
      WHERE length(w) >= 4 AND abs(length(w) - length(t)) <= 2
    ) c
    WHERE d <= CASE
                 WHEN length(t) >= 6 THEN 2
                 WHEN length(t) = 5 AND left(w, 3) = left(t, 3) THEN 2
                 ELSE 1
               END
      -- Short words are too close to each other to also allow a wrong first
      -- letter: "brows" must not become "grows".
      AND (length(t) >= 6 OR left(w, 1) = left(t, 1))
    ORDER BY d, (left(w, 1) <> left(t, 1)), (freq ->> w)::integer DESC, w
    LIMIT 1;

    -- e. the word still being typed: a misspelt start of a real word
    IF best IS NULL AND i = n AND length(t) >= 5 THEN
      SELECT w INTO best
      FROM unnest(words) w
      WHERE length(w) > length(t)
        AND left(w, 1) = left(t, 1)
        AND public.search_edit_distance(t, left(w, length(t))) <= 1
      ORDER BY public.search_edit_distance(t, left(w, length(t))), (freq ->> w)::integer DESC, w
      LIMIT 1;
    END IF;

    out_words := out_words || coalesce(best, t);
    best := NULL;
    i := i + 1;
  END LOOP;

  RETURN out_words;
END;
$$;

-- The 4-argument version from 20261025120000; replaced by the one below.
DROP FUNCTION IF EXISTS public.search_services_ranked(text, text, text[], integer);

CREATE OR REPLACE FUNCTION public.search_services_ranked(
  p_query text,
  p_category text DEFAULT NULL,
  p_locations text[] DEFAULT '{}'::text[],
  p_limit integer DEFAULT 60,
  p_max_price numeric DEFAULT NULL
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
  WITH rewritten AS (
    SELECT public.search_rewrite_query(p_query) AS w
  ),
  original AS (
    SELECT coalesce(array_agg(t), '{}') AS w
    FROM (
      SELECT t
      FROM regexp_split_to_table(public.search_clean_query(p_query), '[^a-z0-9]+') AS t
      WHERE t <> '' AND length(t) <= 40
      LIMIT 8
    ) x
  ),
  qwords AS (
    -- Stopwords ("the", "for") come back as an empty query and are dropped, so
    -- they don't count against how much of the query a service matched.
    SELECT word, q_stem,
           -- 'simple' keeps the typed letters: "acry" stems to "acri", which
           -- starts nothing; unstemmed "acry" starts "acryl".
           CASE WHEN length(word) >= 3 THEN to_tsquery('simple', word || ':*') END AS q_prefix,
           CASE WHEN length(word) >= 5 THEN word END AS inner_word
    FROM (
      SELECT DISTINCT word, to_tsquery('english', word) AS q_stem
      FROM unnest((SELECT w FROM rewritten)) AS word
      WHERE length(word) >= 2
    ) x
    WHERE numnode(q_stem) > 0
  ),
  nwords AS (SELECT count(*)::real AS n FROM qwords),
  phrase AS (
    SELECT CASE WHEN (SELECT n FROM nwords) >= 2
                THEN phraseto_tsquery('english', array_to_string((SELECT w FROM rewritten), ' '))
           END AS q
  ),
  syn AS (
    SELECT DISTINCT phraseto_tsquery('english', e) AS q
    FROM public.search_synonym_map() m
    CROSS JOIN LATERAL unnest(m.expansions) AS e
    WHERE ' ' || array_to_string((SELECT w FROM rewritten), ' ') || ' ' LIKE '% ' || m.trigger || ' %'
  ),
  named_audience AS (
    -- Who the query says it's for ("male", "mens", "kids").
    SELECT a AS audience
    FROM unnest(ARRAY['men', 'kids', 'women']) AS a
    WHERE EXISTS (
      SELECT 1 FROM qwords qw
      WHERE to_tsvector('english', public.search_audience_words(a, NULL, NULL)) @@ qw.q_stem
    )
  ),
  named AS (
    -- Categories the query names outright ("eyelash", "makeup", "nails").
    SELECT c AS category
    FROM unnest(ARRAY['NAILS', 'HAIR', 'LASHES', 'BROWS', 'MUA', 'AESTHETICS']) AS c
    WHERE EXISTS (
      SELECT 1 FROM qwords qw
      WHERE to_tsvector('english', public.search_category_words(c)) @@ qw.q_stem
    )
  ),
  live AS (
    SELECT
      s.id, s.provider_id, s.name, s.description, s.category_name,
      coalesce(s.service_category, p.service_category) AS category,
      s.price, s.price_max, s.duration_minutes, s.sort_order,
      p.slug, p.display_name, p.logo_url, p.location_text, p.booking_mode, p.is_featured, p.rating,
      lower(unaccent(coalesce(s.name, ''))) AS name_t,
      lower(unaccent(concat_ws(' ', s.category_name, array_to_string(
        coalesce(s.tags, '{}') || coalesce(s.technique_tags, '{}') || coalesce(s.outcome_tags, '{}')
        || coalesce(s.occasion_tags, '{}') || coalesce(s.trend_names, '{}'), ' ')))) AS tag_t,
      lower(unaccent(concat_ws(' ', s.description, s.category_description))) AS desc_t,
      public.search_category_words(coalesce(s.service_category, p.service_category)) || ' '
        || public.search_audience_words(s.audience, s.category_name, s.name) AS cat_t,
      public.search_audience_words(s.audience, s.category_name, s.name) AS audience_t,
      lower(unaccent(coalesce(p.display_name, ''))) AS prov_t
    FROM public.services s
    JOIN public.providers p ON p.id = s.provider_id
    WHERE p.has_gone_live = true
      AND p.is_active = true
      AND s.is_active = true
      AND (p_category IS NULL OR p_category = 'ALL'
           OR coalesce(s.service_category, p.service_category) = p_category)
      AND (p_max_price IS NULL OR s.price IS NULL OR s.price <= p_max_price)
      AND (coalesce(array_length(p_locations, 1), 0) = 0
           OR p.location_text ILIKE ANY (
             SELECT '%' || l || '%' FROM unnest(p_locations[1:5]) AS l WHERE l <> ''
           ))
  ),
  vec AS (
    SELECT live.*,
           to_tsvector('english', name_t) AS name_v,
           to_tsvector('english', tag_t)  AS tag_v,
           to_tsvector('english', cat_t)  AS cat_v,
           to_tsvector('english', desc_t) AS desc_v,
           to_tsvector('english', prov_t) AS prov_v
    FROM live
  ),
  per_word AS (
    -- Each query word's best field in each service.
    SELECT v.id,
           max(CASE
             WHEN v.name_v @@ qw.q_stem OR v.name_v @@ qw.q_prefix
                  OR position(qw.inner_word IN v.name_t) > 0 THEN 1.0
             WHEN v.tag_v @@ qw.q_stem OR v.tag_v @@ qw.q_prefix
                  OR position(qw.inner_word IN v.tag_t) > 0 THEN 0.75
             WHEN v.cat_v @@ qw.q_stem OR v.cat_v @@ qw.q_prefix THEN 0.6
             WHEN v.desc_v @@ qw.q_stem OR v.desc_v @@ qw.q_prefix
                  OR position(qw.inner_word IN v.desc_t) > 0 THEN 0.5
             WHEN v.prov_v @@ qw.q_stem OR v.prov_v @@ qw.q_prefix THEN 0.35
             ELSE 0 END) AS level,
           qw.word
    FROM vec v CROSS JOIN qwords qw
    GROUP BY v.id, qw.word
  ),
  scored AS (
    SELECT
      v.*,
      coalesce((SELECT sum(pw.level) FROM per_word pw WHERE pw.id = v.id), 0) AS word_score,
      coalesce((SELECT count(*) FROM per_word pw WHERE pw.id = v.id AND pw.level > 0), 0) AS matched,
      (SELECT coalesce(max(
                CASE WHEN v.name_v @@ sy.q THEN 0.9
                     WHEN v.tag_v  @@ sy.q THEN 0.7
                     WHEN v.desc_v @@ sy.q THEN 0.45
                     ELSE 0 END), 0)
       FROM syn sy) AS syn_score,
      CASE WHEN (SELECT q FROM phrase) IS NOT NULL
                AND (v.name_v @@ (SELECT q FROM phrase) OR v.tag_v @@ (SELECT q FROM phrase)
                     OR v.desc_v @@ (SELECT q FROM phrase))
           THEN 0.1 ELSE 0 END AS phrase_bonus,
      CASE WHEN EXISTS (SELECT 1 FROM named) AND v.category NOT IN (SELECT category FROM named)
           THEN 0.5 ELSE 1 END
      * CASE WHEN EXISTS (SELECT 1 FROM named_audience)
                  AND NOT EXISTS (
                    SELECT 1 FROM named_audience na
                    WHERE to_tsvector('english', v.audience_t)
                          @@ to_tsquery('english', na.audience))
             THEN 0.5 ELSE 1 END AS category_factor,
      word_similarity(array_to_string((SELECT w FROM rewritten), ' '), v.name_t || ' ' || v.tag_t) AS looks_like
    FROM vec v
  ),
  candidates AS (
    SELECT
      sc.*,
      CASE WHEN (nw.n > 0 AND sc.matched * 2 >= nw.n AND sc.word_score > 0) OR sc.syn_score > 0
           THEN (greatest(CASE WHEN nw.n > 0 THEN sc.word_score / nw.n ELSE 0 END, sc.syn_score)
                 + sc.phrase_bonus) * sc.category_factor
           -- Nothing matched properly: fall back to names that LOOK like the
           -- query, scored low so they never outrank a real match.
           WHEN sc.looks_like >= 0.6 AND length(array_to_string((SELECT w FROM rewritten), ' ')) >= 5
           THEN 0.3 * sc.looks_like
      END AS score,
      (nw.n > 0 AND sc.matched * 2 >= nw.n AND sc.word_score > 0) OR sc.syn_score > 0 AS strict
    FROM scored sc, nwords nw
  ),
  ranked AS (
    SELECT c.*,
           row_number() OVER (PARTITION BY c.provider_id ORDER BY c.score DESC, c.sort_order NULLS LAST) AS per_provider,
           bool_or(c.strict) OVER () AS any_strict,
           max(c.score) OVER () AS best
    FROM candidates c
    WHERE c.score IS NOT NULL
  )
  SELECT
    r.id, r.provider_id, r.slug, r.display_name, r.logo_url, r.location_text, r.booking_mode,
    r.name, r.description, r.category_name, r.category,
    r.price, r.price_max, r.duration_minutes,
    r.score::real,
    CASE WHEN (SELECT w FROM rewritten) IS DISTINCT FROM (SELECT w FROM original)
         THEN array_to_string((SELECT w FROM rewritten), ' ') END
  FROM ranked r
  WHERE r.per_provider <= 3
    -- the fallback only when nothing matched properly
    AND (r.strict OR NOT r.any_strict)
    -- A weak side-match ("volume" in a lip filler's description, for
    -- "volume lashes") shouldn't sit in the list beside real answers.
    AND r.score >= 0.4 * r.best
  ORDER BY r.score DESC, r.is_featured DESC NULLS LAST, r.rating DESC NULLS LAST, r.sort_order NULLS LAST
  LIMIT least(greatest(p_limit, 1), 200);
$$;

GRANT EXECUTE ON FUNCTION public.search_edit_distance(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_category_words(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_audience_words(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_clean_query(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_synonym_map() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_rewrite_query(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_services_ranked(text, text, text[], integer, numeric) TO anon, authenticated;

-- Record this file's own version, so a CLI `db query -f` apply matches the
-- file name instead of being stamped with the wall clock.
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261025130000', 'service_search_people_and_price')
ON CONFLICT (version) DO NOTHING;

COMMIT;
