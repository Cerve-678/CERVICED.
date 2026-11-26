// Carries a provider's sign-up answers into their business profile.
//
// Sign-up (SignUpStep4/5) can't write to `providers` — that row doesn't exist
// until InfoReg's first save — so its answers are staged on `users`
// (EmailVerificationScreen / upgradeUserToProvider) and copied across here.
// Every field is fill-blanks-only: a value already on the profile always wins.
//
// Used in two places in InfoRegScreen: the first save of a brand-new profile,
// and the first load after claiming an existing listing. A claimed listing
// arrives with a providers row already in place, so without the second call
// everything the owner answered at sign-up — price ranges included — was
// silently left behind on `users`.
import type { ProviderRegistrationData } from '../../services/providerRegistrationService';
import { BUSINESS_TYPE_OPTS } from '../business-details/options';
import { PRICE_BANDS, tierForBands } from '../../constants/priceBands';

/** What getUserSignupPrefillInfo reads back from `users`. */
export interface SignupPrefill {
  name: string | null;
  phone: string | null;
  business_name: string | null;
  business_email: string | null;
  business_phone: string | null;
  business_type: string | null;
  instagram: string | null;
  website: string | null;
  tiktok: string | null;
  location_text: string | null;
  years_experience: number | null;
  team_size: string | null;
  accessibility_notes: string | null;
  languages_spoken: string[] | null;
  price_range: string | null;
  price_bands: string[] | null;
  preferred_contact_methods: string[] | null;
  preferred_payment_methods: string[] | null;
  service_locations: string[] | null;
  external_booking_url: string | null;
}

const TEAM_SIZES: ProviderRegistrationData['teamSize'][] = ['solo', 'small_team', 'large_team'];
const PRICE_TIERS: ProviderRegistrationData['priceRange'][] = ['budget', 'mid', 'premium', 'luxury'];
const BAND_VALUES: readonly string[] = PRICE_BANDS.map(band => band.value);

/**
 * The price answer as the profile stores it. Bands are the real answer and
 * the tier is derived from them the same way Services & Pricing saves it, so
 * providers.price_tier can't disagree with providers.price_bands. A tier on
 * its own (staged before price bands existed) is kept as it was.
 */
export function signupPricing(
  prefill: Pick<SignupPrefill, 'price_bands' | 'price_range'>,
): Pick<ProviderRegistrationData, 'priceBands' | 'priceRange'> {
  const priceBands = (prefill.price_bands ?? []).filter(band => BAND_VALUES.includes(band));
  if (priceBands.length) return { priceBands, priceRange: tierForBands(priceBands) };
  return { priceBands: [], priceRange: PRICE_TIERS.find(tier => tier === prefill.price_range) ?? '' };
}

export function fillProfileFromSignup(
  prev: ProviderRegistrationData,
  prefill: SignupPrefill,
): ProviderRegistrationData {
  const businessType = BUSINESS_TYPE_OPTS.map(o => o.value).find(v => v === prefill.business_type);
  // No longer asked at sign-up (removed with the sign-up redesign, #67, since
  // teams aren't supported yet) — only accounts staged before then have one.
  const teamSize = TEAM_SIZES.find(v => v === prefill.team_size);
  const pricing = signupPricing(prefill);
  const pricingUnset = !prev.priceBands.length && !prev.priceRange;

  return {
    ...prev,
    providerName: prev.providerName || prefill.business_name || prefill.name || '',
    phone: prev.phone || prefill.business_phone || prefill.phone || '',
    email: prev.email || prefill.business_email || '',
    instagram: prev.instagram || prefill.instagram || '',
    website: prev.website || prefill.website || '',
    // Asked on SignUpStep1 ("I use my own booking link").
    externalBookingUrl: prev.externalBookingUrl || prefill.external_booking_url || '',
    tiktok: prev.tiktok || prefill.tiktok || '',
    businessType: prev.businessType || businessType || '',
    teamSize: prev.teamSize || teamSize || '',
    // Optional at sign-up. String form because the field (and the hero
    // preview) are string-typed.
    yearsExperience: prev.yearsExperience || (prefill.years_experience != null ? String(prefill.years_experience) : ''),
    location: prev.location || prefill.location_text || '',
    accessibilityNotes: prev.accessibilityNotes || prefill.accessibility_notes || '',
    languagesSpoken: prev.languagesSpoken.length ? prev.languagesSpoken : (prefill.languages_spoken ?? []),
    // Bands and tier move together, never one from each source.
    priceBands: pricingUnset ? pricing.priceBands : prev.priceBands,
    priceRange: pricingUnset ? pricing.priceRange : prev.priceRange,
    // Round-trip only — InfoReg neither shows nor owns contact channels
    // (Communications does). Carried because saveProviderToSupabase writes
    // preferred_contact_methods on every save, so dropping it would reset the
    // Communications toggles to ['in_app'] whenever anything in InfoReg is
    // edited. ['in_app'] alone is the form's default, not an answer.
    preferredContactMethods: (prev.preferredContactMethods.length && prev.preferredContactMethods[0] !== 'in_app')
      ? prev.preferredContactMethods
      : (prefill.preferred_contact_methods?.length ? prefill.preferred_contact_methods : prev.preferredContactMethods),
    serviceLocations: prev.serviceLocations.length ? prev.serviceLocations : (prefill.service_locations ?? []),
    preferredPaymentMethods: prev.preferredPaymentMethods.length ? prev.preferredPaymentMethods : (prefill.preferred_payment_methods ?? []),
  };
}
