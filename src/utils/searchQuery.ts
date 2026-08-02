import type { ServiceCategory } from '../types/database';

// ─────────────────────────────────────────────────────────
// NATURAL-LANGUAGE SEARCH PARSING
//
// Splits a plain-English query like "almond nails, nail art in east
// manchester" into a service phrase ("almond nails, nail art"), a location
// phrase ("east manchester"), and (best-effort) a service-category hint —
// so free-text search can filter on location_text and broaden to a whole
// category even when the exact words typed don't literally appear in any
// service name/description. Pure string parsing — no network/DB access —
// so it's usable from databaseService.ts and directly from screens/tests.
// ─────────────────────────────────────────────────────────

export interface ParsedSearchQuery {
  /** Original query, trimmed. */
  raw: string;
  /** The portion before "in"/"near"/"around"/"close to", if any was found. */
  serviceText: string;
  /** serviceText split on commas/"and"/"&" into individual terms. */
  serviceTerms: string[];
  /** The portion after the last location preposition, e.g. "east manchester". */
  locationPhrase: string | null;
  /** Loosened match terms derived from locationPhrase (see buildLocationTerms). */
  locationTerms: string[];
  /** Best-effort service category detected from keywords anywhere in the query. */
  categoryHint: ServiceCategory | null;
}

// Matches the LAST "in"/"near"/"around"/"close to" in the query, so
// "nails in south london" and "almond nails, nail art in east manchester"
// both split at the right point even if "in" could theoretically appear
// earlier in a longer phrase.
const LOCATION_PREPOSITION = /\b(?:in|near|around|close to)\b\s+/gi;

// Compass/scope qualifiers that often aren't present in a provider's
// location_text even when the core place name is — e.g. a provider might
// have location_text "Manchester" while a client searches "east manchester".
// Stripping these out gives a fallback term that still matches the city.
const LOCATION_STOPWORDS = new Set(['north', 'south', 'east', 'west', 'central', 'greater', 'the']);

const CATEGORY_KEYWORDS: [ServiceCategory, string[]][] = [
  ['NAILS', ['nail', 'nails', 'manicure', 'pedicure', 'acrylic', 'acrylics', 'gel nails', 'nail art', 'nail tech']],
  ['HAIR', ['hair', 'hairstylist', 'hairdresser', 'hair stylist', 'braid', 'braids', 'weave', 'wig', 'silk press', 'blow dry', 'cornrow']],
  ['LASHES', ['lash', 'lashes', 'eyelash', 'eyelashes']],
  ['BROWS', ['brow', 'brows', 'eyebrow', 'eyebrows', 'microblading']],
  ['MUA', ['makeup', 'mua', 'glam', 'make up', 'make-up']],
  ['AESTHETICS', ['aesthetics', 'facial', 'facials', 'botox', 'filler', 'fillers', 'peel', 'skin']],
];

/** Loosen a location phrase into a set of ilike terms — the full phrase
 *  plus a compass-stripped fallback (and its individual words), so "east
 *  manchester" still matches location_text that's just "Manchester". */
export function buildLocationTerms(phrase: string): string[] {
  const trimmed = phrase.trim();
  const words = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  const core = words.filter(w => !LOCATION_STOPWORDS.has(w));

  const terms = new Set<string>();
  if (trimmed) terms.add(trimmed);
  if (core.length) terms.add(core.join(' '));
  core.forEach(w => { if (w.length > 1) terms.add(w); });

  return [...terms];
}

function detectCategory(query: string): ServiceCategory | null {
  const lower = query.toLowerCase();
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some(k => lower.includes(k))) return category;
  }
  return null;
}

export function parseSearchQuery(raw: string): ParsedSearchQuery {
  const q = raw.trim();

  let lastMatch: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  LOCATION_PREPOSITION.lastIndex = 0;
  while ((m = LOCATION_PREPOSITION.exec(q)) !== null) lastMatch = m;

  const locationPhrase = lastMatch ? q.slice(lastMatch.index + lastMatch[0].length).trim() || null : null;
  const serviceText = (lastMatch ? q.slice(0, lastMatch.index) : q).trim();

  const serviceTerms = serviceText
    .split(/,|&|\band\b/i)
    .map(t => t.trim())
    .filter(Boolean);

  return {
    raw: q,
    serviceText,
    serviceTerms,
    locationPhrase,
    locationTerms: locationPhrase ? buildLocationTerms(locationPhrase) : [],
    categoryHint: detectCategory(q),
  };
}
