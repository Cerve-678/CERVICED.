// What the extract-provider-profile Edge Function reads out of a link, photos
// or a PDF of a business's price list. Mirrors ExtractedProviderProfile in
// supabase/functions/_shared/extractProviderProfile.ts; keep the two in step.

export interface ImportedService {
  name?: string;
  price?: number | string;
  /** "1 hr 30 mins" style. Missing when the source didn't say. */
  duration?: string;
  description?: string;
}

export interface ImportedAddOn {
  name: string;
  price: number | null;
  extraMinutes: number | null;
  description: string;
  /** Service categories it's offered on, by the names in `categories`. [] = all. */
  categories: string[];
}

export interface ImportedPolicies {
  cancelNoticeHours: number | null;
  cancellationNote: string;
  rescheduleNoticeHours: number | null;
  maxReschedules: number | null;
  rescheduleNote: string;
  lateGraceMinutes: number | null;
  noShowNote: string;
  refundNote: string;
  travelNote: string;
  bookingInstructions: string[];
  /** Fees and deposits in the business's own words. Shown, never applied:
   *  anything that charges a card is set by a person in Policies/Payments. */
  feesAndDeposits: string[];
}

export interface ImportedProfile {
  providerName?: string;
  location?: string;
  aboutText?: string;
  slotsText?: string;
  serviceCategory?: string;
  phone?: string;
  email?: string;
  instagram?: string;
  website?: string;
  tiktok?: string;
  categories?: Record<string, ImportedService[]>;
  addOns?: ImportedAddOn[];
  policies?: ImportedPolicies;
  /** Anything the reader couldn't make out, for the person checking it. */
  unclear?: string;
}

/** One upload, ready to send: base64 with no data: prefix. */
export interface ProfileImportFile {
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
  data: string;
}
