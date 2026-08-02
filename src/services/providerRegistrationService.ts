// src/services/providerRegistrationService.ts
// Phase 2: Provider registration — save to and load from Supabase
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';
import { logger } from '../utils/logger';
import { setMyProviderFullAddress } from './databaseService';

// ── Shared types (mirror InfoRegScreen / ProviderMyProfileScreen) ───────────

export interface AddOnData {
  id: number;
  name: string;
  price: number;
}

export interface ServiceData {
  id: number;
  name: string;
  price: number;
  duration: string;
  // Blank = no override. before defaults to 0; after inherits the provider's global buffer.
  bufferBeforeMins: number | null;
  bufferAfterMins: number | null;
  description: string;
  images: string[];
  addOns: AddOnData[];
  tags: string[];
  techniqueTags: string[];
  outcomeTags: string[];
  occasionTags: string[];
  trendNames: string[];
  isPregnancySafe: boolean;
  patchTestRequired: boolean;
  minAge: number | null;
  contraindications: string[];
  aftercareNotes: string;
  serviceType: 'treatment' | 'enhancement' | 'maintenance' | 'restorative' | 'consultation' | '';
}

export interface ProviderRegistrationData {
  providerName: string;
  providerService: string;
  customServiceType: string;
  location: string;
  aboutText: string;
  slotsText: string;
  gradient: [string, string, ...string[]];
  // True only when `providers.gradient` was genuinely non-null in the DB —
  // computed BEFORE the `gradient` field above gets its hardcoded fallback
  // applied, so it still distinguishes "no gradient saved yet" (fall back to
  // the resolved theme's own hero colour) from "gradient saved" the same way
  // ProviderProfileScreen's raw-DB read does. Checking `gradient.length >= 2`
  // downstream doesn't work for that, since `gradient` above is never empty
  // by the time callers see it.
  hasCustomGradient: boolean;
  accentColor: string;
  profileTheme: string; // encoded colour-theme key (see src/constants/providerThemes.ts)
  logo: string | null;
  categories: Record<string, ServiceData[]>;
  // Shown to clients under the category tab once selected — keyed the same
  // as `categories`, but optional per key since older/imported categories
  // may not have one yet.
  categoryDescriptions: Record<string, string>;
  // Contact info displayed to clients
  phone: string;
  email: string;
  instagram: string;
  website: string;
  // Set via the separate Communications settings screen, not this form —
  // but the client-facing Contact card gates which rows show by these, so a
  // faithful preview of that card needs them too.
  whatsapp: string;
  preferredContactMethods: string[];
  // When set, clients booking this provider are sent to this URL (Fresha,
  // Treatwell, Acuity, etc.) instead of Cerviced's in-app booking flow.
  externalBookingUrl: string;
  yearsExperience: string;
  // Address privacy
  businessType: 'salon' | 'studio' | 'home_based' | 'mobile' | '';
  fullAddress: string;
  addressReleasePolicy: 'always' | 'on_confirmation' | 'day_before' | 'two_days_before' | 'three_days_before' | 'five_days_before' | 'week_before' | 'manual';
  // Cover photo set via Branding & Style (providers.background_image_url) —
  // not editable from this form, but the client-facing hero uses it as the
  // backdrop instead of the gradient when set, so any faithful preview of
  // that hero needs it too.
  backgroundImage: string | null;
  isVerified: boolean;
  // Denormalised average (providers.rating) — same value clients see.
  rating: number;
  // Descriptive policy text set via this form's own Policies tab
  // (providers.booking_policies, JSONB) — read-only mirror here.
  bookingPolicies: {
    cancelNotice?: string;
    cancelPenalty?: string;
    cancelNote?: string;
    rescheduleNotice?: string;
    maxReschedules?: string;
    depositRequired?: boolean;
    depositOnly?: boolean;
    depositType?: string;
    depositAmount?: string;
    noShowAction?: string;
    policyImageUrl?: string;
  } | null;
  // Enforced cancellation window (providers.cancellation_notice_hours) — set
  // via the separate Automations screen, not this form, but the client-facing
  // Policy tab prefers it over bookingPolicies.cancelNotice when both exist.
  cancellationNoticeHours: number;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function isLocalUri(uri: string): boolean {
  return (
    uri.startsWith('file://') ||
    uri.startsWith('content://') ||
    uri.startsWith('ph://')
  );
}

export async function uploadToStorage(
  bucket: string,
  storagePath: string,
  localUri: string
): Promise<string> {
  const ext = localUri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';

  // Use expo-file-system to read the local file reliably on both iOS and Android.
  // fetch(localUri) can fail with "Network request failed" for file:// URIs in RN.
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Decode base64 → Uint8Array (no extra packages needed)
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  const { error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, bytes, { contentType, upsert: true });

  if (error) throw new Error(`Upload failed (${bucket}/${storagePath}): ${error.message}`);

  const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);
  return data.publicUrl;
}

