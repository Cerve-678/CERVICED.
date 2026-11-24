import { Platform } from 'react-native';

/**
 * A link that opens an address in the phone's own maps app.
 *
 * https links rather than the maps:/geo: schemes: they need no canOpenURL
 * check (which on iOS also needs the scheme whitelisted) and still hand off to
 * Apple Maps / Google Maps when installed, falling back to the browser.
 * Coordinates pin the exact spot when the provider's address was geocoded;
 * the address text is always the label and the search when they're missing.
 */
export function mapsUrlFor(
  place: { fullAddress: string; latitude: number | null; longitude: number | null },
  os: typeof Platform.OS = Platform.OS,
): string {
  const query = encodeURIComponent(place.fullAddress);
  const hasPin = place.latitude != null && place.longitude != null;
  if (os === 'ios') {
    return hasPin
      ? `https://maps.apple.com/?q=${query}&ll=${place.latitude},${place.longitude}`
      : `https://maps.apple.com/?q=${query}`;
  }
  return hasPin
    ? `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${query}`;
}

/** Route to the released booking address. Booking coordinates can be a pin for
 * the provider's public area, so they must not override the street address. */
export function directionsUrlFor(
  place: { fullAddress: string },
  os: typeof Platform.OS = Platform.OS,
): string {
  const encoded = encodeURIComponent(place.fullAddress);
  return os === 'ios'
    ? `https://maps.apple.com/?daddr=${encoded}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;
}
