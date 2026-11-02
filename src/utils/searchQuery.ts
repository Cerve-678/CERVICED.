import type { ServiceCategory } from '../types/database';
import { UK_CITIES } from '../constants/ukCities';
import { CITY_AREAS } from '../data/cityAreas';
import { editDistance } from './fuzzyMatch';

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
  /** A budget the client typed ("under £50", "for £70", "70 pounds"), in £.
   *  Taken out of serviceText, so the money isn't searched for as a word. */
  maxPrice: number | null;
}

// "under £50", "for £70", "£35", "budget of £100", "70 pounds", "40 quid".
// Every form is read as a ceiling: a client who says "for £70" isn't shown a
// £90 service.
const PRICE = /(?:\b(?:under|below|less than|max(?:imum)?|up to|upto|for|around|about|budget(?: of)?)\s*)?£\s?(\d+(?:\.\d+)?)|\b(\d+(?:\.\d+)?)\s*(?:pounds|quid|gbp)\b/i;

function takePrice(query: string): { rest: string; maxPrice: number | null } {
  const m = PRICE.exec(query);
  if (!m) return { rest: query, maxPrice: null };
  const amount = Number(m[1] ?? m[2]);
  return {
    rest: `${query.slice(0, m.index)} ${query.slice(m.index + m[0].length)}`.replace(/\s+/g, ' ').trim(),
    maxPrice: Number.isFinite(amount) && amount > 0 ? amount : null,
  };
}

// Matches the LAST "in"/"near"/"around"/"close to" in the query, so
// "nails in south london" and "almond nails, nail art in east manchester"
// both split at the right point even if "in" could theoretically appear
// earlier in a longer phrase.
const LOCATION_PREPOSITION = /\b(?:in|near|around|close to)\b\s+/gi;

// "near me" is the client's own position, which Search's Distance filter and
// Nearest sort already use. Read as a place it became the location "me", and
// matched only providers whose address happened to contain those two letters.
const NEAR_ME = /\b(?:near me|nearby|near by|close to me|close by|around me|around here|in my area|local to me)\b/gi;

// Directional qualifiers are useful when present but are often absent from a
// provider's stored city. Keep the full phrase first and offer one conservative
// fallback; never split a place into its individual words ("New York" must not
// also match every provider in York).
const LOCATION_QUALIFIERS = new Set(['north', 'south', 'east', 'west', 'central', 'greater', 'the']);
const COMPASS_WORDS = ['north', 'south', 'east', 'west', 'central'];

// Providers pick their location from CITY_AREAS, so it's stored as "Hackney,
// London": an area, then its city. Search reads places through the same data.
const AREA_CITIES = new Map<string, string[]>();
const REGION_AREAS = new Map<string, string[]>();
for (const { city, regions } of CITY_AREAS) {
  for (const { region, areas } of regions) {
    REGION_AREAS.set(region.toLowerCase(), areas);
    for (const area of areas) {
      const key = area.toLowerCase();
      AREA_CITIES.set(key, [...(AREA_CITIES.get(key) ?? []), city]);
    }
  }
}

// Areas long enough to recognise at the end of a query with no "in": short
// ones are often ordinary words too ("Idle", "Falls", "Penn").
const IMPLICIT_AREAS = [...AREA_CITIES.keys()].filter(area => area.length >= 6);

/** "weat" → "west": one slip in a compass word, never in a place name. */
function fixCompassTypo(word: string): string {
  const lower = word.toLowerCase();
  if (lower.length < 4 || LOCATION_QUALIFIERS.has(lower)) return word;
  return COMPASS_WORDS.find(c => Math.abs(c.length - lower.length) <= 1 && editDistance(lower, c) === 1) ?? word;
}

