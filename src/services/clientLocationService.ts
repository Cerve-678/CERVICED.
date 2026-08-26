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

export interface Coords {
  latitude: number;
  longitude: number;
}

/** Where the answer came from — never inferred from whether coords are null. */
export type ClientLocationSource =
  /** The device's own position. */
  | 'gps'
  /** The centroid of a city the client picked by hand. Not where they are. */
  | 'saved-city'
  /** Permission refused, unavailable, or no saved city to fall back to. */
  | 'unknown';

export interface ClientLocation {
  coords: Coords | null;
  source: ClientLocationSource;
  /** The city name behind a 'saved-city' result, for display. Null otherwise. */
  cityLabel: string | null;
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

const UNKNOWN: ClientLocation = { coords: null, source: 'unknown', cityLabel: null, isCoarse: false };

/**
 * Resolve once: device position if it can be had, otherwise the saved city's
 * centroid, otherwise nothing.
 *
 * Never throws — every caller is decorating a list with distances, and none
 * of them should fail to render because location did. An unknown result is a
 * real answer the caller is expected to handle, not an error.
 */
export async function resolveClientLocation(): Promise<ClientLocation> {
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
        cityLabel: null,
        // null accuracy means the platform didn't say — believed rather than
        // assumed coarse, since treating "unstated" as vague would put a
        // warning on every fix from a platform that doesn't report it.
        isCoarse: accuracy !== null && accuracy > COARSE_ACCURACY_THRESHOLD_M,
      };
    }
  } catch (error) {
    // Falls through to the saved city. Logged rather than swallowed: a
    // permission API that keeps throwing is worth seeing in the logs, even
    // though the client just gets the fallback.
    logger.error('resolveClientLocation: device position unavailable', error);
  }

  try {
    const savedCity = await storage.getItem<string>(STORAGE_KEYS.MANUAL_LOCATION);
    if (savedCity) {
      const [match] = await Location.geocodeAsync(savedCity);
      if (match) {
        return {
          coords: { latitude: match.latitude, longitude: match.longitude },
          source: 'saved-city',
          cityLabel: savedCity,
          // A centroid is exact as a coordinate and wrong as a position. It's
          // not "coarse" — `source` is what tells a caller not to present it
          // as where the client is standing.
          isCoarse: false,
        };
      }
    }
  } catch (error) {
    logger.error('resolveClientLocation: saved city could not be geocoded', error);
  }

  return UNKNOWN;
}
