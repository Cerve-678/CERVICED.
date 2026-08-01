// src/services/providerClaimService.ts
// "Claim your business" flow — searching scraped/unclaimed provider listings,
// verifying ownership, and attaching a newly-signed-up account to one.
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  searchUnclaimedProviders as dbSearchUnclaimedProviders,
  getUnclaimedProviderDetail as dbGetUnclaimedProviderDetail,
} from './databaseService';

const PENDING_CLAIM_KEY = '@pending_provider_claim';

export interface UnclaimedProviderSummary {
  id: string;
  displayName: string;
  serviceCategory: string;
  locationText: string | null;
  logoUrl: string | null;
  scrapedFields: string[];
}

export interface PendingClaim {
  providerId: string;
  code: string;
}

/** Searches unclaimed listings for the pre-signup claim-discovery step — see
 *  databaseService.searchUnclaimedProviders for why has_gone_live isn't
 *  checked here (it's is_claimed = false doing the gating, not RLS). */
export async function searchUnclaimedProviders(query: string): Promise<UnclaimedProviderSummary[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const data = await dbSearchUnclaimedProviders(trimmed);

  return (data || []).map((p) => ({
    id: p.id,
    displayName: p.display_name,
    serviceCategory: p.service_category,
    locationText: p.location_text,
    logoUrl: p.logo_url,
    scrapedFields: p.scraped_fields || [],
  }));
}

export interface UnclaimedProviderDetail extends UnclaimedProviderSummary {
  aboutText: string | null;
  phone: string | null;
  email: string | null;
  instagram: string | null;
  website: string | null;
}

/** Fuller row for the preview step, once one search result has been picked —
 *  used to prefill the signup wizard (RegistrationContext) after claiming. */
export async function getUnclaimedProviderDetail(id: string): Promise<UnclaimedProviderDetail | null> {
  const data = await dbGetUnclaimedProviderDetail(id);
  if (!data) return null;

  return {
    id: data.id,
    displayName: data.display_name,
    serviceCategory: data.service_category,
    locationText: data.location_text,
    logoUrl: data.logo_url,
    scrapedFields: data.scraped_fields || [],
    aboutText: data.about_text,
    phone: data.phone,
    email: data.email,
    instagram: data.instagram,
    website: data.website,
  };
}

/** Sends a one-time code to the listing's contact email. Returns a masked
 *  email so the UI can show "we sent a code to j***@salon.com" without
 *  exposing the full address. */
export async function requestClaimVerification(providerId: string): Promise<{ maskedEmail: string }> {
  const { data, error } = await supabase.functions.invoke('request-claim-verification', {
    body: { providerId },
  });
  if (error) throw new Error(error.message || 'Could not send a verification code. Please try again.');
  if (data?.error) throw new Error(data.error);
  return { maskedEmail: data.maskedEmail };
}

/** Stashes the pending claim locally — the caller isn't signed in yet at this
 *  point, so it can't be attached to the account until InfoRegScreen picks
 *  this up right after the new provider account exists. */
export async function savePendingClaim(claim: PendingClaim): Promise<void> {
  await AsyncStorage.setItem(PENDING_CLAIM_KEY, JSON.stringify(claim));
}

export async function getPendingClaim(): Promise<PendingClaim | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_CLAIM_KEY);
    return raw ? (JSON.parse(raw) as PendingClaim) : null;
  } catch {
    return null;
  }
}

export async function clearPendingClaim(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_CLAIM_KEY).catch(() => {});
}

/** Attaches the signed-in caller's account to the unclaimed row `providerId`,
 *  verified by `code` (validated server-side by claim_provider_profile —
 *  expiry, single use, and "one provider per account" are all enforced
 *  there, not here). providerId is passed explicitly (rather than looked up
 *  by token alone) so the RPC can track failed attempts per listing and
 *  lock a specific row out after 5 wrong guesses — see claim_attempts in
 *  supabase/claimable_provider_profiles.sql. */
export async function claimProviderProfile(providerId: string, code: string): Promise<string> {
  const { data, error } = await supabase.rpc('claim_provider_profile', {
    p_provider_id: providerId,
    p_claim_token: code,
  });
  if (error) throw new Error(error.message || 'Could not verify that code.');
  return data as string;
}
