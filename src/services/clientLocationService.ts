// Where the client is, for distance and "near you" sorting.
//
// One resolver, because there were three. HomeScreen fell back to a saved
// city when GPS was refused, SearchScreen had no fallback at all, and each
// decided independently what "we don't know where you are" meant — so the
// same app state produced city-centroid distances on one tab and none on the
// next. BookingsScreen is deliberately NOT a caller: it watches position
// continuously to keep a live map centred, which is a different job from
// answering "where are you, once".

import * as Location from 'expo-location';
import { storage, STORAGE_KEYS } from '../utils/storage';
import { logger } from '../utils/logger';
import { searchPlaces } from '../data/cityAreas';
import { geocodeUkPlace, type Coords } from './ukGeocode';

export type { Coords };

/** Where the answer came from — never inferred from whether coords are null. */
export type ClientLocationSource =
  /** The device's own position. */
  | 'gps'
  /** The centre of an area or city the client picked on Home, on this phone. */
  | 'saved-place'
  /** The centre of the account's "Your area" (users.client_area). */
  | 'account-area'
  /** Permission refused, unavailable, or no saved city to fall back to. */
  | 'unknown';

export interface ClientLocation {
  coords: Coords | null;
  source: ClientLocationSource;
  /** The place behind a 'saved-place' or 'account-area' result, for display. Null otherwise. */
  placeLabel: string | null;
  /**
   * The fix is too coarse to state a distance confidently — on iOS this is
   * what "Precise Location" being switched off looks like, since permission
   * still reports as granted and expo-location 19 exposes only `scope`, not
   * the accuracy authorization. Inferred from the reported accuracy radius
   * instead, so treat it as a strong hint rather than a guarantee: a first
   * indoor fix can be legitimately coarse and then sharpen.
   */
  isCoarse: boolean;
}

/**
 * Above this many metres of accuracy radius, a position is too vague to
 * present as the client's location. iOS reduced accuracy lands in the low
 * thousands; an ordinary fix is tens to low hundreds.
 */
export const COARSE_ACCURACY_THRESHOLD_M = 500;

const UNKNOWN: ClientLocation = { coords: null, source: 'unknown', placeLabel: null, isCoarse: false };

/**
 * Whether a saved place is a neighbourhood ("Haggerston, London") rather than
 * a whole town ("London, UK"). A neighbourhood is a better answer than GPS,
 * because the client picked it on purpose. A whole town is too broad to beat
 * a real position, so it's only used when there's no fix.
 */
export function isNeighbourhood(place: string): boolean {
  const [name, town] = place.split(',').map(part => part.trim().toLowerCase());
  if (!name || !town) return false;
  return searchPlaces(name).some(m => m.kind === 'area' && m.name.toLowerCase() === name && m.town.toLowerCase() === town);
}

/** What this phone has been told on Home's location sheet (LocationModal). */
export type PhoneLocationChoice =
  /** Nothing yet — a new phone, a reinstall, or a sheet never opened. */
  | { kind: 'none' }
  /** A place picked to browse from, for now, on this phone only. */
  | { kind: 'place'; place: string }
  /** "Use my location" — the device's position, on purpose. */
  | { kind: 'device' };

/** One thing to try, in order, until one gives coordinates. */
export type ClientLocationStep =
  | { kind: 'gps' }
  | { kind: 'place'; place: string; source: 'saved-place' | 'account-area' };

/**
 * The order to try things in. Pure, so the precedence is testable on its own.
 *
 *   Nothing chosen on this phone:
 *     Your area (a neighbourhood) > GPS > Your area (a whole town)
 *   A place picked on this phone:
 *     that place (a neighbourhood) > GPS > that place (a whole town) > Your area
 *   "Use my location" on this phone:
 *     GPS > Your area
 *
 * A neighbourhood the client chose beats GPS, because they chose it; a whole
 * town is too broad to beat a real position. That rule is the same for both
 * places a client can choose one — the phone's pick is only "for now", so
 * it outranks the account, and the account outranks guessing.
 */
