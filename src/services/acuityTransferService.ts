// src/services/acuityTransferService.ts
// Lets a signed-in provider paste their Acuity Scheduling (or similar) page
// URL and pulls their services/pricing/business info into
// ProviderRegistrationData. The actual fetch + Claude extraction runs in the
// extract-provider-profile Edge Function — keeping it server-side means the
// Anthropic API key never ships inside the app bundle, and the same function
// is reused by the batch scrape pipeline.
import { supabase } from '../lib/supabase';
import { ProviderRegistrationData } from './providerRegistrationService';

interface ExtractedProfile {
  providerName?: string;
  location?: string;
  aboutText?: string;
  slotsText?: string;
  serviceCategory?: string;
  phone?: string;
  email?: string;
  instagram?: string;
  website?: string;
  categories?: Record<string, { name?: string; price?: number | string; duration?: string; description?: string }[]>;
}

export async function transferFromAcuity(url: string): Promise<ProviderRegistrationData> {
  const { data, error } = await supabase.functions.invoke('extract-provider-profile', {
    body: { url, sourceType: 'acuity' },
  });

  if (error) throw new Error(error.message || 'Could not extract data from that link. Please try again.');

  const extracted: ExtractedProfile = data?.extracted ?? {};

  const categories: ProviderRegistrationData['categories'] = {};
  let serviceId = 1;

  for (const [catName, services] of Object.entries(extracted.categories ?? {})) {
    categories[catName] = services.map((svc) => ({
      id: serviceId++,
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
    }));
  }

  return {
    providerName: extracted.providerName || '',
    providerService: extracted.serviceCategory || 'OTHER',
    customServiceType:
      extracted.serviceCategory === 'OTHER' ? (extracted.providerName || '') : '',
    location: extracted.location || '',
    aboutText: extracted.aboutText || '',
    slotsText: extracted.slotsText || '',
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
    whatsapp: '',
    preferredContactMethods: ['in_app'],
    externalBookingUrl: '',
    yearsExperience: '',
    businessType: '',
    teamSize: '',
    accessibilityNotes: '',
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
