// src/features/beauty-profile/options.ts
//
// The Beauty Profile's chip vocabularies. Moved verbatim out of
// BeautyProfileScreen.tsx when it was split; the values are what's stored in
// the users row, so changing a string here changes what providers read.
//
// Skin concerns and treatment history end in 'None' — the same value sign-up
// stores — because both are required (utils/beautyProfileTodo.ts): without it
// a client with nothing to declare couldn't finish the profile honestly.

import type { Gender } from '../../types/beautyProfile';

// Scalp, treatment history and skin concerns were widened 2026-11-17 so the
// answers can follow the client's hair and skin (tailoredOptions.ts): a 4C
// client gets the scalp, edge and protective-style answers that fit them.
export const SCALP_CONDITIONS = [
  'Healthy', 'Dry', 'Oily', 'Sensitive', 'Flaky', 'Itchy', 'Product build-up', 'Thinning edges', 'Tension from styles',
];
// Hair goals. The first six are the originals; the rest were added
// 2026-11-09 so the profile can tell, say, a 4C client who wants length
// retention and protective styles from someone after volume and highlights
// (suitedIdeas.ts reads them). Shown in an order that fits the client's hair
// type, see hairGoalsFor.
export const HAIR_GOALS       = [
  'Length retention', 'Volume', 'Colour / highlights', 'Moisture', 'Definition', 'Protective styling',
  'Healthy ends', 'Silk press / sleek looks', 'Heat-free styling', 'Growing out a relaxer',
  'Starting or keeping locs', 'Low-maintenance styles', 'Frizz control', 'Shine & gloss', 'Scalp care',
];

/** Goals that lead for coily and curly hair. */
const TEXTURED_GOALS_FIRST = [
  'Length retention', 'Moisture', 'Protective styling', 'Healthy ends', 'Definition',
  'Silk press / sleek looks', 'Heat-free styling', 'Growing out a relaxer', 'Starting or keeping locs',
  'Low-maintenance styles', 'Scalp care',
];
/** Goals that lead for straight and wavy hair. */
const SMOOTH_GOALS_FIRST = [
  'Volume', 'Colour / highlights', 'Shine & gloss', 'Frizz control', 'Healthy ends',
  'Low-maintenance styles', 'Definition', 'Moisture',
];

/**
 * Every hair goal, with the ones that usually fit this hair type first. Nothing
 * is hidden: anyone can pick any goal, it's only the order that changes.
 */
export function hairGoalsFor(hairTypes: readonly string[]): string[] {
  const textured = hairTypes.some(t => ['Curly', 'Coily', '4A', '4B', '4C'].includes(t));
  const smooth = !textured && hairTypes.some(t => t === 'Straight' || t === 'Wavy');
  const lead = textured ? TEXTURED_GOALS_FIRST : smooth ? SMOOTH_GOALS_FIRST : [];
  return [...lead, ...HAIR_GOALS.filter(g => !lead.includes(g))];
}
export const SKIN_TYPES       = ['Normal', 'Oily', 'Dry', 'Combination', 'Sensitive'];

export const SKIN_CONCERNS    = [
  'Acne prone', 'Hyperpigmentation', 'Rosacea', 'Eczema',
  'Psoriasis', 'Fine lines', 'Dark circles', 'Dry patches', 'Oiliness',
  'Redness', 'Enlarged pores', 'Dullness', 'Uneven texture', 'None',
];
export const SENSITIVE_AREAS  = ['Face', 'Arms', 'Legs', 'Back', 'Chest', 'Bikini / Brazilian', 'None'];
export const ALLERGENS        = [
  'Latex', 'Fragrances', 'Dyes / PPD', 'Nuts', 'Nickel',
  'Sulfates', 'Parabens', 'Lanolin', 'Shellfish', 'Gluten', 'None known',
];
// Nails, lashes, brows and makeup were widened 2026-11-09 to the names UK
// clients book under (BIAB-era nail menus, lash sets by style). Only the
// Beauty Profile editor shows these; sign-up doesn't ask them.
export const NAIL_LENGTHS     = ['Natural / bare', 'Short', 'Medium', 'Long', 'Extra long'];
export const NAIL_SHAPES      = ['Round', 'Square', 'Squoval', 'Oval', 'Almond', 'Coffin', 'Ballerina', 'Stiletto', 'Lipstick', 'Flare'];
// Added 2026-11-17 (owner: "nails should have better questions"). Asked in
// this order: what their own nails are like, what they get done, then length,
// shape, looks and colours, each leading the next (tailoredOptions.ts).
export const NAIL_CONDITIONS  = [
  'Strong & healthy', 'Weak / peeling', 'Brittle / break easily', 'Bitten', 'Ridged', 'Short nail beds', 'Damaged from extensions',
];
export const NAIL_SERVICES    = [
  'Gel polish', 'BIAB / builder gel', 'Acrylic', 'Gel extensions (Gel-X)', 'Hard gel', 'Natural manicure', 'Press-ons', 'Pedicure',
];
export const NAIL_STYLES      = [
  'Plain colour', 'French tip', 'Micro French', 'Chrome', 'Ombré', 'Nail art', 'Glitter', 'Minimal / negative space', '3D / charms', 'Milky / jelly',
];
export const NAIL_COLOURS     = ['Nudes', 'Milky white', 'Pinks', 'Reds', 'Darks', 'Pastels', 'Brights / neons', 'Seasonal'];
export const LASH_STYLES      = [
  'Natural', 'Classic', 'Wispy', 'Hybrid', 'Wet look', 'Cat eye', 'Doll eye',
  'Dramatic', 'Russian volume', 'Mega volume', 'Lifted natural lashes',
];
export const LASH_STATUS      = ['Currently have extensions', 'Growing out', 'Lash lift & tint', 'Wear strip lashes', 'No extensions'];
export const BROW_STYLES      = ['Natural', 'Soft arch', 'Defined', 'Bold', 'Laminated', 'Fluffy', 'Feathered', 'Ombré / powder', 'Microbladed'];
export const BROW_CONDITIONS  = ['Full', 'Sparse', 'Uneven', 'Overplucked', 'Unruly', 'Light / barely there'];
export const MAKEUP_COVERAGE  = ['Sheer / natural', 'Medium coverage', 'Full glam'];
export const MAKEUP_FINISH    = ['Matte', 'Soft matte', 'Satin', 'Dewy', 'Glowy'];
export const MAKEUP_EYES      = ['Subtle', 'Defined', 'Smoky', 'Cut crease', 'Graphic liner', 'Glitter / sparkle', 'Bold / dramatic'];
export const MAKEUP_LIPS      = ['Nude', 'Gloss', 'Brown / 90s liner', 'Berry / wine', 'Coral / peach', 'Classic red', 'Bold colour'];
export const STYLE_VIBES      = ['Natural', 'Glam', 'Bold', 'Classic', 'Editorial', 'Low-maintenance', 'Experimental'];