function parseDurationToMinutes(duration: string): number {
  if (!duration) return 60;
  const lower = duration.toLowerCase().trim();
  // "1 hr 30 mins" / "2 hours 15 min"
  const hrMin = lower.match(/(\d+)\s*h(?:r|our)?s?\s*(\d+)\s*m/);
  if (hrMin) return parseInt(hrMin[1] ?? '0') * 60 + parseInt(hrMin[2] ?? '0');
  // "1.5 hours" / "2hrs"
  const decHr = lower.match(/^(\d+\.?\d*)\s*h/);
  if (decHr) return Math.round(parseFloat(decHr[1] ?? '0') * 60);
  // "90 mins" / "45"
  const mins = lower.match(/(\d+)/);
  if (mins) return parseInt(mins[1] ?? '0');
  return 60;
}

function minutesToDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} mins`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hrs} hr${hrs > 1 ? 's' : ''}`;
  return `${hrs} hr ${mins} mins`;
}

function generateSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 50) || 'provider'
  );
}

// Coarse UK bounding box — enough to catch a wildly wrong geocode (a real
// production row's public location_text is literally "New York"; nothing
// today stops the same mistake for the real address either).
const UK_BOUNDS = { minLat: 49.8, maxLat: 60.9, minLng: -8.2, maxLng: 1.8 };

// Loose UK postcode shape, checked as a substring of a freeform address line
// (not an anchored full-string match) — a cheap pre-check to reject obvious
// garbage before spending a geocode call.
const UK_POSTCODE_PATTERN = /[A-Za-z]{1,2}\d[A-Za-z\d]?\s*\d[A-Za-z]{2}/;

/**
 * Validates a provider's real business address is a genuine, geocodable UK
 * location before it's ever saved. No third-party address-lookup API — just
 * a format pre-check plus the same on-device geocoding already used for the
 * public location text (Location.geocodeAsync), plus a coarse UK bounds
 * check on the result. Required for every business_type now, including
 * 'mobile' (a private base address, never shown to clients — see
 * require_provider_address.sql).
 *
 * Throws a specific, user-facing message on any failure. Callers should let
 * it propagate rather than catch-and-swallow.
 */
export async function geocodeAndValidateUkAddress(
  address: string
): Promise<{ latitude: number; longitude: number }> {
  const trimmed = address.trim();
  if (!trimmed) {
    throw new Error('Please enter your business address.');
  }
  if (!UK_POSTCODE_PATTERN.test(trimmed)) {
    throw new Error('Please include a valid UK postcode in your address.');
  }

  let match: Location.LocationGeocodedLocation | undefined;
  try {
    [match] = await Location.geocodeAsync(trimmed);
  } catch {
    match = undefined;
  }
  if (!match) {
    throw new Error("We couldn't find that address — please check it and try again.");
  }

  const { latitude, longitude } = match;
  if (
    latitude < UK_BOUNDS.minLat || latitude > UK_BOUNDS.maxLat ||
    longitude < UK_BOUNDS.minLng || longitude > UK_BOUNDS.maxLng
  ) {
    throw new Error("That address doesn't look like it's in the UK — please check it and try again.");
  }

  return { latitude, longitude };
}

// ── saveProviderToSupabase ───────────────────────────────────────────────────
// Upserts the provider row, uploads images, replaces services/images/add-ons.
// Also updates the user's role to 'provider' and refreshes the AsyncStorage cache.

