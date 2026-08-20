import { supabase } from '../lib/supabase';

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
    const { data, error } = await supabase.functions.invoke('find-address-by-postcode', {
      body: { postcode },
    });
    if (error) {
      console.warn('[addressLookupService] find-address-by-postcode error:', error, (error as any)?.context?.status);
      return [];
    }
    if (!Array.isArray(data?.addresses)) {
      console.warn('[addressLookupService] unexpected response shape:', data);
      return [];
    }
    return data.addresses;
  } catch (err) {
    console.warn('[addressLookupService] invoke threw:', err);
    return [];
  }
}

/** Resolves the selected GetAddress.io suggestion to its exact coordinates. */
export async function resolvePostcodeAddress(addressId: string): Promise<PostcodeAddress | null> {
  try {
    const { data, error } = await supabase.functions.invoke('find-address-by-postcode', {
      body: { addressId },
    });
    if (error || !data?.address || typeof data.address.latitude !== 'number' || typeof data.address.longitude !== 'number') {
      console.warn('[addressLookupService] resolve address error:', error, data);
      return null;
    }
    return {
      address: data.address.formatted,
      latitude: data.address.latitude,
      longitude: data.address.longitude,
    };
  } catch (err) {
    console.warn('[addressLookupService] resolve address threw:', err);
    return null;
  }
}
