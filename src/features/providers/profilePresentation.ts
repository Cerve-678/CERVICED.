import type { ProviderProfileData } from './profileTypes';
import type { BusinessType } from '../../types/database';
import { BUSINESS_TYPE_META } from '../business-details/options';
import { buildPolicyDisplayRows } from '../../utils/policyDisplay';

/**
 * Re-exported, not re-declared: the labels live in BUSINESS_TYPE_META
 * (features/business-details/options.ts) with the rest of what defines a
 * business type, so a provider picking "Home Studio" and a client reading it
 * on a search card can never be shown two different words for one DB value.
 */
export const BUSINESS_TYPE_LABEL: Record<BusinessType, string> = {
  salon: BUSINESS_TYPE_META.salon.label,
  studio: BUSINESS_TYPE_META.studio.label,
  home_based: BUSINESS_TYPE_META.home_based.label,
  mobile: BUSINESS_TYPE_META.mobile.label,
};

/**
 * Business type is shown as an icon rather than its words wherever it sits in
 * a dense meta line (search cards, the profile header) — the labels are long
 * relative to the space and were crowding out price/location. The label map
 * above is still the source of the accessible name for each glyph, so the two
 * can never describe different things; keep them in sync when adding a value.
 * These use the consistent outline set from Expo Ionicons.
 */
export const BUSINESS_TYPE_ICON: Record<BusinessType, string> = {
  salon: 'flower-outline',
  studio: 'business-outline',
  home_based: 'home-outline',
  mobile: 'car-outline',
};

/** Formats a service duration for the client profile. */
export function formatServiceDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}min` : `${hours} hour${hours > 1 ? 's' : ''}`;
}

/** Whether the profile should expose its Policy tab: only when the provider
 *  has written a policy that puts something in it — a row the tab would list,
 *  or their own policy image. cancellation_notice_hours alone doesn't count:
 *  the column defaults to 24 for every provider, so it used to show the tab
 *  (empty) for providers who had never entered a policy at all. */
export function hasProviderPolicyInfo(provider: ProviderProfileData): boolean {
  const policy = provider.bookingPolicies;
  if (!policy) return false;
  return (
    buildPolicyDisplayRows(policy, provider.cancellationNoticeHours, { linkOnly: provider.isLinkOnly }).length > 0 ||
    Boolean(policy.policyImageUrl)
  );
}
