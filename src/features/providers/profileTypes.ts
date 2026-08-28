import type { BusinessType } from '../../types/database';

export interface ProviderProfileAddOn {
  id: string | number;
  name: string;
  price: number;
  description: string;
}

export interface ProviderProfileService {
  id: number;
  dbId: string;
  name: string;
  price: number;
  duration: string;
  description: string;
  image: any;
  images?: any[];
  addOns?: ProviderProfileAddOn[];
  isPregnancySafe?: boolean;
  patchTestRequired?: boolean;
  minAge?: number | null;
  contraindications?: string[];
  aftercareNotes?: string;
  serviceType?: string | null;
}

export interface ProviderProfileData {
  id: string;
  displayName: string;
  providerName: string;
  providerService: string;
  providerLogo: any;
  location: string;
  businessType: BusinessType | null;
  rating: number;
  /** providers.automation_settings.scheduleReleaseDay — day of month (1-31)
   *  new slots go out, or null if the provider hasn't set one. Drives the
   *  "Slots out every Nth of the month" pill; superseded the old hand-typed
   *  slots_text field, which could say anything regardless of the provider's
   *  actual release cadence. */
  scheduleReleaseDay: number | null;
  aboutText: string;
  categories: Record<string, ProviderProfileService[]>;
  categoryDescriptions: Record<string, string>;
  gradient: [string, string, ...string[]];
  hasCustomGradient: boolean;
  accentColor: string | null;
  backgroundImage: string | null;
  profileTheme: string;
  phone: string;
  email: string;
  instagram: string;
  website: string;
  externalBookingUrl: string | null;
  yearsExperience: string;
  specialties: string[];
  customServiceType: string;
  whatsapp: string;
  isVerified: boolean;
  preferredContactMethods: string[];
  onlineConsultationsAvailable: boolean;
  /** accessibility_notes is stored as a '|'-delimited list of fixed
   *  ACCESSIBILITY_OPTS chip values (see AboutYouScreen.tsx), not free
   *  text — split here so it renders as tags, matching how it's collected. */
  accessibilityTags: string[];
  languagesSpoken: string[];
  qualifications: string;
  /** Provider's own attestation — Cerviced does not verify either. Always
   *  label as self-declared wherever these render (see AboutYouScreen.tsx). */
  isInsuredSelfDeclared: boolean;
  dbsCheckedSelfDeclared: boolean;
  teamSize: 'solo' | 'small_team' | 'large_team' | null;
  walkInsWelcome: boolean;
  groupBookingsAvailable: boolean;
  veganCrueltyFree: boolean;
  travelRadius: string;
  productsUsed: string;
  bookingPolicies: {
    cancelNotice?: string;
    cancelPenalty?: string;
    cancelNote?: string;
    rescheduleNotice?: string;
    maxReschedules?: string;
    depositMode?: string;
    depositRequired?: boolean;
    depositOnly?: boolean;
    depositType?: string;
    depositAmount?: string;
    noShowAction?: string;
    policyImageUrl?: string;
    // Read by EmergencyBookingPrompt (via BookingSheet/MultiBookingSheet) while
    // EMERGENCY_BOOKINGS_ENABLED is on. Authored on PoliciesScreen.
    emergencyBookingPolicy?: string;
  } | null;
  cancellationNoticeHours: number;
  waitlistEnabled: boolean;
}