export async function saveProviderToSupabase(
  userId: string,
  data: ProviderRegistrationData
): Promise<void> {
  // 0. Validate the real business address before anything else happens —
  // required for every business_type now, including 'mobile' (a private base
  // address, never shown to clients). Fails fast, before any upload or DB
  // write, so a bad address never leaves partial state behind.
  const addressCoords = await geocodeAndValidateUkAddress(data.fullAddress || '');

  // 1. Upload logo if it's a local file
  let logoUrl: string | null = data.logo;
  if (data.logo && isLocalUri(data.logo)) {
    logoUrl = await uploadToStorage(
      'provider-logos',
      `${userId}/logo.jpg`,
      data.logo
    );
  }

  // 1b. Best-effort geocode of the public location text into lat/lng, so
  // "Near You" has real coordinates to rank on — this column was previously
  // never written at all. Deliberately geocodes `data.location` (the public,
  // provider-chosen text — a salon might type a full address there; a
  // home-based provider might only type "North West London") rather than
  // the private, release-gated full address in provider_private_details
  // (restrict_provider_full_address.sql) — that one stays untouched by this,
  // since piping it into a publicly-readable column would leak the exact
  // address before the provider's chosen release policy allows it. A vague
  // public location just geocodes to a vague (safe) coordinate, which is the
  // correct behaviour, not a bug. Never blocks the save on failure.
  let latitude: number | undefined;
  let longitude: number | undefined;
  if (data.location?.trim()) {
    try {
      const [match] = await Location.geocodeAsync(data.location.trim());
      if (match) {
        latitude = match.latitude;
        longitude = match.longitude;
      }
    } catch {
      // Silent failure — providers row keeps whatever lat/lng it already had
    }
  }

  // 2. Upsert provider row
  const { data: existingProvider, error: existingProviderError } = await supabase
    .from('providers')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  // maybeSingle() errors (rather than returning null) if more than one row
  // matches — if we ignore that, the code below falls through to inserting a
  // duplicate provider row instead of updating the existing one, and future
  // edits silently split across rows. Fail loudly instead.
  if (existingProviderError) {
    throw new Error(`Provider lookup failed: ${existingProviderError.message}`);
  }

  let providerId: string;

  if (existingProvider) {
    const { error } = await supabase
      .from('providers')
      .update({
        display_name: data.providerName,
        service_category: data.providerService,
        custom_service_type: data.customServiceType || null,
        location_text: data.location,
        latitude,
        longitude,
        about_text: data.aboutText,
        slots_text: data.slotsText,
        logo_url: logoUrl,
        gradient: data.gradient,
        accent_color: data.accentColor,
        profile_theme: data.profileTheme || 'app',
        phone: data.phone || null,
        email: data.email || null,
        instagram: data.instagram || null,
        website: data.website || null,
        external_booking_url: data.externalBookingUrl?.trim() || null,
        years_experience: data.yearsExperience ? parseInt(data.yearsExperience) : null,
        business_type: data.businessType || null,
        address_release_policy: data.addressReleasePolicy || 'on_confirmation',
        is_active: true,
      })
      .eq('id', existingProvider.id);
    if (error) throw new Error(`Provider update failed: ${error.message}`);
    providerId = existingProvider.id;
  } else {
    // Generate unique slug
    let slug = generateSlug(data.providerName);
    const { data: slugExists } = await supabase
      .from('providers')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (slugExists) slug = `${slug}-${userId.substring(0, 8)}`;

    const { data: newProvider, error } = await supabase
      .from('providers')
      .insert({
        user_id: userId,
        slug,
        display_name: data.providerName,
        service_category: data.providerService,
        custom_service_type: data.customServiceType || null,
        location_text: data.location,
        latitude,
        longitude,
        about_text: data.aboutText,
        slots_text: data.slotsText,
        logo_url: logoUrl,
        gradient: data.gradient,
        accent_color: data.accentColor,
        profile_theme: data.profileTheme || 'app',
        phone: data.phone || null,
        email: data.email || null,
        instagram: data.instagram || null,
        website: data.website || null,
        external_booking_url: data.externalBookingUrl?.trim() || null,
        years_experience: data.yearsExperience ? parseInt(data.yearsExperience) : null,
        business_type: data.businessType || null,
        address_release_policy: data.addressReleasePolicy || 'on_confirmation',
        is_active: true,
      })
      .select('id')
      .single();
    if (error) throw new Error(`Provider insert failed: ${error.message}`);
    providerId = newProvider.id;
  }

  // The street address lives in the owner-only provider_private_details table,
  // not on `providers` — that table is readable by every authenticated user and
  // RLS can't hide a single column, so keeping the address there leaked it to
  // clients on every browse. See restrict_provider_full_address.sql. Real
  // coordinates come from the validation at the top of this function (step 0)
  // — see require_provider_address.sql for how they're used.
  await setMyProviderFullAddress(
    providerId,
    data.fullAddress || null,
    addressCoords.latitude,
    addressCoords.longitude
  );

  // 3. Update user role to 'provider'
  await supabase.from('users').update({ role: 'provider' }).eq('id', userId);

  // 4-5. Replace services ATOMICALLY. Storage isn't transactional, so upload
  // every image first (collecting resolved URLs), then hand the whole service
  // set to replace_provider_services() — a SECURITY DEFINER RPC that does the
  // delete + reinsert in one transaction. If any insert fails, it ALL rolls
  // back and the provider's existing services are untouched (previously a
  // mid-save failure wiped services — see supabase/replace_provider_services.sql).
  const servicesPayload: Record<string, unknown>[] = [];
  for (const [categoryName, services] of Object.entries(data.categories)) {
    const safeCat = categoryName.replace(/[^a-zA-Z0-9]/g, '_');
    for (let sortOrder = 0; sortOrder < services.length; sortOrder++) {
      const svc = services[sortOrder];
      if (!svc) continue;

      const images: { url: string; sort_order: number }[] = [];
      for (let i = 0; i < svc.images.length; i++) {
        const imgUri = svc.images[i];
        if (!imgUri) continue;
        let imgUrl = imgUri;
        if (isLocalUri(imgUri)) {
          imgUrl = await uploadToStorage('service-images', `${userId}/${safeCat}-${sortOrder}-${i}.jpg`, imgUri);
        }
        images.push({ url: imgUrl, sort_order: i });
      }

      servicesPayload.push({
        category_name: categoryName,
        category_description: data.categoryDescriptions?.[categoryName] || null,
        name: svc.name,
        description: svc.description || null,
        price: svc.price,
        duration_minutes: parseDurationToMinutes(svc.duration),
        buffer_before_mins: svc.bufferBeforeMins ?? null,
        buffer_after_mins: svc.bufferAfterMins ?? null,
        sort_order: sortOrder,
        tags: svc.tags?.length ? svc.tags : null,
        technique_tags: svc.techniqueTags?.length ? svc.techniqueTags : null,
        outcome_tags: svc.outcomeTags?.length ? svc.outcomeTags : null,
        occasion_tags: svc.occasionTags?.length ? svc.occasionTags : null,
        trend_names: svc.trendNames?.length ? svc.trendNames : null,
        is_pregnancy_safe: svc.isPregnancySafe ?? false,
        patch_test_required: svc.patchTestRequired ?? false,
        min_age: svc.minAge ?? null,
        contraindications: svc.contraindications?.length ? svc.contraindications : null,
        aftercare_notes: svc.aftercareNotes || null,
        service_type: svc.serviceType || null,
        images,
        add_ons: svc.addOns.map((a) => ({ name: a.name, price: a.price })),
      });
    }
  }

  const { error: svcError } = await supabase.rpc('replace_provider_services', {
    p_provider_id: providerId,
    p_services: servicesPayload,
  });
  if (svcError) throw new Error(`Saving services failed: ${svcError.message}`);

  // 6. Refresh AsyncStorage cache with resolved URLs
  const cached: ProviderRegistrationData = { ...data, logo: logoUrl };
  await AsyncStorage.setItem(`@provider_reg_data_${userId}`, JSON.stringify(cached));
}

