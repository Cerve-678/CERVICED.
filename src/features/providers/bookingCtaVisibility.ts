import type { OwnedProviderLookupStatus } from "../../contexts/AuthContext";

/** Everything that decides whether a client is offered booking controls on a
 *  provider profile. Two independent answers to one question — "is this my own
 *  profile?" — arriving at different times. */
export interface BookingCtaInput {
  /** The profile being viewed, once it has loaded. Null while loading. */
  providerDbId: string | null;
  /** The provider profile this account owns, from AuthContext's once-per-session
   *  lookup. Null both when the account owns none AND when the lookup failed —
   *  which is why the status below has to be consulted, not just this. */
  myProviderId: string | null;
  myProviderIdStatus: OwnedProviderLookupStatus;
  /** The per-profile check in useProviderProfileData: authoritative, but a
   *  round trip behind the profile itself. */
  isOwnProvider: boolean;
  viewerChecked: boolean;
}

/**
 * Whether to render the booking controls (the per-service Book button, the
 * multi-select bar) on a provider profile.
 *
 * Two properties have to hold at once, and they pull against each other:
 *
 *  1. A provider is NEVER offered a Book button on their own profile, not even
 *     for one frame. So "ownership unknown" must read as "withhold", never as
 *     "not the owner".
 *  2. For everyone else the controls must paint WITH the service card, not a
 *     round trip later. Gating on the per-profile check alone satisfied (1) by
 *     making every client pay for it: the profile drew, then the buttons
 *     appeared afterwards.
 *
 * Resolved by letting the session-level answer — which normally settled long
 * before this screen mounted — satisfy (2), while treating a lookup that
 * FAILED as unknown rather than as "owns nothing", which is what keeps (1).
 *
 * Extracted from ProviderProfileScreen so this is testable on its own: the
 * interesting states are all mid-load, and they are the states a running app
 * passes through too quickly to inspect by eye.
 */
export function shouldShowBookingCta(input: BookingCtaInput): boolean {
  const {
    providerDbId,
    myProviderId,
    myProviderIdStatus,
    isOwnProvider,
    viewerChecked,
  } = input;

  // The session answer counts only where it actually produced one, and only
  // once there is a loaded profile to compare it against.
  const sessionOwnershipKnown =
    myProviderIdStatus === "resolved" && providerDbId !== null;

  const ownsThisProfile =
    isOwnProvider || (sessionOwnershipKnown && myProviderId === providerDbId);

  const ownershipResolved = viewerChecked || sessionOwnershipKnown;

  return ownershipResolved && !ownsThisProfile;
}
