/**
 * Additional Information on a provider's profile: the chip groups, the
 * "Good to know" sentence and the public directions. Pure, so the client
 * profile and the provider's own preview on Policies & Info show the same
 * thing and can't drift apart.
 *
 * Practice details the provider fills in across Business Profile (About You,
 * Services & Pricing, Scheduling, Payments, Edit Profile). They're facts about
 * how the business operates rather than anything bookable.
 *
 * Insured / DBS are ALWAYS suffixed "(self-declared)". Cerviced verifies
 * neither, and an unqualified "DBS checked" chip on a beauty marketplace reads
 * as a platform guarantee — see AboutYouScreen.tsx, which carries the same
 * warning at the point of collection.
 *
 * Grouped, not one undifferentiated chip row: "Polish", "Just me",
 * "Insured (self-declared)" and "Step-free access" are four different kinds of
 * fact, and side by side with no subheading a client has to work out what each
 * chip is even answering.
 */
import { PAYMENT_OPTS } from '../business-details/options';
import { BUSINESS_TYPE_LABEL } from './profilePresentation';
import type { ProviderProfileData } from './profileTypes';
import { productsGroup, workWithGroups, type ChipGroup } from './workWith';
import type { PageStyle } from '../../constants/pageStyles';
import { tr } from '../../i18n/translate';

// Client-facing wording for providers.team_size.
const TEAM_SIZE_LABELS: Record<string, string> = {
  solo: 'Solo practitioner',
  small_team: 'Small team',
  large_team: 'Large team',
};

export function additionalInfoGroups(
  provider: ProviderProfileData,
  pageStyle: Pick<PageStyle, 'key' | 'hero'>,
): ChipGroup[] {
  const groups: ChipGroup[] = [];
  // First, because it's what clients most often scan for ("do they do
  // knotless?"). Same values Search's Speciality filter matches on. A
  // link-only profile shows them in their own section instead.
  if (provider.specialties.length > 0 && !provider.isLinkOnly) {
    groups.push({ label: tr('discover.profile.specialities'), chips: [...provider.specialties] });
  }
  // What they do (Nails, Lashes…). Cover and Duet leave it out of the top
  // of the page, so it's said here instead (owner, 2026-11-15).
  if (pageStyle.hero === 'cover' || pageStyle.hero === 'duet') {
    const types = provider.serviceTypes.length ? provider.serviceTypes : [provider.providerService];
    const chips = [...new Set(types.map((type) => {
      const label = type === 'OTHER' ? provider.customServiceType || 'Service' : type;
      return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
    }))];
    if (chips.length > 0) groups.push({ label: tr('discover.page.category'), chips });
  }
  // Salon, studio, home-based or mobile. Classic already shows it as the
  // icon in the line under the name; most page styles' heroes have no such
  // line, so there it is said here in words (owner, 2026-11-15).
  if (provider.businessType && pageStyle.key !== 'classic') {
    groups.push({ label: tr('discover.page.businessType'), chips: [BUSINESS_TYPE_LABEL[provider.businessType]] });
  }
  // Who they work with (clients, skin tones, hair types) from About You's
  // "I Work With" — here, not in the About/Policy card, which is the bio.
  groups.push(...workWithGroups(provider));
  // Its own section, from Services & Pricing's "Products I Work With".
  const products = productsGroup(provider);
  if (products) groups.push(products);
  if (provider.languagesSpoken.length > 0) {
    groups.push({ label: tr('discover.profile.languages'), chips: [...provider.languagesSpoken] });
  }
  const teamLabel = provider.teamSize ? TEAM_SIZE_LABELS[provider.teamSize] : null;
  if (teamLabel) groups.push({ label: tr('discover.profile.team'), chips: [teamLabel] });
  const credentials: string[] = [];
  if (provider.isInsuredSelfDeclared) credentials.push('Insured (self-declared)');
  if (provider.dbsCheckedSelfDeclared) credentials.push('DBS checked (self-declared)');
  if (credentials.length > 0) groups.push({ label: tr('discover.profile.credentials'), chips: credentials });
  if (provider.accessibilityTags.length > 0) {
    groups.push({ label: tr('discover.profile.accessibility'), chips: [...provider.accessibilityTags] });
  }
  // The provider's stated preference only (Payments, or Business Info for a
  // link-only pro) — Cerviced doesn't collect or track off-app payments.
  // Labelled from the shared PAYMENT_OPTS so this can't drift from the
  // pickers that write it.
  const paymentLabels = provider.paymentMethods
    .map(v => PAYMENT_OPTS.find(o => o.value === v)?.label)
    .filter((l): l is string => !!l);
  if (paymentLabels.length > 0) groups.push({ label: tr('discover.profile.paymentMethods'), chips: paymentLabels });
  return groups;
}

/** One natural-language sentence rather than a label/value dump — these are
 *  unrelated one-liners a client only skims. '' when there's nothing to say. */
export function goodToKnowText(provider: ProviderProfileData): string {
  const sentences: string[] = [];
  if (provider.walkInsWelcome) sentences.push('Walk-ins are welcome');
  if (provider.groupBookingsAvailable) sentences.push('Group bookings are available');
  return sentences.length > 0 ? `${sentences.join('. ')}.` : '';
}

/** Public directions. A mobile provider travels to the client, so there is
 *  nowhere to direct them to — an old value left from before a business-type
 *  change stays hidden. */
export function howToGetThere(provider: ProviderProfileData): string {
  return provider.businessType === 'mobile' ? '' : provider.publicDirections ?? '';
}
