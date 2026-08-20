import type { ProviderProfileData } from './profileTypes';

export const BUSINESS_TYPE_LABEL: Record<NonNullable<ProviderProfileData['businessType']>, string> = {
  salon: 'Salon',
  studio: 'Studio',
  home_based: 'Home Studio',
  mobile: 'Mobile',
};

/**
 * Business type is shown as an icon rather than its words wherever it sits in
 * a dense meta line (search cards, the profile header) — the labels are long
 * relative to the space and were crowding out price/location. The label map
 * above is still the source of the accessible name for each glyph, so the two
 * can never describe different things; keep them in sync when adding a value.
 * These use the consistent outline set from Expo Ionicons.
 */
export const BUSINESS_TYPE_ICON: Record<NonNullable<ProviderProfileData['businessType']>, string> = {
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

/** Selects a readable accent against known provider gradient presets. */
export function getAdaptiveAccentColor(gradient: [string, string, ...string[]]): string {
  const colorMap: Record<string, string> = {
    '#FF6B6B': '#C2185B',
    '#FF4500': '#7B1FA2',
    '#FF69B4': '#6A1B9A',
    '#E6E6FA': '#4A148C',
    '#708090': '#3F51B5',
    '#99FFCC': '#00838F',
    '#1B4332': '#E91E63',
    '#FFE4B5': '#E65100',
    '#D4A574': '#8D4E85',
  };
  return colorMap[gradient[0]] || '#7B1FA2';
}

/** Whether the profile should expose its Policy tab. */
export function hasProviderPolicyInfo(provider: ProviderProfileData): boolean {
  const policy = provider.bookingPolicies;
  return (
    provider.cancellationNoticeHours > 0 ||
    Boolean(
      policy && (
        (policy.depositRequired && policy.depositAmount) ||
        (policy.cancelNotice && policy.cancelNotice !== 'none') ||
        policy.rescheduleNotice ||
        policy.maxReschedules ||
        (policy.noShowAction && policy.noShowAction !== 'none')
      ),
    )
  );
}
