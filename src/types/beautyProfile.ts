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
  hairType:           string[];
  /** Added 2026-11-27, single picks: porosity and how thick the hair is. */
  hairPorosity:       string;
  hairThickness:      string;
  scalpCondition:     string[];
  hairGoals:          string[];
  treatmentHistory:   string[];
  // Skin
  skinType:           string[];
  skinTone:           string;
  /** Added 2026-11-27. */
  skinUndertone:      string;
  skinConcerns:       string[];
  sensitiveAreas:     string[];
  // Nails (condition, service, style and colours added 2026-11-17)
  nailCondition:      string[];
  nailService:        string[];
  nailLength:         string[];
  nailShape:          string[];
  nailStyle:          string[];
  nailColours:        string[];
  // Lashes & Brows (eye shape and lash curl added 2026-11-27)
  eyeShape:           string[];
  lashStyle:          string[];
  lashStatus:         string;
  lashCurl:           string;
  /** Lengths in mm, inner corner to outer, LASH_MAP_ZONES long; [] when not set. */
  lashMap:            number[];
  browStyle:          string[];
  browCondition:      string[];
  // Makeup (face shape, eye colour and blush added 2026-11-27)
  faceShape:          string;
  eyeColour:          string;
  blushStyle:         string[];
  makeupCoverage:     string[];
  makeupFinish:       string[];
  makeupEyes:         string[];
  makeupLips:         string[];
  // General
  styleVibe:          string[];
  /** Added 2026-11-17: aesthetics they love, what they get ready for, how much time they give it. */
  styleAesthetics:    string[];
  styleOccasions:     string[];
  styleRoutine:       string;
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
  hairType: [], hairPorosity: '', hairThickness: '', scalpCondition: [], hairGoals: [], treatmentHistory: [],
  skinType: [], skinTone: '', skinUndertone: '', skinConcerns: [], sensitiveAreas: [],
  nailCondition: [], nailService: [], nailLength: [], nailShape: [], nailStyle: [], nailColours: [],
  eyeShape: [], lashStyle: [], lashStatus: '', lashCurl: '', lashMap: [], browStyle: [], browCondition: [],
  faceShape: '', eyeColour: '', blushStyle: [], makeupCoverage: [], makeupFinish: [], makeupEyes: [], makeupLips: [],
  styleVibe: [], styleAesthetics: [], styleOccasions: [], styleRoutine: '', serviceInterests: [],
  gender: null, has_kids: false,
  allergies: [], medicalNotes: '', photographyConsent: true,
};