export function planClientLocation(
  phone: PhoneLocationChoice,
  accountArea: string | null | undefined,
): ClientLocationStep[] {
  const area = accountArea?.trim() || null;
  const fromAccount = (): ClientLocationStep[] =>
    area ? [{ kind: 'place', place: area, source: 'account-area' }] : [];
  const gps: ClientLocationStep = { kind: 'gps' };

  if (phone.kind === 'device') return [gps, ...fromAccount()];

  if (phone.kind === 'place') {
    const picked: ClientLocationStep = { kind: 'place', place: phone.place, source: 'saved-place' };
    // The same place twice would only geocode twice.
    const rest = area && area !== phone.place ? fromAccount() : [];
    return isNeighbourhood(phone.place) ? [picked, gps, ...rest] : [gps, picked, ...rest];
  }

  if (!area) return [gps];
  return isNeighbourhood(area) ? [...fromAccount(), gps] : [gps, ...fromAccount()];
}

/**
 * Read what this phone was told. A picked place wins over the "Use my
 * location" flag if both are somehow set, since savePhoneLocationChoice
 * clears one when it writes the other.
 */
async function readPhoneLocationChoice(): Promise<PhoneLocationChoice> {
  try {
    const [place, useDevice] = await Promise.all([
      storage.getItem<string>(STORAGE_KEYS.MANUAL_LOCATION),
      storage.getItem<boolean>(STORAGE_KEYS.NEAR_YOU_USE_DEVICE),
    ]);
    if (typeof place === 'string' && place.trim()) return { kind: 'place', place };
    if (useDevice === true) return { kind: 'device' };
  } catch (error) {
    logger.error('resolveClientLocation: saved place could not be read', error);
  }
  return { kind: 'none' };
}

/**
 * Save what was chosen on Home's location sheet: a place, or null for "Use my
 * location". Phone-only on purpose — browsing from somewhere for now must not
 * change the account's "Your area", which mobile providers are sent.
 */
export async function savePhoneLocationChoice(place: string | null): Promise<void> {
  if (place === null) {
    await storage.removeItem(STORAGE_KEYS.MANUAL_LOCATION);
    await storage.setItem(STORAGE_KEYS.NEAR_YOU_USE_DEVICE, true);
    return;
  }
  await storage.setItem(STORAGE_KEYS.MANUAL_LOCATION, place);
  await storage.removeItem(STORAGE_KEYS.NEAR_YOU_USE_DEVICE);
}

async function deviceLocation(): Promise<ClientLocation | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const position = await Location.getCurrentPositionAsync({});
    const accuracy = position.coords.accuracy;
    return {
      coords: {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      },
      source: 'gps',
      placeLabel: null,
      // null accuracy means the platform didn't say — believed rather than
      // assumed coarse, since treating "unstated" as vague would put a
      // warning on every fix from a platform that doesn't report it.
      isCoarse: accuracy !== null && accuracy > COARSE_ACCURACY_THRESHOLD_M,
    };
  } catch (error) {
    // Falls through to the next step. Logged rather than swallowed: a
    // permission API that keeps throwing is worth seeing in the logs, even
    // though the client just gets the fallback.
    logger.error('resolveClientLocation: device position unavailable', error);
    return null;
  }
}

async function placeLocation(
  place: string,
  source: 'saved-place' | 'account-area',
): Promise<ClientLocation | null> {
  try {
    const coords = await geocodeUkPlace(place);
    // The centre of a chosen place is exact as a coordinate and not where
    // the client is standing; `source` is what tells a caller that.
    if (coords) return { coords, source, placeLabel: place, isCoarse: false };
  } catch (error) {
    logger.error('resolveClientLocation: saved place could not be geocoded', error);
  }
  return null;
}

export interface ResolveClientLocationOptions {
  /** users.client_area — Account → Your area — from AuthContext's user. */
  accountArea?: string | null;
}

/**
 * Resolve once, in planClientLocation's order.
 *
 * Never throws — every caller is decorating a list with distances, and none
 * of them should fail to render because location did. An unknown result is a
 * real answer the caller is expected to handle, not an error.
 */
export async function resolveClientLocation(
  options: ResolveClientLocationOptions = {},
): Promise<ClientLocation> {
  const phone = await readPhoneLocationChoice();
  for (const step of planClientLocation(phone, options.accountArea)) {
    const found = step.kind === 'gps'
      ? await deviceLocation()
      : await placeLocation(step.place, step.source);
    if (found) return found;
  }
  return UNKNOWN;
}
