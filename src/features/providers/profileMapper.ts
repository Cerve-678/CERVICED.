import type { ProviderWithServices } from '../../types/database';
import { formatServiceDuration } from './profilePresentation';
import type { ProviderProfileData, ProviderProfileService } from './profileTypes';

/** Converts the database provider model into the client profile view model. */
export function mapProviderProfileData(provider: ProviderWithServices): ProviderProfileData {
  const categories: Record<string, ProviderProfileService[]> = {};
  const categoryDescriptions: Record<string, string> = {};
  const categoriesByType: Record<string, Record<string, ProviderProfileService[]>> = {};

  // A service written before services.service_category existed reads as the
  // provider's headline type — which is exactly what it meant back then. The
  // DB trigger stamps new rows, so this only covers rows in flight.
  const typeOf = (service: ProviderWithServices['services'][number]): string =>
    service.service_category ?? provider.service_category;

  provider.services.forEach((service, index) => {
    const category = service.category_name;
    const serviceType = typeOf(service);
    if (!categories[category]) categories[category] = [];
    if (!categoriesByType[serviceType]) categoriesByType[serviceType] = {};
    const typeBucket = categoriesByType[serviceType] as Record<
      string,
      ProviderProfileService[]
    >;
    if (!typeBucket[category]) typeBucket[category] = [];
    if (service.category_description && !categoryDescriptions[category]) {
      categoryDescriptions[category] = service.category_description;
    }

    const mapped: ProviderProfileService = {
      id: index,
      dbId: service.id,
      name: service.name,
      price: Number(service.price),
      duration: formatServiceDuration(service.duration_minutes),
      description: service.description ?? '',
      image: null,
      images: [...service.images]
        .sort((left, right) => left.sort_order - right.sort_order)
        .map(image => ({ uri: image.url })),
      addOns: service.add_ons
        .filter(addOn => addOn.is_active)
        .map(addOn => ({
          id: addOn.id,
          name: addOn.name,
          price: Number(addOn.price),
          description: addOn.description ?? '',
        })),
      isPregnancySafe: service.is_pregnancy_safe,
      patchTestRequired: service.patch_test_required,
      minAge: service.min_age,
      contraindications: service.contraindications ?? [],
      aftercareNotes: service.aftercare_notes ?? '',
      serviceType: service.service_type ?? null,
    };

    categories[category].push(mapped);
    (typeBucket[category] as ProviderProfileService[]).push(mapped);
  });

  // Ordered by the provider's declared set, so the switch reads in the order
  // they chose at sign-up rather than whatever order services came back in.
  // Only types with at least one live service appear — a declared-but-empty
  // type is visible to the provider on their own screen, never to a client.
  const declared = provider.service_categories?.length
    ? provider.service_categories
    : [provider.service_category];
  const serviceTypes = [
    ...declared.filter(type => categoriesByType[type]),
    // Defensive: a service stamped with a type missing from the declared set
    // (a set edited after the fact) would otherwise be silently unreachable.
    ...Object.keys(categoriesByType).filter(type => !declared.includes(type as never)),
  ];

  return {
    id: provider.slug,
    displayName: provider.display_name,
    providerName: provider.display_name.toUpperCase(),
    providerService: provider.service_category,
    providerLogo: provider.logo_url ? { uri: provider.logo_url } : null,
    location: provider.location_text ?? '',
    businessType: provider.business_type ?? null,
    rating: Number(provider.rating),
    scheduleReleaseDay: provider.automation_settings?.scheduleReleaseDay ?? null,
    aboutText: provider.about_text ?? '',
    gradient: (provider.gradient && provider.gradient.length >= 2
      ? provider.gradient
      : ['#AF9197', '#C4A8AD']) as [string, string, ...string[]],
    hasCustomGradient: Boolean(provider.gradient && provider.gradient.length >= 2),
    accentColor: provider.accent_color ?? null,
    backgroundImage: provider.background_image_url ?? null,
    profileTheme: provider.profile_theme ?? 'app',
    categories,
    categoryDescriptions,
    serviceTypes,
    categoriesByType,
    phone: provider.phone ?? '',
    email: provider.email ?? '',
    instagram: provider.instagram ?? '',
    website: provider.website ?? '',
    externalBookingUrl: provider.external_booking_url ?? null,
    yearsExperience: provider.years_experience ? String(provider.years_experience) : '',
    specialties: provider.specialties?.map(specialty => specialty.specialty) ?? [],
    customServiceType: provider.custom_service_type ?? '',
    whatsapp: provider.whatsapp_number ?? '',
    isVerified: provider.is_verified ?? false,
    preferredContactMethods: provider.preferred_contact_methods ?? [],
    onlineConsultationsAvailable: provider.online_consultations_available ?? false,
    accessibilityTags: provider.accessibility_notes?.split('|').filter(Boolean) ?? [],
    languagesSpoken: provider.languages_spoken ?? [],
    qualifications: provider.qualifications ?? '',
    isInsuredSelfDeclared: provider.is_insured_self_declared ?? false,
    dbsCheckedSelfDeclared: provider.dbs_checked_self_declared ?? false,
    teamSize: provider.team_size ?? null,
    walkInsWelcome: provider.walk_ins_welcome ?? false,
    groupBookingsAvailable: provider.group_bookings_available ?? false,
    veganCrueltyFree: provider.vegan_cruelty_free ?? false,
    travelRadius: provider.travel_radius ?? '',
    productsUsed: provider.products_used ?? '',
    bookingPolicies: provider.booking_policies ?? null,
    cancellationNoticeHours: provider.cancellation_notice_hours ?? 0,
    waitlistEnabled: provider.automation_settings?.waitlistEnabled !== false,
  };
}
