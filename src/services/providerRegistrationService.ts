// src/services/providerRegistrationService.ts
// Phase 2: Provider registration — save to and load from Supabase
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';
// Only for getSize (reading an image's true pixel dimensions) — this service
// renders nothing.
import { Image as RNImage } from 'react-native';
import { logger } from '../utils/logger';
import { lightTheme } from '../constants/theme';
import type { ServiceImageDraft, ServiceImageFit } from '../utils/serviceImageDraft';
import { normalizeServiceImages } from '../utils/serviceImageDraft';
export type { ServiceImageDraft, ServiceImageFit } from '../utils/serviceImageDraft';
import {
  getProviderBookingPolicies,
  getProviderLogoUrlByUserId,
  getProviderRegistrationCore,
  getProviderRegistrationDetails,
  getProviderRegistrationRecord,
  insertProviderRegistrationRow,
  promoteUserToProvider,
  providerSlugExists,
  removeStorageObjects,
  listUserStorageObjectPaths,
  replaceProviderServiceCatalog,
  saveProviderBookingPolicies,
  setMyProviderFullAddress,
  updateProviderRegistrationRow,
  uploadPublicStorageObject,
} from './databaseService';
import type { DbProvider, BusinessType } from '../types/database';
import {
  reconcileAddressReleasePolicy,
  type AddressReleasePolicy,
} from '../features/business-details/options';

// ── Shared types (mirror InfoRegScreen / ProviderMyProfileScreen) ───────────

export interface AddOnData {
  id: number;
  // The real service_add_ons.id when this add-on already exists in the DB —
  // null for one created in this editing session. See ServiceData.dbId.
  dbId: string | null;
  name: string;
  price: number;
}

export interface ServiceData {
  id: number;
  // The real services.id when this service already exists in the DB — null
  // for one created in this editing session. Threaded through to
  // replace_provider_services so it can update the row in place instead of
  // deleting and recreating it under a new id, which used to silently break
  // any cart item or booking pointing at the old one (bookings.service_id is
  // ON DELETE SET NULL — 96% of live bookings had already lost this link).
  dbId: string | null;
  name: string;
  price: number;
  duration: string;
  // Blank = no override. before defaults to 0; after inherits the provider's global buffer.
  bufferBeforeMins: number | null;
  bufferAfterMins: number | null;
  description: string;
  images: ServiceImageDraft[];
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
  // Hair types this service suits (HAIR_TYPES vocabulary). Empty = suits all.
  hairTypesSuitable: string[];
  // Who this specific service is for. '' = not stated, read as "everyone" —
  // mirrors the live services_audience_check constraint.
  audience: 'women' | 'men' | 'kids' | 'everyone' | '';
}

