// src/types/beautyProfile.ts
//
// Shared shape of the client's Beauty Profile. Lives here rather than in the
// screen so `src/utils/beautyProfileStats.ts` can derive its counts from the
// same definition the screen renders — two copies of this type would drift the
// moment a field is added, and the stats' denominators would silently stop
// matching the fields actually on screen.

export type CategoryKey =
  | 'health' | 'skin' | 'hair' | 'nails' | 'lashesBrows'
  | 'makeup' | 'general' | 'personalisation' | 'consent';

export type Gender = 'female' | 'male' | 'non-binary' | 'prefer-not-to-say';

export interface BeautyData {
  // Hair
  hairType:           string;
  scalpCondition:     string;
  hairGoals:          string[];
  treatmentHistory:   string[];
  // Skin
  skinType:           string;
  skinTone:           string;
  skinConcerns:       string[];
  sensitiveAreas:     string[];
  // Nails
  nailLength:         string;
  nailShape:          string;
  // Lashes & Brows
  lashStyle:          string;
  lashStatus:         string;
  browStyle:          string;
  browCondition:      string;
  // Makeup
  makeupCoverage:     string;
  makeupFinish:       string;
  makeupEyes:         string;
  makeupLips:         string;
  // General
  styleVibe:          string;
  serviceInterests:   string[];
  // Personalisation
  gender:             Gender | null;
  has_kids:           boolean;
  // Health & Consent
  allergies:          string[];
  medicalNotes:       string;
  photographyConsent: boolean;
}

export const EMPTY_BEAUTY_DATA: BeautyData = {
  hairType: '', scalpCondition: '', hairGoals: [], treatmentHistory: [],
  skinType: '', skinTone: '', skinConcerns: [], sensitiveAreas: [],
  nailLength: '', nailShape: '',
  lashStyle: '', lashStatus: '', browStyle: '', browCondition: '',
  makeupCoverage: '', makeupFinish: '', makeupEyes: '', makeupLips: '',
  styleVibe: '', serviceInterests: [],
  gender: null, has_kids: false,
  allergies: [], medicalNotes: '', photographyConsent: true,
};
