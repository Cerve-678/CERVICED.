// The provider's own words and menu, shaped for ProfileStylePreview — shared by
// Branding's outline preview and Info Reg's full one, so both read a provider's
// categories and services the same way.

import { serviceDurationToMinutes } from '../../services/providerRegistrationService';
import type { PreviewContent, PreviewService } from './ProfileStylePreview';
import { BUSINESS_TYPE_LABEL } from './profilePresentation';

interface DraftService {
  name: string;
  price: number;
  duration: string;
  images?: readonly { uri?: string | null }[] | null;
  /** The add-ons ticked on this service (keys into addOnLibrary). */
  addOnKeys?: readonly string[] | null;
}

interface DraftAddOn {
  key: string;
  name: string;
  price: number;
  extraMinutes: number;
  /** false = paused, so clients can't pick it. */
  isActive: boolean;
}

export interface DraftMenu {
  aboutText?: string | null;
  categories?: Readonly<Record<string, readonly DraftService[]>> | null;
  categoryDescriptions?: Readonly<Record<string, string>> | null;
  addOnLibrary?: readonly DraftAddOn[] | null;
}

/** Categories with at least one named service (an empty one isn't shown on
 *  the profile), each with its services in order. */
export function previewContentFrom(menu: DraftMenu): PreviewContent {
  const activeAddOns = (menu.addOnLibrary ?? []).filter(addOn => addOn.isActive);
  const servicesByCategory: Record<string, PreviewService[]> = {};
  for (const [category, list] of Object.entries(menu.categories ?? {})) {
    const services = (list ?? [])
      .filter(service => service.name.trim())
      .map(service => ({
        name: service.name.trim(),
        minutes: serviceDurationToMinutes(service.duration),
        price: service.price,
        imageUri: service.images?.find(image => !!image?.uri)?.uri ?? null,
        // The add-ons ticked on it that clients can pick (paused ones hidden).
        addOns: activeAddOns
          .filter(addOn => service.addOnKeys?.includes(addOn.key))
          .map(addOn => ({ key: addOn.key, name: addOn.name, price: addOn.price, extraMinutes: addOn.extraMinutes })),
      }));
    if (services.length > 0) servicesByCategory[category] = services;
  }
  const categories = Object.keys(servicesByCategory);
  return {
    about: menu.aboutText ?? '',
    categories,
    services: categories[0] ? servicesByCategory[categories[0]]!.slice(0, 2) : [],
    servicesByCategory,
    categoryDescriptions: { ...(menu.categoryDescriptions ?? {}) },
  };
}

export interface HeroLabelSource {
  serviceCategories?: readonly string[] | null;
  providerService?: string | null;
  customServiceType?: string | null;
  location?: string | null;
  businessType?: keyof typeof BUSINESS_TYPE_LABEL | '' | null;
}

/** The line the profile prints under the name, Cover's pills, and the
 *  "LASHES · BROWS" kicker, from what the provider has filled in. */
export function heroLabelsFrom(data: HeroLabelSource): { metaLabels: string[]; pillLabels: string[]; kicker: string; location: string } {
  const types = (data.serviceCategories?.length ? data.serviceCategories : [data.providerService ?? ''])
    .filter(Boolean)
    .map(type => (type === 'OTHER' ? data.customServiceType || 'SERVICE' : type).toUpperCase());
  const where = data.location ? [data.location.toUpperCase()] : [];
  const how = data.businessType ? [BUSINESS_TYPE_LABEL[data.businessType].toUpperCase()] : [];
  return {
    metaLabels: [...new Set([...types, ...where])],
    // Cover's pills leave out what they do, as the profile does.
    pillLabels: [...new Set([...where, ...how])],
    kicker: [...new Set(types)].join(' · '),
    location: data.location ?? '',
  };
}
