import type { ServiceCategory } from '../types/database';
import { UK_CITIES } from '../constants/ukCities';

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

// Directional qualifiers are useful when present but are often absent from a
// provider's stored city. Keep the full phrase first and offer one conservative
// fallback; never split a place into its individual words ("New York" must not
// also match every provider in York).
const LOCATION_QUALIFIERS = new Set(['north', 'south', 'east', 'west', 'central', 'greater', 'the']);

const CATEGORY_KEYWORDS: [ServiceCategory, string[]][] = [
  ['NAILS', ['nail', 'nails', 'manicure', 'pedicure', 'acrylic', 'acrylics', 'gel nails', 'nail art', 'nail tech']],
  ['HAIR', ['hair', 'hairstylist', 'hairdresser', 'hair stylist', 'braid', 'braids', 'weave', 'wig', 'silk press', 'blow dry', 'cornrow']],
  ['LASHES', ['lash', 'lashes', 'eyelash', 'eyelashes']],
  ['BROWS', ['brow', 'brows', 'eyebrow', 'eyebrows', 'microblading']],
  ['MUA', ['makeup', 'mua', 'glam', 'make up', 'make-up']],
  ['AESTHETICS', ['aesthetics', 'facial', 'facials', 'botox', 'filler', 'fillers', 'peel', 'skin']],
];

/** Preserve a complete place name, with one directional-qualifier fallback. */
export function buildLocationTerms(phrase: string): string[] {
  const location = phrase.trim().replace(/\s+/g, ' ');
  if (!location) return [];
  const core = location.split(' ').filter(word => !LOCATION_QUALIFIERS.has(word.toLowerCase()));
  const fallback = core.join(' ');
  return fallback && fallback.toLowerCase() !== location.toLowerCase()
    ? [location, fallback]
    : [location];
}

function detectCategory(query: string): ServiceCategory | null {
  const lower = ` ${query.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some(k => lower.includes(` ${k.replace(/-/g, ' ')} `))) return category;
  }
  return null;
}

export function parseSearchQuery(raw: string): ParsedSearchQuery {
  const q = raw.trim().replace(/\s+/g, ' ');

  let lastMatch: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  LOCATION_PREPOSITION.lastIndex = 0;
  while ((m = LOCATION_PREPOSITION.exec(q)) !== null) lastMatch = m;

  // Clients commonly omit "in" ("nail art Nottingham"). Recognise only a
  // city from the same curated list providers use for service coverage, so a
  // normal final service word is never misread as a location.
  const implicitCity = lastMatch ? null : [...UK_CITIES]
    .sort((a, b) => b.length - a.length)
    .find(city => q.toLowerCase().endsWith(city.toLowerCase())
      && (q.length === city.length || /\s/.test(q.charAt(q.length - city.length - 1))));
  const locationPhrase = lastMatch
    ? q.slice(lastMatch.index + lastMatch[0].length).trim() || null
    : implicitCity ?? null;
  const serviceText = (lastMatch
    ? q.slice(0, lastMatch.index)
    : implicitCity ? q.slice(0, q.length - implicitCity.length) : q).trim();

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
    categoryHint: detectCategory(serviceText),
  };
}
