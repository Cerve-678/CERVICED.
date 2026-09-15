import type { OwnedProviderLookupStatus } from "../../contexts/AuthContext";

export interface BookingCtaInput {
  providerDbId: string | null;
  myProviderId: string | null;
  myProviderIdStatus: OwnedProviderLookupStatus;
  isOwnProvider: boolean;
  viewerChecked: boolean;
}

/**
 * Show booking controls on the profile's first content paint while ensuring
 * an owner never sees Book on their own profile. The session lookup supplies
 * the fast answer; the per-profile lookup remains the fallback and authority.
 */
export function shouldShowBookingCta({
  providerDbId,
  myProviderId,
  myProviderIdStatus,
  isOwnProvider,
  viewerChecked,
}: BookingCtaInput): boolean {
  const sessionOwnershipKnown =
    myProviderIdStatus === "resolved" && providerDbId !== null;
  const ownsThisProfile =
    isOwnProvider || (sessionOwnershipKnown && myProviderId === providerDbId);
  const ownershipResolved = viewerChecked || sessionOwnershipKnown;

  return ownershipResolved && !ownsThisProfile;
}
