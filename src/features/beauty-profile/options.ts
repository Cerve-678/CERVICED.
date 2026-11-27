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
import type { TranslationKey } from '../../i18n/types';
import { hairTypeLabel } from '../../constants/hairTypes';
import { skinToneLabel } from '../../constants/skinTones';

// Scalp, treatment history and skin concerns were widened 2026-11-17 so the
// answers can follow the client's hair and skin (tailoredOptions.ts): a 4C
// client gets the scalp, edge and protective-style answers that fit them.
export const SCALP_CONDITIONS = [
  'Healthy', 'Dry', 'Oily', 'Sensitive', 'Flaky', 'Itchy', 'Product build-up', 'Thinning edges', 'Tension from styles',
  // Added 2026-11-18 (owner: "add more to all the sections").
  'Dandruff', 'Shedding / hair loss', 'Tender / sore',
];
// Porosity, thickness, undertone, eye shape and lash curl were added
// 2026-11-27 (owner: "add things like lash map … low porosity, high porosity"),
// from what people search on Pinterest about themselves: "low porosity hair",
// "hair porosity test", "fine hair", "skin undertone", "lash map for hooded
// eyes", "lash curl types". Single picks, except eye shape. 'Not sure' is a
// real answer where a provider can check it at the appointment.
export const HAIR_POROSITY    = ['Low porosity', 'Medium porosity', 'High porosity', 'Not sure'];
export const HAIR_THICKNESS   = ['Fine', 'Medium', 'Thick / coarse'];
// Hair goals. The first six are the originals; the rest were added
// 2026-11-09 so the profile can tell, say, a 4C client who wants length
// retention and protective styles from someone after volume and highlights
// (suitedIdeas.ts reads them). Shown in an order that fits the client's hair
// type, see hairGoalsFor.
export const HAIR_GOALS       = [
  'Length retention', 'Volume', 'Colour / highlights', 'Moisture', 'Definition', 'Protective styling',
  'Healthy ends', 'Silk press / sleek looks', 'Heat-free styling', 'Growing out a relaxer',
  'Starting or keeping locs', 'Low-maintenance styles', 'Frizz control', 'Shine & gloss', 'Scalp care',
  // Added 2026-11-18.
  'Repairing damage', 'Covering or blending greys', 'Going lighter', 'Thicker-looking hair', 'Growing out colour',
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
export const SKIN_UNDERTONES  = ['Cool', 'Warm', 'Neutral', 'Olive', 'Not sure'];
// Sign-up shows SKIN_TYPES too. 'Dehydrated' and 'Mature' added 2026-11-18.
export const SKIN_TYPES       = ['Normal', 'Oily', 'Dry', 'Combination', 'Sensitive', 'Dehydrated', 'Mature'];

// Widened 2026-11-18; 'None' stays last.
export const SKIN_CONCERNS    = [
  'Acne prone', 'Hyperpigmentation', 'Rosacea', 'Eczema',
  'Psoriasis', 'Fine lines', 'Dark circles', 'Dry patches', 'Oiliness',
  'Redness', 'Enlarged pores', 'Dullness', 'Uneven texture',
  'Blackheads', 'Acne scarring', 'Melasma', 'Sun damage', 'Loss of firmness',
  'Ingrown hairs', 'Milia', 'Puffiness', 'None',
];
export const SENSITIVE_AREAS  = [
  'Face', 'Upper lip', 'Brows', 'Underarms', 'Arms', 'Legs', 'Back', 'Chest', 'Stomach', 'Bikini / Brazilian', 'Scalp', 'None',
];
// Always shared with providers. The 2026-11-18 additions are the ones salon
// products actually contain (lash glue, gel and acrylic, numbing cream, wax).
export const ALLERGENS        = [
  'Latex', 'Fragrances', 'Dyes / PPD', 'Nuts', 'Nickel',
  'Sulfates', 'Parabens', 'Lanolin', 'Shellfish', 'Gluten',
  'Lash glue (cyanoacrylate)', 'Gel & acrylic (acrylates / HEMA)', 'Numbing cream (lidocaine)',
  'Wax / rosin', 'Formaldehyde', 'Essential oils', 'Henna', 'None known',
];
// Nails, lashes, brows and makeup were widened 2026-11-09 to the names UK
// clients book under (BIAB-era nail menus, lash sets by style). Only the
// Beauty Profile editor shows these; sign-up doesn't ask them.
export const NAIL_LENGTHS     = ['Natural / bare', 'Short', 'Medium', 'Long', 'Extra long'];
export const NAIL_SHAPES      = ['Round', 'Square', 'Squoval', 'Oval', 'Almond', 'Coffin', 'Ballerina', 'Stiletto', 'Lipstick', 'Flare', 'Edge'];
// Added 2026-11-17 (owner: "nails should have better questions"). Asked in
// this order: what their own nails are like, what they get done, then length,
// shape, looks and colours, each leading the next (tailoredOptions.ts).
export const NAIL_CONDITIONS  = [
  'Strong & healthy', 'Weak / peeling', 'Brittle / break easily', 'Bitten', 'Ridged', 'Short nail beds', 'Damaged from extensions',
  'Thin / bendy', 'Splitting', 'Dry cuticles', 'Wide nail beds',
];
export const NAIL_SERVICES    = [
  'Gel polish', 'BIAB / builder gel', 'Acrylic', 'Gel extensions (Gel-X)', 'Hard gel', 'Natural manicure', 'Press-ons', 'Pedicure',
  'Polygel', 'Dip powder', 'Russian manicure', 'Japanese manicure', 'Gel pedicure',
];
export const NAIL_STYLES      = [
  'Plain colour', 'French tip', 'Micro French', 'Chrome', 'Ombré', 'Nail art', 'Glitter', 'Minimal / negative space', '3D / charms', 'Milky / jelly',
  'Cat eye / velvet', 'Aura', 'Baby boomer', 'Marble', 'Tortoiseshell', 'Gems', 'Matte',
];
export const NAIL_COLOURS     = [
  'Nudes', 'Milky white', 'Pinks', 'Reds', 'Darks', 'Pastels', 'Brights / neons', 'Seasonal',
  'Browns / earthy', 'Metallics', 'Blues & greens', 'Purples', 'Black & white',
];
export const LASH_STYLES      = [
  'Natural', 'Classic', 'Wispy', 'Hybrid', 'Wet look', 'Cat eye', 'Doll eye',
  'Dramatic', 'Russian volume', 'Mega volume', 'Lifted natural lashes',
  'Anime / spiky', 'Fox eye', 'Open eye', 'Coloured lashes',
  // Lash maps added 2026-11-27, the ones Pinterest's lash map searches name.
  'Squirrel', 'Kitten',
];
/** What a lash map is built around. A client can pick two, like hooded and almond. */
export const EYE_SHAPES       = [
  'Almond', 'Round', 'Hooded', 'Monolid', 'Downturned', 'Upturned', 'Deep-set', 'Close-set', 'Wide-set',
];
export const LASH_CURLS       = [
  'J (subtle)', 'B (soft)', 'C (natural lift)', 'CC (curled)', 'D (dramatic)',
  'L / M (lifts hooded or straight lashes)', 'Let my tech decide',
];
export const LASH_STATUS      = [
  'Currently have extensions', 'Growing out', 'Lash lift & tint', 'Lash tint only', 'Wear strip lashes',
  'Wear cluster lashes', 'Extensions for events', 'No extensions',
];
export const BROW_STYLES      = [
  'Natural', 'Soft arch', 'Defined', 'Bold', 'Laminated', 'Fluffy', 'Feathered', 'Ombré / powder', 'Microbladed',
  'Straight', 'Thin / 90s', 'Tinted', 'Henna brows', 'Hybrid (powder & strokes)',
];
export const BROW_CONDITIONS  = [
  'Full', 'Sparse', 'Uneven', 'Overplucked', 'Unruly', 'Light / barely there',
  'Thinning', 'Grey / white hairs', 'Old tattoo / fading PMU',
];
export const MAKEUP_COVERAGE  = ['Bare skin', 'Sheer / natural', 'Skin tint', 'Medium coverage', 'Full coverage', 'Full glam', 'Airbrush'];
export const MAKEUP_FINISH    = ['Matte', 'Soft matte', 'Satin', 'Dewy', 'Glowy', 'Skin-like', 'Velvet'];
export const MAKEUP_EYES      = [
  'Subtle', 'Defined', 'Smoky', 'Cut crease', 'Graphic liner', 'Glitter / sparkle', 'Bold / dramatic',
  'Winged liner', 'Soft brown', 'Halo', 'Siren eyes', 'Colourful',
];
export const MAKEUP_LIPS      = [
  'Nude', 'Gloss', 'Brown / 90s liner', 'Berry / wine', 'Coral / peach', 'Classic red', 'Bold colour',
  'Lip oil / balm', 'Blurred / ombré', 'Pinks', 'Dark / vampy',
];
// Sign-up shows STYLE_VIBES too. The last five were added 2026-11-18.
export const STYLE_VIBES      = [
  'Natural', 'Glam', 'Bold', 'Classic', 'Editorial', 'Low-maintenance', 'Experimental',
  'Polished', 'Romantic', 'Edgy', 'Sporty', 'Effortless',
];

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
  // Added 2026-11-18.
  { name: 'Natural crown', line: 'Afros, locs and twists, texture celebrated' },
  { name: 'Latte', line: 'Warm browns, bronzed skin, caramel tones' },
  { name: 'Vanilla girl', line: 'Creamy shades, glossy lips, sleek hair' },
  { name: 'K-beauty', line: 'Glass skin, gradient lips, straight brows' },
  { name: 'Mob wife', line: 'Big blow-dry, dark nails, a bold lip' },
  { name: 'Grunge', line: 'Smudged liner, dark nails, undone hair' },
  { name: 'Sporty', line: 'Sleek ponytail, fresh skin, short nails' },
  { name: 'Bridal', line: 'Soft, timeless and made to last all day' },
];
export const STYLE_OCCASIONS  = [
  'Everyday', 'Work', 'Date nights', 'Nights out', 'Weddings', 'Holidays', 'Special events', 'Photoshoots',
  'Birthdays', 'Festivals', 'Prom & graduation', 'Religious & cultural events', 'Interviews', 'Content creation',
];
// The names are what's stored; the lines say how long, so the question reads
// plainly (owner, 2026-11-18: "word it better").
export const STYLE_ROUTINES: readonly DescribedOption[] = [
  { name: 'Quick & easy', line: 'Under 15 minutes, then out the door' },
  { name: 'A bit of effort', line: 'About 15 to 30 minutes most days' },
  { name: 'Full routine', line: 'Up to an hour or more, I love the process' },
  { name: 'Depends on the day', line: 'Quick in the week, more for going out' },
];
/** The aesthetics that usually go with each vibe, shown first. */
export const AESTHETICS_BY_VIBE: Record<string, readonly string[]> = {
  Natural: ['Clean girl', 'Minimalist', 'Boho'],
  'Low-maintenance': ['Minimalist', 'Clean girl'],
  Classic: ['Old money', 'Clean girl'],
  Glam: ['Soft glam', 'Baddie', 'Old money'],
  Bold: ['Baddie', 'Y2K', 'Editorial'],
  Editorial: ['Editorial', 'Y2K'],
  Experimental: ['Y2K', 'Editorial', 'Streetwear', 'Grunge'],
  Polished: ['Old money', 'Vanilla girl', 'Clean girl'],
  Romantic: ['Coquette', 'Soft glam', 'Bridal'],
  Edgy: ['Grunge', 'Baddie', 'Streetwear'],
  Sporty: ['Sporty', 'Clean girl', 'Streetwear'],
  Effortless: ['Clean girl', 'Latte', 'Boho', 'Minimalist'],
};
// Shown under Hair. 'Lash extensions' was here until 2026-11-09; lashes have
// their own status in Lashes & Brows ('Currently have extensions').
export const TREATMENT_HISTORY = [
  'Virgin hair', 'Natural (never relaxed)', 'Coloured', 'Bleached / lightened', 'Relaxed / permed', 'Texturised',
  'Silk pressed', 'Keratin / smoothing', 'Locs', 'Braids / twists', 'Wigs / units', 'Hair extensions',
  'Microblading', 'Fillers / Botox', 'Chemical peels',
  // Added 2026-11-18.
  'Box dye at home', 'Henna', 'Bond repair treatment', 'None',
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

/**
 * Display labels for the stored answers above. The English strings are what
 * the users row holds (and what providers read), so they are never
 * translated themselves — only shown through this map at render.
 *
 * ALLERGENS and SENSITIVE_AREAS are health-safety answers and are HELD IN
 * ENGLISH, so they have no entries and show as stored.
 */
const OPTION_LABEL_KEYS: Readonly<Record<string, TranslationKey>> = {
  Healthy: 'clientAccount.option.healthy',
  Dry: 'clientAccount.option.dry',
  Oily: 'clientAccount.option.oily',
  Sensitive: 'clientAccount.option.sensitive',
  Flaky: 'clientAccount.option.flaky',
  'Length retention': 'clientAccount.option.lengthRetention',
  Volume: 'clientAccount.option.volume',
  'Colour / highlights': 'clientAccount.option.colourHighlights',
  Moisture: 'clientAccount.option.moisture',
  Definition: 'clientAccount.option.definition',
  'Protective styling': 'clientAccount.option.protectiveStyling',
  Normal: 'clientAccount.option.normal',
  Combination: 'clientAccount.option.combination',
  'Acne prone': 'clientAccount.option.acneProne',
  Hyperpigmentation: 'clientAccount.option.hyperpigmentation',
  Rosacea: 'clientAccount.option.rosacea',
  Eczema: 'clientAccount.option.eczema',
  Psoriasis: 'clientAccount.option.psoriasis',
  'Fine lines': 'clientAccount.option.fineLines',
  'Dark circles': 'clientAccount.option.darkCircles',
  'Dry patches': 'clientAccount.option.dryPatches',
  Oiliness: 'clientAccount.option.oiliness',
  Short: 'clientAccount.option.short',
  Medium: 'clientAccount.option.medium',
  Long: 'clientAccount.option.long',
  'Extra long': 'clientAccount.option.extraLong',
  Round: 'clientAccount.option.round',
  Square: 'clientAccount.option.square',
  Oval: 'clientAccount.option.oval',
  Coffin: 'clientAccount.option.coffin',
  Almond: 'clientAccount.option.almond',
  Stiletto: 'clientAccount.option.stiletto',
  Natural: 'clientAccount.option.natural',
  Wispy: 'clientAccount.option.wispy',
  Dramatic: 'clientAccount.option.dramatic',
  'Mega volume': 'clientAccount.option.megaVolume',
  'Currently have extensions': 'clientAccount.option.currentlyHaveExtensions',
  'Growing out': 'clientAccount.option.growingOut',
  'No extensions': 'clientAccount.option.noExtensions',
  Defined: 'clientAccount.option.defined',
  Laminated: 'clientAccount.option.laminated',
  Fluffy: 'clientAccount.option.fluffy',
  Feathered: 'clientAccount.option.feathered',
  Full: 'clientAccount.option.full',
  Sparse: 'clientAccount.option.sparse',
  Uneven: 'clientAccount.option.uneven',
  Overplucked: 'clientAccount.option.overplucked',
  'Sheer / natural': 'clientAccount.option.sheerNatural',
  'Medium coverage': 'clientAccount.option.mediumCoverage',
  'Full glam': 'clientAccount.option.fullGlam',
  Matte: 'clientAccount.option.matte',
  Dewy: 'clientAccount.option.dewy',
  Satin: 'clientAccount.option.satin',
  Subtle: 'clientAccount.option.subtle',
  'Bold / dramatic': 'clientAccount.option.boldDramatic',
  Nude: 'clientAccount.option.nude',
  'Berry / wine': 'clientAccount.option.berryWine',
  'Coral / peach': 'clientAccount.option.coralPeach',
  'Classic red': 'clientAccount.option.classicRed',
  'Bold colour': 'clientAccount.option.boldColour',
  Glam: 'clientAccount.option.glam',
  Bold: 'clientAccount.option.bold',
  Classic: 'clientAccount.option.classic',
  Editorial: 'clientAccount.option.editorial',
  'Low-maintenance': 'clientAccount.option.lowMaintenance',
  Experimental: 'clientAccount.option.experimental',
  'Virgin hair': 'clientAccount.option.virginHair',
  Coloured: 'clientAccount.option.coloured',
  'Bleached / lightened': 'clientAccount.option.bleachedLightened',
  'Relaxed / permed': 'clientAccount.option.relaxedPermed',
  'Hair extensions': 'clientAccount.option.hairExtensions',
  'Lash extensions': 'clientAccount.option.lashExtensions',
  Microblading: 'clientAccount.option.microblading',
  'Fillers / Botox': 'clientAccount.option.fillersBotox',
  'Chemical peels': 'clientAccount.option.chemicalPeels',
  Female: 'clientAccount.option.female',
  Male: 'clientAccount.option.male',
  'Non-binary': 'clientAccount.option.nonBinary',
  'Prefer not to say': 'clientAccount.option.preferNotToSay',
};

/** The label to show for any stored Beauty Profile answer (including hair
 *  type and skin tone), in the current language. Unknown values — held
 *  health answers, or anything written by an older build — show as stored. */
export function beautyOptionLabel(value: string, t: (key: TranslationKey) => string): string {
  const key = OPTION_LABEL_KEYS[value];
  if (key) return t(key);
  const hair = hairTypeLabel(value, t);
  return hair !== value ? hair : skinToneLabel(value, t);
}
