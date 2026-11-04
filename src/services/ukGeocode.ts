// Turning a typed UK place into coordinates, for client and provider alike.

import * as Location from 'expo-location';

export interface Coords {
  latitude: number;
  longitude: number;
}

export const UK_BOUNDS = { minLat: 49.8, maxLat: 60.9, minLng: -8.2, maxLng: 1.8 };

export function isInUk({ latitude, longitude }: Coords): boolean {
  return latitude >= UK_BOUNDS.minLat && latitude <= UK_BOUNDS.maxLat
    && longitude >= UK_BOUNDS.minLng && longitude <= UK_BOUNDS.maxLng;
}

/**
 * Geocode a UK place name, or null if it can't be found in the UK. The
 * geocoder answers bare names with the most famous match anywhere, which put
 * a provider who typed "East London" in South Africa, so the name is always
 * asked for as a UK place and an answer outside the UK is thrown away.
 */
export async function geocodeUkPlace(place: string): Promise<Coords | null> {
  const trimmed = place.trim();
  if (!trimmed) return null;
  const query = /\b(uk|united kingdom|england|scotland|wales|northern ireland)\s*$/i.test(trimmed)
    ? trimmed
    : `${trimmed}, UK`;
  const matches = await Location.geocodeAsync(query);
  const match = matches.find(m => isInUk(m));
  return match ? { latitude: match.latitude, longitude: match.longitude } : null;
}
