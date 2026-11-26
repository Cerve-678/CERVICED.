// src/services/providerClaimService.ts
// "Claim your business" flow — searching scraped/unclaimed provider listings,
// and the claim a signed-up account makes on one. Ownership is proven by a
// code in the listing's Instagram bio, checked and approved by hand on the
// CERVICED side (review_provider_claim) — nothing in the app approves a claim.
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  searchUnclaimedProviders as dbSearchUnclaimedProviders,
  getUnclaimedProviderDetail as dbGetUnclaimedProviderDetail,
  requestProviderClaim,
  getLatestProviderClaimRequest,
  type ProviderClaimRequestRow,
  type ProviderClaimStatus,
} from './databaseService';

const PENDING_CLAIM_KEY = '@pending_provider_claim';

export interface UnclaimedProviderSummary {
  id: string;
  displayName: string;
  serviceCategory: string;
  locationText: string | null;
  logoUrl: string | null;
  scrapedFields: string[];
  instagram: string | null;
}

/** A listing picked before signup, waiting for the account to exist. */
export interface PendingClaim {
  providerId: string;
}

export interface ProviderClaim {
  id: string;
  listingName: string;
  instagramHandle: string;
  bioCode: string;
  status: ProviderClaimStatus;
  decidedAt: string | null;
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
    instagram: p.instagram,
  }));
}

export interface UnclaimedProviderDetail extends UnclaimedProviderSummary {
  aboutText: string | null;
  phone: string | null;
  website: string | null;
}

/** Fuller row for the preview step, once one search result has been picked —
 *  used to prefill the signup wizard (RegistrationContext). */
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
    instagram: data.instagram,
    aboutText: data.about_text,
    phone: data.phone,
    website: data.website,
  };
}

/** Instagram handle as shown to people: no @, no surrounding space. */
export function displayHandle(instagram: string | null | undefined): string {
  return (instagram ?? '').trim().replace(/^@+/, '');
}

export function mapProviderClaim(row: ProviderClaimRequestRow): ProviderClaim {
  return {
    id: row.id,
    listingName: row.listing_name,
    instagramHandle: row.instagram_handle,
    bioCode: row.bio_code,
    status: row.status,
    decidedAt: row.decided_at,
  };
}

/** Opens the claim for the signed-in account (or returns the one already
 *  open on this listing) with the code to put in the Instagram bio. */
export async function requestClaim(providerId: string): Promise<ProviderClaim> {
  return mapProviderClaim(await requestProviderClaim(providerId));
}

/** The account's most recent claim, or null if it has never made one. */
export async function getLatestClaim(userId: string): Promise<ProviderClaim | null> {
  const row = await getLatestProviderClaimRequest(userId);
  return row ? mapProviderClaim(row) : null;
}

const DECIDED_CLAIM_SHOWN_FOR_MS = 7 * 24 * 60 * 60 * 1000;

/** An open claim always shows; a decided one for a week, so the owner hears
 *  how it went; a withdrawn one (replaced by another claim) never. */
export function isClaimWorthShowing(claim: ProviderClaim, now: number): boolean {
  if (claim.status === 'pending') return true;
  if (claim.status === 'withdrawn' || !claim.decidedAt) return false;
  return now - Date.parse(claim.decidedAt) < DECIDED_CLAIM_SHOWN_FOR_MS;
}

/** A DB guard message (RAISE EXCEPTION, SQLSTATE P0001) — written for people,
 *  and final: retrying the same listing won't change the answer. */
export function isClaimGuardError(error: unknown): error is { code: string; message: string } {
  return (
    typeof error === 'object' && error !== null &&
    (error as { code?: unknown }).code === 'P0001' &&
    typeof (error as { message?: unknown }).message === 'string'
  );
}

/** For the profile screen after signup: opens the claim on a listing picked
 *  before signup, otherwise returns the account's latest claim if it's still
 *  worth showing. A stashed listing is kept after a network failure so the
 *  next visit tries again, and dropped once the server has answered. */
export async function loadListingClaim(userId: string): Promise<ProviderClaim | null> {
  const pending = await getPendingClaim();
  if (pending) {
    try {
      const claim = await requestClaim(pending.providerId);
      await clearPendingClaim();
      return claim;
    } catch (error) {
      if (isClaimGuardError(error)) await clearPendingClaim();
      throw error;
    }
  }
  const latest = await getLatestClaim(userId);
  return latest && isClaimWorthShowing(latest, Date.now()) ? latest : null;
}

/** Stashes the picked listing locally — the caller isn't signed in yet at this
 *  point, so the claim can't be opened until InfoRegScreen picks this up right
 *  after the new provider account exists. */
export async function savePendingClaim(claim: PendingClaim): Promise<void> {
  await AsyncStorage.setItem(PENDING_CLAIM_KEY, JSON.stringify({ providerId: claim.providerId }));
}

/** Reads the stashed listing. Tolerates the older shape that also carried an
 *  email code — only providerId is used now. */
export function parsePendingClaim(raw: string | null): PendingClaim | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof (parsed as { providerId?: unknown }).providerId === 'string') {
      return { providerId: (parsed as { providerId: string }).providerId };
    }
    return null;
  } catch {
    return null;
  }
}

export async function getPendingClaim(): Promise<PendingClaim | null> {
  try {
    return parsePendingClaim(await AsyncStorage.getItem(PENDING_CLAIM_KEY));
  } catch {
    return null;
  }
}

export async function clearPendingClaim(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_CLAIM_KEY).catch(() => {});
}
