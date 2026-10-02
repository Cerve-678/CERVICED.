// src/constants/searchSynonyms.ts
//
// Domain synonym / alias expansion for provider Search. Beauty vocabulary is
// full of names for the same thing — "gel nails" and "BIAB", "LVL" and "lash
// lift", "silk press" and "Dominican blowout" — and a client only types one of
// them. search_providers_ranked() takes an array of extra OR terms
// (p_synonyms); expandSearchSynonyms() builds that array from the typed query
// so the search also matches providers who used the other word.
//
// This is a curated seed, deliberately small and obvious — grow it from real
// zero-result search logs (logSearchEvent already records those). It is NOT a
// stemmer or a thesaurus; it only maps terms where the alias is genuinely the
// same service a client would be happy to be shown.

/**
 * trigger (whole-word/phrase, lowercase) -> extra terms to OR into the search.
 * One-directional per entry; list both directions where both are things people
 * actually type.
 */
export const SEARCH_SYNONYMS: Record<string, string[]> = {
  'gel nails': ['biab', 'builder gel', 'gel manicure'],
  biab: ['builder gel', 'gel overlay', 'gel nails'],
  'builder gel': ['biab', 'gel overlay'],
  acrylics: ['acrylic', 'full set', 'extensions'],
  'dip powder': ['sns', 'dip nails'],
  sns: ['dip powder'],

  lvl: ['lash lift', 'lash lifting'],
  'lash lift': ['lvl', 'lash lifting'],
  'russian lashes': ['russian volume', 'volume lashes'],
  'volume lashes': ['russian volume'],

  'silk press': ['dominican blowout', 'blow out', 'press'],
  'dominican blowout': ['silk press', 'blow out'],
  knotless: ['knotless braids', 'box braids', 'braids'],
  'box braids': ['braids', 'knotless'],
  cornrows: ['braids', 'canerows'],
  'wig install': ['frontal', 'closure', 'wig fitting'],
  frontal: ['wig install', 'closure'],
  weave: ['sew in', 'hair extensions'],
  balayage: ['highlights', 'colour', 'foils'],
  ombre: ['balayage', 'colour melt'],

  microblading: ['eyebrow tattoo', 'semi permanent brows', 'brows'],
  'hd brows': ['brow lamination', 'brows'],
  'brow lamination': ['hd brows', 'laminated brows'],
  threading: ['brow threading', 'eyebrow threading'],

  botox: ['anti-wrinkle', 'anti wrinkle', 'injectables'],
  filler: ['dermal filler', 'lip filler', 'injectables'],
  'lip filler': ['filler', 'lips'],
  facial: ['facials', 'skin treatment'],
  hydrafacial: ['facial', 'facials'],
  'spray tan': ['spray tanning', 'tan'],

  mua: ['makeup', 'makeup artist'],
  makeup: ['mua', 'glam'],
  bridal: ['wedding', 'bride'],
  wedding: ['bridal', 'bride'],
};

const WORD_BOUNDARY_SAFE = /[.*+?^${}()|[\]\\]/g;

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Extra OR terms to widen a query, derived from SEARCH_SYNONYMS. Returns a
 * deduped list that excludes terms already present in the query (no point
 * OR-ing in a word the user already typed). Matching is whole-word / whole-
 * phrase on the normalised query, so "tan" won't fire inside "tangle".
 */
export function expandSearchSynonyms(query: string): string[] {
  const q = normalise(query);
  if (!q) return [];

  const out = new Set<string>();
  for (const [trigger, expansions] of Object.entries(SEARCH_SYNONYMS)) {
    const pattern = new RegExp(`(?:^|\\s)${trigger.replace(WORD_BOUNDARY_SAFE, '\\$&')}(?:\\s|$)`);
    if (!pattern.test(q)) continue;
    for (const term of expansions) {
      const nt = normalise(term);
      // Skip terms the query already contains as a whole word/phrase.
      if (nt && !new RegExp(`(?:^|\\s)${nt.replace(WORD_BOUNDARY_SAFE, '\\$&')}(?:\\s|$)`).test(q)) {
        out.add(term);
      }
    }
  }
  return [...out];
}