// ── loadProviderFromSupabase ─────────────────────────────────────────────────
// Fetches provider + services + images + add-ons, reconstructs ProviderRegistrationData.
// Falls back to AsyncStorage cache if Supabase returns nothing.

export async function loadProviderFromSupabase(
  userId: string
): Promise<ProviderRegistrationData | null> {
  const { data: provider, error } = await supabase
    .from('providers')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    logger.warn('loadProviderFromSupabase error:', error.message);
    return getCachedProviderData(userId);
  }
  if (!provider) return getCachedProviderData(userId);

  // Street address, the services list, and the AsyncStorage fallback each
  // only depend on `provider.id` / `userId` — none on each other's result —
  // so fetch them together instead of one after another.
  const [{ data: privateDetails }, servicesResult, cached] = await Promise.all([
    // Street address comes from the owner-only side table, not `providers`.
    supabase
      .from('provider_private_details')
      .select('full_address')
      .eq('provider_id', provider.id)
      .maybeSingle(),
    supabase
      .from('services')
      .select(`
        id,
        category_name,
        category_description,
        name,
        description,
        price,
        duration_minutes,
        buffer_before_mins,
        buffer_after_mins,
        sort_order,
        tags,
        technique_tags,
        outcome_tags,
        occasion_tags,
        trend_names,
        is_pregnancy_safe,
        patch_test_required,
        min_age,
        contraindications,
        aftercare_notes,
        service_type,
        service_images ( url, sort_order ),
        service_add_ons ( name, price )
      `)
      .eq('provider_id', provider.id)
      .eq('is_active', true)
      .order('sort_order'),
    getCachedProviderData(userId).catch(() => null),
  ]);
  const fullAddress =
    (privateDetails as { full_address?: string | null } | null)?.full_address ?? '';
  const { data: services, error: svcError } = servicesResult;

  if (svcError) {
    logger.warn('loadProviderFromSupabase services error:', svcError.message);
    return cached;
  }

  // Reconstruct categories
  const categories: Record<string, ServiceData[]> = {};
  const categoryDescriptions: Record<string, string> = {};
  let localId = 1;

  for (const svc of (services || [])) {
    if (!categories[svc.category_name]) {
      categories[svc.category_name] = [];
    }
    if (svc.category_description && !categoryDescriptions[svc.category_name]) {
      categoryDescriptions[svc.category_name] = svc.category_description;
    }

    const images = [...(svc.service_images || [])]
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
      .map((img: any) => img.url);

    const addOns = (svc.service_add_ons || []).map((ao: any, idx: number) => ({
      id: idx + 1,
      name: ao.name,
      price: Number(ao.price),
    }));

    (categories[svc.category_name] as ServiceData[]).push({
      id: localId++,
      name: svc.name,
      price: Number(svc.price),
      duration: minutesToDuration(svc.duration_minutes),
      bufferBeforeMins: svc.buffer_before_mins ?? null,
      bufferAfterMins: svc.buffer_after_mins ?? null,
      description: svc.description || '',
      images,
      addOns,
      tags: svc.tags || [],
      techniqueTags: svc.technique_tags || [],
      outcomeTags: svc.outcome_tags || [],
      occasionTags: svc.occasion_tags || [],
      trendNames: svc.trend_names || [],
      isPregnancySafe: svc.is_pregnancy_safe ?? false,
      patchTestRequired: svc.patch_test_required ?? false,
      minAge: svc.min_age ?? null,
      contraindications: svc.contraindications || [],
      aftercareNotes: svc.aftercare_notes || '',
      serviceType: svc.service_type || '',
    });
  }

  return {
    providerName: provider.display_name,
    providerService: provider.service_category,
    customServiceType: provider.custom_service_type || '',
    location: provider.location_text || '',
    aboutText: provider.about_text || '',
    slotsText: provider.slots_text || '',
    gradient: (provider.gradient || ['#FF6B6B', '#4ECDC4', '#45B7D1']) as [string, string, ...string[]],
    hasCustomGradient: !!(provider.gradient && provider.gradient.length >= 2),
    accentColor: provider.accent_color || '#7B1FA2',
    profileTheme: provider.profile_theme || 'app',
    logo: provider.logo_url || null,
    categories,
    categoryDescriptions,
    phone: provider.phone || '',
    email: provider.email || '',
    instagram: provider.instagram || cached?.instagram || '',
    website: provider.website || cached?.website || '',
    externalBookingUrl: provider.external_booking_url || '',
    yearsExperience: provider.years_experience ? String(provider.years_experience) : '',
    businessType: (provider.business_type as ProviderRegistrationData['businessType']) || '',
    fullAddress,
    addressReleasePolicy: (provider.address_release_policy as ProviderRegistrationData['addressReleasePolicy']) || 'on_confirmation',
    backgroundImage: provider.background_image_url ?? null,
    isVerified: provider.is_verified ?? false,
    rating: Number(provider.rating) || 0,
    whatsapp: provider.whatsapp_number ?? '',
    preferredContactMethods: provider.preferred_contact_methods ?? ['in_app'],
    bookingPolicies: (provider.booking_policies as ProviderRegistrationData['bookingPolicies']) ?? null,
    cancellationNoticeHours: provider.cancellation_notice_hours ?? 0,
  };
}