export interface ProviderRegistrationData {
  providerName: string;
  providerService: string;
  customServiceType: string;
  location: string;
  aboutText: string;
  /** Day of month (1-31) new slots go out AND clients who've turned on the
   *  profile bell get notified. Drives the client-facing profile's "Slots
   *  out every Nth of the month" pill directly (computed live, no separate
   *  text field to keep in sync). Stored in
   *  providers.automation_settings.scheduleReleaseDay (merged in, not
   *  overwritten — that JSONB blob also holds unrelated settings owned by
   *  ProviderAutomationsScreen). null = no release day set / notifications off. */
  scheduleReleaseDay: number | null;
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
  tiktok: string;
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
  // '' is this form's "not answered yet"; the four real values are the
  // canonical BusinessType union.
  businessType: BusinessType | '';
  // Collected at signup (Step 4's "Who you work with" / "Tell me more" —
  // see supabase/provider_signup_business_fields.sql), editable here too.
  teamSize: 'solo' | 'small_team' | 'large_team' | '';
  accessibilityNotes: string;
  /** providers.terms_accepted_at — stamped once, on first publish. Read-only
   *  from the app's side: nothing ever clears or re-stamps it, so its presence
   *  is the answer to "has this provider accepted CERVICED's terms". */
  termsAcceptedAt: string | null;
  languagesSpoken: string[];
  preferredPaymentMethods: string[];
  // Drives providers.price_tier — the client-facing price filter/badge
  // (SearchScreen/HomeScreen) already reads this column, this form is its
  // first writer.
  priceRange: 'budget' | 'mid' | 'premium' | 'luxury' | '';
  // Service-coverage cities — drives providers.service_locations, read by
  // the client Search "City" filter. See src/constants/ukCities.ts.
  serviceLocations: string[];
  fullAddress: string;
  /** Coordinates returned by the address picker for this exact address.
   *  Kept in form state only and written atomically with fullAddress. */
  fullAddressCoordinates: { latitude: number; longitude: number } | null;
  /** null is a real value, not a missing one: it means this provider shares
   *  no address at all. That's the default (and the only default) for mobile,
   *  so this must stay nullable — coercing it to 'on_confirmation' on write
   *  is how a mobile provider's home address would start auto-releasing to
   *  every confirmed client. Always run it through
   *  reconcileAddressReleasePolicy() with the business type. */
  addressReleasePolicy: AddressReleasePolicy | null;
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

/**
 * What a file actually IS, read from its own first bytes.
 *
 * The extension is not evidence. Callers invent the storage path — the
 * service-image uploader hardcodes `.jpg` for every photo regardless of the
 * asset — and this function used to derive Content-Type from that invented
 * name, so a HEIC picked straight out of the photo library was stored as
 * `.jpg` and served as `image/jpeg`. iOS decodes it anyway, which is exactly
 * why it went unnoticed; Android and web can't, and show a broken image.
 *
 * Returns null for bytes we don't recognise, which the caller treats as
 * "trust nothing and fall back", rather than guessing JPEG.
 */
function sniffImageType(
  bytes: Uint8Array,
): { mime: string; ext: string } | null {
  const at = (i: number): number => bytes[i] ?? -1;
  const ascii = (start: number, length: number): string =>
    String.fromCharCode(...Array.from(bytes.slice(start, start + length)));

  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff)
    return { mime: 'image/jpeg', ext: 'jpg' };
  if (at(0) === 0x89 && ascii(1, 3) === 'PNG')
    return { mime: 'image/png', ext: 'png' };
  if (ascii(0, 3) === 'GIF') return { mime: 'image/gif', ext: 'gif' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP')
    return { mime: 'image/webp', ext: 'webp' };
  // ISO-BMFF container: the brand at offset 8 says whether it's HEIC/HEIF or
  // AVIF. Labelling these honestly doesn't make Android able to DECODE them —
  // that needs transcoding to JPEG at pick time — but a correct Content-Type
  // means the failure is visible and diagnosable instead of silent.
  if (ascii(4, 4) === 'ftyp') {
    const brand = ascii(8, 4);
    if (brand === 'avif' || brand === 'avis')
      return { mime: 'image/avif', ext: 'avif' };
    if (
      ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'].includes(
        brand,
      )
    )
      return { mime: 'image/heic', ext: 'heic' };
  }
  return null;
}

