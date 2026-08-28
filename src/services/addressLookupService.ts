import {
  lookupPostcodeAddress,
  lookupPostcodeAddresses,
} from './databaseService';

export type PostcodeAddress = {
  address: string;
  id?: string;
  latitude?: number;
  longitude?: number;
};

/**
 * Every individual address on a UK postcode, via the find-address-by-postcode
 * Edge Function (which holds the getAddress.io key server-side — that key is
 * a secret credential by getAddress.io's own docs, not a public-tier key like
 * Stripe's publishable key, so it can never be embedded in the app bundle).
 * Returns an empty array (never throws) on any failure so callers can always
 * fall back to on-device geocoding.
 */
export async function findAddressesByPostcode(postcode: string): Promise<PostcodeAddress[]> {
  try {
    return await lookupPostcodeAddresses(postcode);
  } catch (err) {
    console.warn('[addressLookupService] invoke threw:', err);
    return [];
  }
}

/** Resolves the selected GetAddress.io suggestion to its exact coordinates. */
export async function resolvePostcodeAddress(addressId: string): Promise<PostcodeAddress | null> {
  try {
    return await lookupPostcodeAddress(addressId);
  } catch (err) {
    console.warn('[addressLookupService] resolve address threw:', err);
    return null;
  }
}