// ── Booking policies — saved to Supabase booking_policies column ─────────────

export async function saveProviderPolicies(userId: string, policies: Record<string, unknown>): Promise<void> {
  const { data: existing } = await supabase
    .from('providers')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (!existing) return;
  await supabase
    .from('providers')
    .update({ booking_policies: policies })
    .eq('id', existing.id);
  // Keep local copy in sync
  await AsyncStorage.setItem(`provider_policies_${userId}`, JSON.stringify(policies));
}

export async function loadProviderPolicies(userId: string): Promise<Record<string, unknown> | null> {
  try {
    const { data } = await supabase
      .from('providers')
      .select('booking_policies')
      .eq('user_id', userId)
      .maybeSingle();
    if ((data as any)?.booking_policies) return (data as any).booking_policies;
  } catch {}
  // Fallback to local cache
  try {
    const raw = await AsyncStorage.getItem(`provider_policies_${userId}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

// ── AsyncStorage cache helpers ───────────────────────────────────────────────

export async function getCachedProviderData(userId: string): Promise<ProviderRegistrationData | null> {
  try {
    const stored = await AsyncStorage.getItem(`@provider_reg_data_${userId}`);
    if (stored) return JSON.parse(stored) as ProviderRegistrationData;
  } catch (e) {
    logger.warn('getCachedProviderData error:', e);
  }
  return null;
}
