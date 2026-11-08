// Which town a provider is in, for the client Search "City" filter.
//
// A provider's own location is InfoReg's "Where you're based"
// (providers.location_text), picked with AreaPicker and stored as
// "<Area>, <Town>" ("Shoreditch, London"). Sign-up's WHERE YOU WORK writes the
// same column. The City filter's options are towns from UK_CITIES, plus
// "<Area>, <Town>" entries from CityMultiSelect, so an area has to be read up
// to its town before the two can be compared. The area → town lookup is
// CITY_AREAS, the same data both pickers draw from, so a place a provider can
// pick is always one the filter can place.
//
// providers.service_locations is the "Areas you cover" list a mobile
// provider keeps in InfoReg (picked with the same AreaPicker), plus whole
// cities saved by About You's old cities card. Each entry is read the same
// way: "Shoreditch, London" matches Shoreditch and London, and a whole town
// ("London") matches the town and every area in it, because a provider who
// travels across all of London does travel to Shoreditch.

import { UK_CITIES } from '../constants/ukCities';
import { CITY_AREAS } from '../data/cityAreas';

/** Lower case, single spaces, and ", " between parts, so "Hackney,London"
 *  and "hackney, london" compare equal. */
function normalisePlace(text: string): string {
  return text
    .split(',')
    .map(part => part.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .join(', ')
    .toLowerCase();
}

// Every town either picker offers, normalised → as written.
const TOWNS = new Map<string, string>();
for (const town of [...UK_CITIES, ...CITY_AREAS.map(c => c.city)]) {
  TOWNS.set(normalisePlace(town), town);
}

// Area → the one town it belongs to. An area name used by more than one town
// ("City Centre") can't say which town on its own, so it maps to null and is
// only placed when the town is written after it.
const AREA_TOWN = new Map<string, string | null>();
for (const { city, regions } of CITY_AREAS) {
  for (const { areas } of regions) {
    for (const area of areas) {
      const key = normalisePlace(area);
      const seen = AREA_TOWN.get(key);
      AREA_TOWN.set(key, seen === undefined || seen === city ? city : null);
    }
  }
}

/** Marks a town a provider covers whole (a service_locations entry naming a
 *  town and no area), so an area pick inside it matches. Prefixed so it can
 *  never equal a normalised place name. */
const WHOLE_TOWN_PREFIX = '*';

export interface ProviderPlace {
  /** The town, as UK_CITIES / CITY_AREAS write it. */
  town: string;
  /** The area within it, as stored, or null when only a town was given. */
  area: string | null;
}

/**
 * The town (and area) a "Where you're based" value sits in, or null when it
 * names no town the pickers know. Reads "Shoreditch, London" as London, a bare
 * "Shoreditch" as London too, and a bare "London" as just the town.
 */
export function placeForLocation(locationText: string | null | undefined): ProviderPlace | null {
  if (!locationText) return null;
  const parts = locationText.split(',').map(part => part.trim().replace(/\s+/g, ' ')).filter(Boolean);
  // A town written out wins, read from the end ("Hackney, London, UK").
  for (let i = parts.length - 1; i >= 0; i--) {
    const town = TOWNS.get((parts[i] ?? '').toLowerCase());
    if (town) return { town, area: parts[i - 1] ?? null };
  }
  // No town written: a bare area that only one town has.
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i] ?? '';
    const town = AREA_TOWN.get(part.toLowerCase());
    if (town) return { town, area: part };
  }
  return null;
}

/** A place as typed, its town, and "<area>, <town>" — the keys one place
 *  can be matched on. */
function addPlaceKeys(keys: Set<string>, text: string): ProviderPlace | null {
  const whole = normalisePlace(text);
  if (whole) keys.add(whole);
  const place = placeForLocation(text);
  if (place) {
    keys.add(normalisePlace(place.town));
    if (place.area) keys.add(normalisePlace(`${place.area}, ${place.town}`));
  }
  return place;
}

/**
 * Everything the City filter can match a provider on, normalised: where
 * they're based and each place they cover, each as typed, its town and
 * "<area>, <town>", plus a marker for every town they cover whole. Built once
 * per provider, not per filter pass.
 */
export function cityFilterKeys(
  locationText: string | null | undefined,
  serviceLocations: readonly string[] | null | undefined,
): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const entry of serviceLocations ?? []) {
    const place = addPlaceKeys(keys, entry);
    if (place && !place.area) keys.add(WHOLE_TOWN_PREFIX + normalisePlace(place.town));
  }
  // Where they're based never marks a whole town: "London" there says where
  // the business is, not that it reaches every area of London.
  if (locationText) addPlaceKeys(keys, locationText);
  return keys;
}

/** A provider matches when ANY picked place is one of their keys (OR, not AND).
 *  A picked town matches every area in it. A picked "<Area>, <Town>" matches
 *  that area, or a provider who covers the whole town, but never one who is
 *  merely based somewhere in the town. */
export function matchesCityFilter(picked: readonly string[], keys: ReadonlySet<string>): boolean {
  return picked.some(place => {
    if (keys.has(normalisePlace(place))) return true;
    const town = placeForLocation(place);
    return !!town?.area && keys.has(WHOLE_TOWN_PREFIX + normalisePlace(town.town));
  });
}

// ── "Areas you cover" (providers.service_locations) ─────────────────────────

/** Most places a provider can list. Enough for a borough-by-borough mobile
 *  round; past it a whole town is the better answer. */
export const MAX_COVERED_AREAS = 15;

/** True when two place strings name the same place ("hackney,london" and
 *  "Hackney, London"). */
export function samePlace(a: string, b: string): boolean {
  return normalisePlace(a) === normalisePlace(b);
}

export type AddCoveredAreaResult =
  | { outcome: 'added'; next: string[] }
  | { outcome: 'duplicate' | 'full' | 'empty'; next: readonly string[] };

/** Adds one picked place to the list unless it's blank, already there, or the
 *  list is full. Never reorders or rewrites what was saved before. */
export function addCoveredArea(list: readonly string[], entry: string): AddCoveredAreaResult {
  const trimmed = entry.trim().replace(/\s+/g, ' ');
  if (!trimmed) return { outcome: 'empty', next: list };
  if (list.some(existing => samePlace(existing, trimmed))) return { outcome: 'duplicate', next: list };
  if (list.length >= MAX_COVERED_AREAS) return { outcome: 'full', next: list };
  return { outcome: 'added', next: [...list, trimmed] };
}

/** How a covered place reads on its chip: a town on its own is "All of
 *  London"; an area, or anything the pickers don't know, reads as saved. */
export function coveredAreaLabel(entry: string): string {
  const place = placeForLocation(entry);
  if (place && !place.area && samePlace(place.town, entry)) return `All of ${place.town}`;
  return entry;
}

/** The town a provider is based in, offered as a one-tap first entry — or
 *  null when it's unknown or already on the list. */
export function suggestedCoverTown(
  locationText: string | null | undefined,
  list: readonly string[],
): string | null {
  const town = placeForLocation(locationText)?.town;
  if (!town) return null;
  return list.some(existing => samePlace(existing, town)) ? null : town;
}
