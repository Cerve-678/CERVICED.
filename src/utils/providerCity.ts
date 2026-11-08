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
// providers.service_locations (the old cities-covered list, which no screen
// edits any more) is still matched too, so a provider who saved cities there
// doesn't drop out of the filter.

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

/**
 * Everything the City filter can match a provider on, normalised: their
 * location as typed, its town, "<area>, <town>", and each saved
 * service_locations entry. Built once per provider, not per filter pass.
 */
export function cityFilterKeys(
  locationText: string | null | undefined,
  serviceLocations: readonly string[] | null | undefined,
): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const entry of serviceLocations ?? []) {
    const key = normalisePlace(entry);
    if (key) keys.add(key);
  }
  if (locationText) {
    const whole = normalisePlace(locationText);
    if (whole) keys.add(whole);
    const place = placeForLocation(locationText);
    if (place) {
      keys.add(normalisePlace(place.town));
      if (place.area) keys.add(normalisePlace(`${place.area}, ${place.town}`));
    }
  }
  return keys;
}

/** A provider matches when ANY picked place is one of their keys (OR, not AND).
 *  A picked town matches every area in it; a picked "<Area>, <Town>" matches
 *  only that area, never a provider who gave the town alone. */
export function matchesCityFilter(picked: readonly string[], keys: ReadonlySet<string>): boolean {
  return picked.some(place => keys.has(normalisePlace(place)));
}
