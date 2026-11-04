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
  /** The centre of an area or city the client picked by hand. */
  | 'saved-place'
  /** Permission refused, unavailable, or no saved city to fall back to. */
  | 'unknown';

export interface ClientLocation {
  coords: Coords | null;
  source: ClientLocationSource;
  /** The place behind a 'saved-place' result, for display. Null otherwise. */
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

/**
 * Resolve once. In order: a neighbourhood the client picked, the device's
 * position, a town the client picked, otherwise nothing.
 *
 * Never throws — every caller is decorating a list with distances, and none
 * of them should fail to render because location did. An unknown result is a
 * real answer the caller is expected to handle, not an error.
 */
export async function resolveClientLocation(): Promise<ClientLocation> {
  let savedPlace: string | null = null;
  try {
    savedPlace = await storage.getItem<string>(STORAGE_KEYS.MANUAL_LOCATION);
  } catch (error) {
    logger.error('resolveClientLocation: saved place could not be read', error);
  }

  const fromSavedPlace = async (): Promise<ClientLocation | null> => {
    if (!savedPlace) return null;
    try {
      const coords = await geocodeUkPlace(savedPlace);
      // The centre of a picked place is exact as a coordinate and not where
      // the client is standing; `source` is what tells a caller that.
      if (coords) return { coords, source: 'saved-place', placeLabel: savedPlace, isCoarse: false };
    } catch (error) {
      logger.error('resolveClientLocation: saved place could not be geocoded', error);
    }
    return null;
  };

  // undefined = not tried yet, so a failed neighbourhood lookup isn't repeated.
  let picked: ClientLocation | null | undefined;
  if (savedPlace && isNeighbourhood(savedPlace)) {
    picked = await fromSavedPlace();
    if (picked) return picked;
  }

  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
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
    }
  } catch (error) {
    // Falls through to the saved place. Logged rather than swallowed: a
    // permission API that keeps throwing is worth seeing in the logs, even
    // though the client just gets the fallback.
    logger.error('resolveClientLocation: device position unavailable', error);
  }

  if (picked === undefined) picked = await fromSavedPlace();
  return picked ?? UNKNOWN;
}