const CATEGORY_KEYWORDS: [ServiceCategory, string[]][] = [
  ['NAILS', ['nail', 'nails', 'manicure', 'pedicure', 'acrylic', 'acrylics', 'gel nails', 'nail art', 'nail tech']],
  ['HAIR', ['hair', 'hairstylist', 'hairdresser', 'hair stylist', 'braid', 'braids', 'weave', 'wig', 'silk press', 'blow dry', 'cornrow']],
  ['LASHES', ['lash', 'lashes', 'eyelash', 'eyelashes']],
  ['BROWS', ['brow', 'brows', 'eyebrow', 'eyebrows', 'microblading']],
  ['MUA', ['makeup', 'mua', 'glam', 'make up', 'make-up']],
  ['AESTHETICS', ['aesthetics', 'facial', 'facials', 'botox', 'filler', 'fillers', 'peel', 'skin']],
];

/**
 * The places to match, most specific first: the phrase as typed, then with a
 * mistyped compass word fixed ("weat london"), then a region's areas ("east
 * london" → Tower Hamlets, Newham…), then without the compass word, then the
 * city an area belongs to ("hackney" → London). Never splits a place into its
 * individual words ("New York" must not also match every provider in York).
 * Callers rank a provider by the first term it matches.
 */
export function buildLocationTerms(phrase: string): string[] {
  const location = phrase.trim().replace(/\s+/g, ' ');
  if (!location) return [];
  const fixedWords = location.split(' ').map(fixCompassTypo);
  const fixed = fixedWords.join(' ');
  const core = fixedWords.filter(word => !LOCATION_QUALIFIERS.has(word.toLowerCase())).join(' ');
  const terms = [
    location,
    fixed,
    ...(REGION_AREAS.get(fixed.toLowerCase()) ?? []),
    core,
    ...(AREA_CITIES.get(core.toLowerCase()) ?? []),
  ];
  const seen = new Set<string>();
  return terms.filter(term => {
    const key = term.toLowerCase();
    if (!term || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function detectCategory(query: string): ServiceCategory | null {
  const lower = ` ${query.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some(k => lower.includes(` ${k.replace(/-/g, ' ')} `))) return category;
  }
  return null;
}

export function parseSearchQuery(raw: string): ParsedSearchQuery {
  const original = raw.trim().replace(/\s+/g, ' ');
  const { rest: priced, maxPrice } = takePrice(original);
  const q = priced.replace(NEAR_ME, ' ').replace(/\s+/g, ' ').trim();

  let lastMatch: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  LOCATION_PREPOSITION.lastIndex = 0;
  while ((m = LOCATION_PREPOSITION.exec(q)) !== null) lastMatch = m;

  // Clients commonly omit "in" ("nail art Nottingham"). Recognise only a
  // city from the same curated list providers use for service coverage, so a
  // normal final service word is never misread as a location.
  // Areas count the same way ("braids hackney"), and a search that is only an
  // area of any length is a place ("soho").
  const endsWithPlace = (place: string) => q.toLowerCase().endsWith(place.toLowerCase())
    && (q.length === place.length || /\s/.test(q.charAt(q.length - place.length - 1)));
  const implicitCity = lastMatch ? null : [...UK_CITIES, ...IMPLICIT_AREAS]
    .sort((a, b) => b.length - a.length)
    .find(endsWithPlace)
    ?? (AREA_CITIES.has(q.toLowerCase()) ? q : undefined);
  const locationPhrase = lastMatch
    ? q.slice(lastMatch.index + lastMatch[0].length).trim() || null
    // As typed, so a lowercase area key never replaces the client's spelling.
    : implicitCity ? q.slice(q.length - implicitCity.length) : null;
  const serviceText = (lastMatch
    ? q.slice(0, lastMatch.index)
    : implicitCity ? q.slice(0, q.length - implicitCity.length) : q).trim();

  const serviceTerms = serviceText
    .split(/,|&|\band\b/i)
    .map(t => t.trim())
    .filter(Boolean);

  return {
    raw: original,
    serviceText,
    serviceTerms,
    locationPhrase,
    locationTerms: locationPhrase ? buildLocationTerms(locationPhrase) : [],
    categoryHint: detectCategory(serviceText),
    maxPrice,
  };
}