// Style & vibe, added 2026-11-17 (owner: "add more to style and vibe so it's
// not just pills"). Picked as cards, each with a line saying what it looks like.
export interface DescribedOption { name: string; line: string }
export const STYLE_AESTHETICS: readonly DescribedOption[] = [
  { name: 'Clean girl', line: 'Slick bun, dewy skin, brushed-up brows' },
  { name: 'Soft glam', line: 'Soft eyes, fluttery lashes, a glowy base' },
  { name: 'Old money', line: 'Polished blow-dry, neat nails, quiet luxury' },
  { name: 'Y2K', line: 'Gloss, frosty shades, playful nails' },
  { name: 'Coquette', line: 'Bows, blush pinks, soft curls' },
  { name: 'Baddie', line: 'Sharp lashes, sculpted brows, long nails' },
  { name: 'Streetwear', line: 'Fresh cuts, braids, clean nails' },
  { name: 'Boho', line: 'Loose waves, bronzed skin, earthy tones' },
  { name: 'Minimalist', line: 'Bare skin, natural nails, little fuss' },
  { name: 'Editorial', line: 'Bold colour, graphic lines, statement hair' },
];
export const STYLE_OCCASIONS  = ['Everyday', 'Work', 'Date nights', 'Nights out', 'Weddings', 'Holidays', 'Special events', 'Photoshoots'];
export const STYLE_ROUTINES: readonly DescribedOption[] = [
  { name: 'Quick & easy', line: 'Ten minutes and out the door' },
  { name: 'A bit of effort', line: 'A little time most days' },
  { name: 'Full routine', line: 'I love the whole process' },
];
/** The aesthetics that usually go with each vibe, shown first. */
export const AESTHETICS_BY_VIBE: Record<string, readonly string[]> = {
  Natural: ['Clean girl', 'Minimalist', 'Boho'],
  'Low-maintenance': ['Minimalist', 'Clean girl'],
  Classic: ['Old money', 'Clean girl'],
  Glam: ['Soft glam', 'Baddie', 'Old money'],
  Bold: ['Baddie', 'Y2K', 'Editorial'],
  Editorial: ['Editorial', 'Y2K'],
  Experimental: ['Y2K', 'Editorial', 'Streetwear'],
};
// Shown under Hair. 'Lash extensions' was here until 2026-11-09; lashes have
// their own status in Lashes & Brows ('Currently have extensions').
export const TREATMENT_HISTORY = [
  'Virgin hair', 'Natural (never relaxed)', 'Coloured', 'Bleached / lightened', 'Relaxed / permed', 'Texturised',
  'Silk pressed', 'Keratin / smoothing', 'Locs', 'Braids / twists', 'Wigs / units', 'Hair extensions',
  'Microblading', 'Fillers / Botox', 'Chemical peels', 'None',
];

/**
 * Treatment history as shown under Hair. Older profiles (and sign-up, which
 * asks across every category) can hold 'Lash extensions'; it stays stored —
 * maintenance suggestions read it — but isn't a hair answer, so Hair skips it.
 */
export function hairTreatmentHistory(history: string[]): string[] {
  return history.filter(v => v !== 'Lash extensions');
}

export const GENDER_LABELS: Record<Gender, string> = {
  female: 'Female',
  male: 'Male',
  'non-binary': 'Non-binary',
  'prefer-not-to-say': 'Prefer not to say',
};
