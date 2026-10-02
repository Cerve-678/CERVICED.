-- Ranked, fuzzy, tag-aware provider search.
--
-- Replaces the old substring-union search (three `ilike '%term%'` lookups
-- unioned into an UNORDERED id set, then re-sorted by is_featured/rating —
-- i.e. relevance was thrown away). This RPC returns provider ids already
-- ordered by how well they match, combining:
--
--   • Weighted full-text relevance: provider name + chosen specialities = A,
--     service names + every service tag = B, bios/descriptions = C. So a
--     provider whose service IS "Dominican Blowout" outranks one who merely
--     mentions "blow dry" in their bio.
--   • Synonym OR-expansion: the app passes alias terms (p_synonyms) so
--     "gel nails" also finds "BIAB", "LVL" finds "lash lift", etc. This also
--     quietly recovers many typos.
--   • Trigram fuzzy fallback (pg_trgm word_similarity): "balyage" still finds
--     balayage even with no synonym, and misspelt locations still match.
--   • Personalization: the app passes the signed-in client's learned top tags
--     (p_boost_tags, from userLearningService); matching providers get a small
--     rank boost so the same query leans toward what this client likes.
--
-- SECURITY INVOKER + explicit has_gone_live/is_active gate: the function reads
-- only publicly-listed providers, under the caller's own RLS (anon or auth),
-- the same visibility rule every client-facing provider query in
-- databaseService.ts follows.
--
-- SCALE FOLLOW-UP (deliberately NOT in v1): this computes each provider's
-- weighted tsvector inline per query, i.e. one seq scan over live providers.
-- That is fine at launch scale and keeps v1 trigger-free and verifiable. When
-- the provider count grows, materialize it: add `providers.search_doc tsvector`
-- maintained by BEFORE UPDATE OF (name/bio) on providers + AFTER triggers on
-- services/provider_specialties that recompute the owning provider, add a GIN
-- index on it, and change the CTE below to read the stored column. The RPC's
-- signature and the app stay identical across that change.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.search_providers_ranked(
  p_query      text,
  p_category   text   DEFAULT NULL,
  p_location   text   DEFAULT NULL,
  p_synonyms   text[] DEFAULT '{}',
  p_boost_tags text[] DEFAULT '{}',
  p_limit      int    DEFAULT 200
)
RETURNS TABLE (provider_id uuid, rank real)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  WITH qb AS (
    SELECT
      -- Main query OR'd with any synonym terms the app expanded.
      websearch_to_tsquery('english', unaccent(
        coalesce(nullif(trim(p_query), ''), ' ')
        || CASE WHEN coalesce(array_length(p_synonyms, 1), 0) > 0
                THEN ' OR ' || array_to_string(p_synonyms, ' OR ')
                ELSE '' END
      )) AS tsq,
      CASE WHEN coalesce(array_length(p_boost_tags, 1), 0) > 0
           THEN websearch_to_tsquery('english', unaccent(array_to_string(p_boost_tags, ' OR ')))
           ELSE NULL END AS btsq,
      lower(unaccent(coalesce(p_query, ''))) AS qnorm
  ),
  prov AS (
    SELECT
      p.id,
      p.is_featured,
      p.rating,
      p.location_text,
      -- Weighted search document (A > B > C).
      ( setweight(to_tsvector('english', unaccent(coalesce(p.display_name, ''))), 'A')
      || setweight(to_tsvector('english', unaccent(coalesce(string_agg(DISTINCT ps.specialty, ' '), ''))), 'A')
      || setweight(to_tsvector('english', unaccent(coalesce(string_agg(DISTINCT s.name, ' '), ''))), 'B')
      || setweight(to_tsvector('english', unaccent(coalesce(string_agg(DISTINCT array_to_string(
             coalesce(s.tags, '{}') || coalesce(s.technique_tags, '{}') || coalesce(s.outcome_tags, '{}')
             || coalesce(s.occasion_tags, '{}') || coalesce(s.trend_names, '{}'), ' '), ' '), ''))), 'B')
      || setweight(to_tsvector('english', unaccent(coalesce(p.about_text, '') || ' '
             || coalesce(string_agg(DISTINCT s.description, ' '), ''))), 'C')
      ) AS doc,
      -- Plain concatenated terms for the trigram fuzzy fallback (NOT service
      -- descriptions — too long/noisy; names, specialities and tags only).
      lower(unaccent(
        coalesce(p.display_name, '') || ' '
        || coalesce(string_agg(DISTINCT ps.specialty, ' '), '') || ' '
        || coalesce(string_agg(DISTINCT s.name, ' '), '') || ' '
        || coalesce(string_agg(DISTINCT array_to_string(
             coalesce(s.tags, '{}') || coalesce(s.technique_tags, '{}') || coalesce(s.outcome_tags, '{}')
             || coalesce(s.occasion_tags, '{}') || coalesce(s.trend_names, '{}'), ' '), ' '), '')
      )) AS terms
    FROM public.providers p
    LEFT JOIN public.services s           ON s.provider_id = p.id AND s.is_active = true
    LEFT JOIN public.provider_specialties ps ON ps.provider_id = p.id
    WHERE p.has_gone_live = true
      AND p.is_active = true
      AND (p_category IS NULL OR p_category = 'ALL'
           OR p.service_category = p_category
           OR p_category = ANY(coalesce(p.service_categories, '{}')))
    GROUP BY p.id
  )
  SELECT
    prov.id AS provider_id,
    ( ts_rank(prov.doc, qb.tsq)
      + 0.4  * word_similarity(qb.qnorm, prov.terms)
      + 0.15 * coalesce(ts_rank(prov.doc, qb.btsq), 0)
    )::real AS rank
  FROM prov, qb
  WHERE (prov.doc @@ qb.tsq OR word_similarity(qb.qnorm, prov.terms) > 0.5)
    AND (p_location IS NULL OR p_location = ''
         OR prov.location_text ILIKE '%' || p_location || '%'
         OR word_similarity(lower(p_location), lower(coalesce(prov.location_text, ''))) > 0.5)
  ORDER BY rank DESC, prov.is_featured DESC NULLS LAST, prov.rating DESC NULLS LAST
  LIMIT greatest(p_limit, 1);
$$;

COMMENT ON FUNCTION public.search_providers_ranked(text, text, text, text[], text[], int)
  IS 'Ranked/fuzzy/tag-aware provider search. Returns provider ids ordered by relevance. v1 computes the search document inline; see migration header for the materialized-column scale follow-up.';

GRANT EXECUTE ON FUNCTION public.search_providers_ranked(text, text, text, text[], text[], int)
  TO anon, authenticated;
