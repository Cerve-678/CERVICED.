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
  businessType: 'salon' | 'studio' | 'home_based' | 'mobile' | null;
  rating: number;
  slotsText: string;
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
  cancellationNoticeHours: number;
  waitlistEnabled: boolean;
}
