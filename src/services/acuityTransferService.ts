// src/services/acuityTransferService.ts
// Lets a signed-in provider paste their Acuity Scheduling (or similar) page
// URL and pulls their services/pricing/business info into
// ProviderRegistrationData. The actual fetch + Claude extraction runs in the
// extract-provider-profile Edge Function — keeping it server-side means the
// Anthropic API key never ships inside the app bundle, and the same function
// is reused by the batch scrape pipeline.
import { ProviderRegistrationData } from './providerRegistrationService';
import { extractProviderProfileFromUrl } from './databaseService';
import { reportError } from '../utils/logger';

interface ExtractedProfile {
  providerName?: string;
  location?: string;
  aboutText?: string;
  serviceCategory?: string;
  phone?: string;
  email?: string;
  instagram?: string;
  website?: string;
  categories?: Record<string, { name?: string; price?: number | string; duration?: string; description?: string }[]>;
}

export async function transferFromAcuity(url: string): Promise<ProviderRegistrationData> {
  let data: unknown;
  try {
    data = await extractProviderProfileFromUrl(url, 'acuity');
  } catch (error) {
    // An edge-function invoke error reads like "Edge Function returned a non-2xx
    // status code" — true, and useless to a provider. Log the real one, throw copy.
    reportError(error, 'acuityTransferService.invoke');
    throw new Error('Could not read that page. Please check the link and try again.');
  }

  const extracted: ExtractedProfile =
    (data as { extracted?: ExtractedProfile } | null)?.extracted ?? {};

  const categories: ProviderRegistrationData['categories'] = {};
  let serviceId = 1;

  for (const [catName, services] of Object.entries(extracted.categories ?? {})) {
    categories[catName] = services.map((svc) => ({
      id: serviceId++,
      dbId: null,
      name: svc.name || 'Unnamed Service',
      price: Number(svc.price) || 0,
      duration: svc.duration || '1 hr',
      bufferBeforeMins: null,
      bufferAfterMins: null,
      description: svc.description || '',
      images: [],
      addOns: [],
      tags: [],
      techniqueTags: [],
      outcomeTags: [],
      occasionTags: [],
      trendNames: [],
      isPregnancySafe: false,
      patchTestRequired: false,
      minAge: null,
      contraindications: [],
      aftercareNotes: '',
      serviceType: '' as const,
      hairTypesSuitable: [],
      audience: '' as const,
    }));
  }

  return {
    providerName: extracted.providerName || '',
    providerService: extracted.serviceCategory || 'OTHER',
    customServiceType:
      extracted.serviceCategory === 'OTHER' ? (extracted.providerName || '') : '',
    location: extracted.location || '',
    aboutText: extracted.aboutText || '',
    // Acuity has no equivalent concept to import — provider sets this
    // themselves afterward via InfoRegScreen/ProviderAutomationsScreen.
    scheduleReleaseDay: null,
    gradient: ['#FF6B6B', '#4ECDC4', '#45B7D1'],
    hasCustomGradient: false,
    accentColor: '#7B1FA2',
    profileTheme: 'app',
    logo: null,
    categories,
    categoryDescriptions: {},
    phone: extracted.phone || '',
    email: extracted.email || '',
    instagram: extracted.instagram || '',
    website: extracted.website || '',
    // Acuity has nothing equivalent to import — same as whatsapp below.
    tiktok: '',
    whatsapp: '',
    preferredContactMethods: ['in_app'],
    externalBookingUrl: '',
    yearsExperience: '',
    businessType: '',
    teamSize: '',
    accessibilityNotes: '',
    termsAcceptedAt: null,
    languagesSpoken: [],
    priceRange: '',
    serviceLocations: [],
    preferredPaymentMethods: [],
    fullAddress: '',
    fullAddressCoordinates: null,
    addressReleasePolicy: 'on_confirmation',
    backgroundImage: null,
    isVerified: false,
    rating: 0,
    bookingPolicies: null,
    cancellationNoticeHours: 0,
  };
}