export async function uploadToStorage(
  bucket: string,
  storagePath: string,
  localUri: string
): Promise<string> {
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

  // Content type comes from the bytes, never from the name. Only if the bytes
  // are unrecognisable do we fall back to reading the local URI's extension.
  const sniffed = sniffImageType(bytes);
  const uriExt =
    localUri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
  const contentType =
    sniffed?.mime ?? (uriExt === 'png' ? 'image/png' : 'image/jpeg');

  // Correct the stored object's extension to match what it really is, so the
  // name stops contradicting the bytes. Only the final extension is touched —
  // the caller still owns the whole path, including its uniqueness.
  const resolvedPath = sniffed
    ? storagePath.replace(/\.[^./]+$/, `.${sniffed.ext}`)
    : storagePath;

  try {
    return await uploadPublicStorageObject(bucket, resolvedPath, bytes, contentType);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown storage error';
    throw new Error(`Upload failed (${bucket}/${resolvedPath}): ${message}`);
  }
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
  address: string,
  selectedCoordinates?: { latitude: number; longitude: number } | null,
): Promise<{ latitude: number; longitude: number }> {
  const trimmed = address.trim();
  if (!trimmed) {
    throw new Error('Please enter your business address.');
  }
  if (!UK_POSTCODE_PATTERN.test(trimmed)) {
    throw new Error('Please include a valid UK postcode in your address.');
  }

  // A picker selection gives us the exact coordinates that produced the
  // formatted address. Re-use them instead of geocoding the text again — a
  // second lookup can yield a vague area or fail despite a valid selection.
  let latitude = selectedCoordinates?.latitude;
  let longitude = selectedCoordinates?.longitude;
  if (latitude == null || longitude == null) {
    let match: Location.LocationGeocodedLocation | undefined;
    try {
      [match] = await Location.geocodeAsync(trimmed);
    } catch {
      match = undefined;
    }
    if (!match) {
      throw new Error("We couldn't find that address — please check it and try again.");
    }
    latitude = match.latitude;
    longitude = match.longitude;
  }
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

/**
 * A local or remote image's width/height ratio, or null if it can't be read.
 *
 * Never throws: a failed measurement must not be able to fail a provider's
 * whole service save. Null means "not measured" and is stored as SQL NULL,
 * which the client treats as "fall back to measuring this myself" rather
 * than as a real ratio.
 */
function measureAspectRatio(uri: string): Promise<number | null> {
  return new Promise(resolve => {
    try {
      RNImage.getSize(
        uri,
        (w, h) => resolve(w > 0 && h > 0 ? w / h : null),
        () => resolve(null),
      );
    } catch {
      resolve(null);
    }
  });
}

export async function saveProviderToSupabase(
  userId: string,
  data: ProviderRegistrationData,
  // True only on first publish (InfoRegScreen's !isEditMode submit, gated on
  // its own terms checkbox) — stamps terms_accepted_at once on insert. Later
  // edit-saves never pass this, so an existing acceptance timestamp is never
  // overwritten or cleared.
  acceptedTerms?: boolean
): Promise<void> {
  // 0. Validate the real business address before anything else happens —
  // required for every business_type now, including 'mobile' (a private base
  // address, never shown to clients). Fails fast, before any upload or DB
  // write, so a bad address never leaves partial state behind.
  const addressCoords = await geocodeAndValidateUkAddress(
    data.fullAddress || '',
    data.fullAddressCoordinates,
  );

  // 1. Upload logo if it's a local file. Path is versioned with Date.now()
  // (matching the pattern already used for portfolio/promotions uploads)
  // rather than a fixed `${userId}/logo.jpg` — a fixed path with upsert:true
  // overwrites the same object, so the public URL is byte-identical across
  // re-uploads and RN Image/expo-image/Supabase's CDN all keep serving the
  // old cached bytes for that URL indefinitely.
  let logoUrl: string | null = data.logo;
  let previousLogoStoragePath: string | null = null;
  if (data.logo && isLocalUri(data.logo)) {
    // Grab the current logo path before it's replaced, so the now-orphaned
    // object (versioned paths are no longer overwritten in place) can be
    // cleaned up below once the new one is safely saved.
    const previousLogoUrl = await getProviderLogoUrlByUserId(userId);
    if (previousLogoUrl) {
      try {
        previousLogoStoragePath = new URL(previousLogoUrl).pathname
          .split('/provider-logos/')[1] ?? null;
      } catch {
        previousLogoStoragePath = null;
      }
    }

    logoUrl = await uploadToStorage(
      'provider-logos',
      `${userId}/logo-${Date.now()}.jpg`,
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
  let existingProvider: Awaited<ReturnType<typeof getProviderRegistrationCore>>;
  try {
    existingProvider = await getProviderRegistrationCore(userId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown database error';
    throw new Error(`Provider lookup failed: ${message}`);
  }
  // maybeSingle() errors (rather than returning null) if more than one row
  // matches — if we ignore that, the code below falls through to inserting a
  // duplicate provider row instead of updating the existing one, and future
  // edits silently split across rows. Fail loudly instead.
  let providerId: string;

  // Merged in, never overwritten whole — automation_settings also holds
  // unrelated keys (rebookingNudgeWeeks, clientReminderTiming, etc.) owned
  // by ProviderAutomationsScreen, which reads/writes the exact same
  // scheduleReleaseDay key so the two screens stay in sync automatically
  // (both fetch fresh from this one column on their own mount — no separate
  // sync step needed, just don't let either screen clobber the other's keys).
  const mergedAutomationSettings: NonNullable<DbProvider['automation_settings']> = {
    ...(existingProvider?.automation_settings ?? {}),
  };
  if (data.scheduleReleaseDay != null) {
    mergedAutomationSettings.scheduleReleaseDay = data.scheduleReleaseDay;
  } else {
    delete mergedAutomationSettings.scheduleReleaseDay;
  }

  if (existingProvider) {
    try {
      await updateProviderRegistrationRow(existingProvider.id, {
        // display_name is deliberately absent from the UPDATE path. The name
        // is set once here on insert (below), then locked in InfoRegScreen —
        // Business Profile → Business Details → Business Info is its only
        // ongoing editor, and it's under a 14-day cooldown enforced by the
        // providers_display_name_cooldown trigger. Re-sending the name this
        // screen loaded would make any unrelated save race that cooldown.
        service_category: data.providerService,
        custom_service_type: data.customServiceType || null,
        location_text: data.location,
        latitude,
        longitude,
        about_text: data.aboutText,
        logo_url: logoUrl,
        gradient: data.gradient,
        accent_color: data.accentColor,
        profile_theme: data.profileTheme || 'app',
        phone: data.phone || null,
        email: data.email || null,
        instagram: data.instagram || null,
        website: data.website || null,
        tiktok: data.tiktok || null,
        // Shared with ProviderCommunicationsScreen, which writes the same
        // column. loadProviderFromSupabase has always read it back into
        // `whatsapp`, but this payload never wrote it — so a number typed in
        // InfoReg was silently dropped on save.
        whatsapp_number: data.whatsapp?.trim() || null,
        external_booking_url: data.externalBookingUrl?.trim() || null,
        years_experience: data.yearsExperience ? parseInt(data.yearsExperience) : null,
        business_type: data.businessType || null,
        team_size: data.teamSize || null,
        accessibility_notes: data.accessibilityNotes?.trim() || null,
        languages_spoken: data.languagesSpoken,
        price_tier: data.priceRange || null,
        preferred_contact_methods: data.preferredContactMethods,
        service_locations: data.serviceLocations,
        preferred_payment_methods: data.preferredPaymentMethods,
        // reconcile, not `|| 'on_confirmation'`: the old fallback silently
        // turned "never share" into "share on confirmation" for any provider
        // whose policy was null — i.e. every mobile provider — on every save.
        address_release_policy: data.businessType
          ? reconcileAddressReleasePolicy(data.businessType, data.addressReleasePolicy ?? null)
          : (data.addressReleasePolicy ?? null),
        automation_settings: mergedAutomationSettings,
        is_active: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown database error';
      throw new Error(`Provider update failed: ${message}`);
    }
    providerId = existingProvider.id;
  } else {
    // Generate unique slug
    let slug = generateSlug(data.providerName);
    if (await providerSlugExists(slug)) slug = `${slug}-${userId.substring(0, 8)}`;

    try {
      providerId = await insertProviderRegistrationRow({
        user_id: userId,
        slug,
        display_name: data.providerName,
        service_category: data.providerService,
        custom_service_type: data.customServiceType || null,
        location_text: data.location,
        latitude,
        longitude,
        about_text: data.aboutText,
        logo_url: logoUrl,
        gradient: data.gradient,
        accent_color: data.accentColor,
        profile_theme: data.profileTheme || 'app',
        phone: data.phone || null,
        email: data.email || null,
        instagram: data.instagram || null,
        website: data.website || null,
        tiktok: data.tiktok || null,
        // Shared with ProviderCommunicationsScreen, which writes the same
        // column. loadProviderFromSupabase has always read it back into
        // `whatsapp`, but this payload never wrote it — so a number typed in
        // InfoReg was silently dropped on save.
        whatsapp_number: data.whatsapp?.trim() || null,
        external_booking_url: data.externalBookingUrl?.trim() || null,
        years_experience: data.yearsExperience ? parseInt(data.yearsExperience) : null,
        business_type: data.businessType || null,
        team_size: data.teamSize || null,
        accessibility_notes: data.accessibilityNotes?.trim() || null,
        languages_spoken: data.languagesSpoken,
        price_tier: data.priceRange || null,
        preferred_contact_methods: data.preferredContactMethods,
        service_locations: data.serviceLocations,
        preferred_payment_methods: data.preferredPaymentMethods,
        // reconcile, not `|| 'on_confirmation'`: the old fallback silently
        // turned "never share" into "share on confirmation" for any provider
        // whose policy was null — i.e. every mobile provider — on every save.
        address_release_policy: data.businessType
          ? reconcileAddressReleasePolicy(data.businessType, data.addressReleasePolicy ?? null)
          : (data.addressReleasePolicy ?? null),
        automation_settings: mergedAutomationSettings,
        is_active: true,
        terms_accepted_at: acceptedTerms ? new Date().toISOString() : null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown database error';
      throw new Error(`Provider insert failed: ${message}`);
    }
  }

  // Now that the new logo_url is durably saved, remove the old versioned
  // object it replaced — best-effort, never blocks the save. Without this,
  // every logo re-upload leaves the previous object orphaned in Storage
  // forever, since versioned paths (unlike the old fixed path) are never
  // overwritten in place.
  if (previousLogoStoragePath) {
    try {
      await removeStorageObjects('provider-logos', [previousLogoStoragePath]);
    } catch {
      // Orphaned object, not a failed save — safe to ignore.
    }
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
  await promoteUserToProvider(userId);

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

      const images: {
        url: string;
        sort_order: number;
        aspect_ratio: number | null;
        fit: ServiceImageFit;
      }[] = [];
      for (let i = 0; i < svc.images.length; i++) {
        const image = svc.images[i];
        const imgUri = image?.uri;
        if (!imgUri) continue;
        let imgUrl = imgUri;
        if (isLocalUri(imgUri)) {
          // Versioned with Date.now() for the same reason as the logo path
          // above — a fixed per-slot path would make a replaced photo's URL
          // identical to the old one and never bust the image cache.
          imgUrl = await uploadToStorage('service-images', `${userId}/${safeCat}-${sortOrder}-${i}-${Date.now()}.jpg`, imgUri);
        }
        // Measured off the LOCAL uri where there is one — it's already on
        // disk, so this needs no network round-trip and can't be affected by
        // the upload. Falls back to the resolved remote URL for an image
        // that was already uploaded on a previous save.
        //
        // Stored so Explore's masonry grid and ImageDetailModal can size
        // this photo's box to its real shape. Without it the client has to
        // measure every service photo itself on each feed load (see
        // useMeasuredAspectRatios), and until that resolves the card renders
        // at a hardcoded 0.8 placeholder — which is what put landscape
        // photos in portrait boxes. Null on failure rather than a guessed
        // default, so "unknown" stays distinguishable from a real square.
        const aspect_ratio =
          (await measureAspectRatio(imgUri)) ?? (await measureAspectRatio(imgUrl));
        images.push({
          url: imgUrl,
          sort_order: i,
          aspect_ratio,
          fit: image?.fit === 'contain' ? 'contain' : 'cover',
        });
      }

      servicesPayload.push({
        id: svc.dbId ?? null,
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
        hair_types_suitable: svc.hairTypesSuitable?.length ? svc.hairTypesSuitable : null,
        audience: svc.audience || null,
        images,
        add_ons: svc.addOns.map((a) => ({ id: a.dbId ?? null, name: a.name, price: a.price })),
      });
    }
  }

  try {
    await replaceProviderServiceCatalog(providerId, servicesPayload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown database error';
    throw new Error(`Saving services failed: ${message}`);
  }

  // 5b. Drop service-image objects this save orphaned. replace_provider_services
  // rewrites the whole catalogue, so any photo the provider removed — or that
  // moved to a new versioned path when it was replaced — is now referenced by
  // nothing, and until now nothing ever deleted it. The logo has done this
  // since it started versioning its path (step 1) and portfolio cleans up on
  // delete; service images were the one uploader with no cleanup at all.
  //
  // Runs only AFTER the catalogue replace has committed, so a failed save can
  // never delete photos its rolled-back services still point at. Best-effort:
  // a storage error here must not fail a save that already succeeded.
  try {
    const keptPaths = new Set(
      servicesPayload
        .flatMap(svc => (svc['images'] as { url: string }[]) ?? [])
        .map(img => img.url.split(`/service-images/`)[1])
        .filter((path): path is string => Boolean(path))
        .map(path => decodeURIComponent(path)),
    );
    const existing = await listUserStorageObjectPaths('service-images', userId);
    const orphaned = existing.filter(path => !keptPaths.has(path));
    if (orphaned.length > 0) {
      await removeStorageObjects('service-images', orphaned);
    }
  } catch (error) {
    logger.error('[providerRegistration] service-image cleanup failed:', error);
  }

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
  let provider: Awaited<ReturnType<typeof getProviderRegistrationRecord>>;
  try {
    provider = await getProviderRegistrationRecord(userId);
  } catch (error) {
    logger.warn('loadProviderFromSupabase error:', error);
    const cached = await getCachedProviderData(userId);
    if (cached) return cached;
    // A transient failure here is NOT the same thing as "no provider row
    // exists" — returning null in both cases is indistinguishable to every
    // caller, which is exactly what let an existing, published provider's
    // locked Business Name/Service Type fields render as editable (and, if
    // touched, silently overwrite service_category on save) after a
    // one-off network blip during load. Callers must treat this as a
    // failure to retry, never as "confirmed new signup".
    throw error;
  }
  // The query itself succeeded and genuinely found no row — this really is
  // either a brand-new signup or an offline draft that never reached the
  // server, so falling back to a local cache (an unsynced draft) is safe
  // here in a way it isn't in the catch block above.
  if (!provider) return getCachedProviderData(userId);

  // Street address, the services list, and the AsyncStorage fallback each
  // only depend on `provider.id` / `userId` — none on each other's result —
  // so fetch them together instead of one after another.
  const [detailsResult, cached] = await Promise.all([
    getProviderRegistrationDetails(provider.id)
      .then(value => ({ value, error: null as unknown }))
      .catch(error => ({ value: null, error })),
    getCachedProviderData(userId).catch(() => null),
  ]);
  if (detailsResult.error || !detailsResult.value) {
    logger.warn('loadProviderFromSupabase details error:', detailsResult.error);
    return cached;
  }
  const { fullAddress } = detailsResult.value;
  const services = detailsResult.value.services as any[];

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

    const images: ServiceImageDraft[] = [...(svc.service_images || [])]
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
      .map((img: any) => ({
        uri: img.url,
        fit: img.fit === 'contain' ? 'contain' : 'cover',
      }));

    const addOns = (svc.service_add_ons || []).map((ao: any, idx: number) => ({
      id: idx + 1,
      dbId: ao.id ?? null,
      name: ao.name,
      price: Number(ao.price),
    }));

    (categories[svc.category_name] as ServiceData[]).push({
      id: localId++,
      dbId: svc.id ?? null,
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
      hairTypesSuitable: svc.hair_types_suitable || [],
      audience: svc.audience || '',
    });
  }

  return {
    providerName: provider.display_name,
    providerService: provider.service_category,
    customServiceType: provider.custom_service_type || '',
    location: provider.location_text || '',
    aboutText: provider.about_text || '',
    scheduleReleaseDay: provider.automation_settings?.scheduleReleaseDay ?? null,
    gradient: (provider.gradient || ['#FF6B6B', '#4ECDC4', '#45B7D1']) as [string, string, ...string[]],
    hasCustomGradient: !!(provider.gradient && provider.gradient.length >= 2),
    // Was '#7B1FA2' (a hardcoded purple) for any provider who'd never set
    // one — falls back to the app's own accent instead.
    accentColor: provider.accent_color || lightTheme.accent,
    profileTheme: provider.profile_theme || 'app',
    logo: provider.logo_url || null,
    categories,
    categoryDescriptions,
    phone: provider.phone || '',
    email: provider.email || '',
    instagram: provider.instagram || cached?.instagram || '',
    website: provider.website || cached?.website || '',
    tiktok: provider.tiktok || cached?.tiktok || '',
    externalBookingUrl: provider.external_booking_url || '',
    yearsExperience: provider.years_experience ? String(provider.years_experience) : '',
    businessType: (provider.business_type as ProviderRegistrationData['businessType']) || '',
    teamSize: (provider.team_size as ProviderRegistrationData['teamSize']) || '',
    accessibilityNotes: provider.accessibility_notes || '',
    termsAcceptedAt: provider.terms_accepted_at ?? null,
    languagesSpoken: provider.languages_spoken || [],
    priceRange: (provider.price_tier as ProviderRegistrationData['priceRange']) || '',
    serviceLocations: provider.service_locations || [],
    preferredPaymentMethods: provider.preferred_payment_methods || [],
    fullAddress,
    // Existing profiles may predate the picker. A later save falls back to a
    // one-time geocode, while every new picker selection supplies these.
    fullAddressCoordinates: null,
    // NULL round-trips as null — see the field's note on ProviderRegistrationData.
    addressReleasePolicy: (provider.address_release_policy as AddressReleasePolicy | null) ?? null,
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
  const saved = await saveProviderBookingPolicies(userId, policies);
  // `false` means no providers row was visible for this user, so the update
  // matched nothing and the policies were NOT stored. Returning quietly here
  // let PoliciesScreen/PaymentsScreen fire their success haptic and navigate
  // back having saved nothing. Callers decide how to degrade — so throw.
  if (!saved) {
    throw new Error('Could not find your provider profile to save these policies to.');
  }
  // Keep local copy in sync
  await AsyncStorage.setItem(`provider_policies_${userId}`, JSON.stringify(policies));
}

/**
 * The DB is the only source of truth for policies.
 *
 * This used to fall back to a device-local AsyncStorage copy whenever the read
 * threw, which is worse than failing: both editors of this blob (PoliciesScreen
 * and PaymentsScreen) carry the keys they don't own straight back through their
 * next save, so one transient read failure meant a stale cached blob got
 * written over live data — silently reverting deposit settings saved from
 * another device. A read failure now propagates and the screen shows its
 * "could not load" state instead.
 *
 * The cache write in saveProviderPolicies is kept: it costs nothing and other
 * call sites still read it, but it is no longer a fallback for this path.
 */
export async function loadProviderPolicies(userId: string): Promise<Record<string, unknown> | null> {
  return await getProviderBookingPolicies(userId);
}

// ── AsyncStorage cache helpers ───────────────────────────────────────────────

export async function getCachedProviderData(userId: string): Promise<ProviderRegistrationData | null> {
  try {
    const stored = await AsyncStorage.getItem(`@provider_reg_data_${userId}`);
    if (stored) {
      const parsed = JSON.parse(stored) as ProviderRegistrationData;
      // The cache is whatever shape the build that last saved it wrote. A
      // build predating service_images.fit stored `images` as a bare
      // string[], and this is the offline path, so it has to cope with both
      // rather than handing undefined uris to the editor.
      return {
        ...parsed,
        categories: Object.fromEntries(
          Object.entries(parsed.categories ?? {}).map(([category, services]) => [
            category,
            (services ?? []).map(svc => ({
              ...svc,
              images: normalizeServiceImages(svc.images),
            })),
          ]),
        ),
      };
    }
  } catch (e) {
    logger.warn('getCachedProviderData error:', e);
  }
  return null;
}
