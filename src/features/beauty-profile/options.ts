// src/features/beauty-profile/options.ts
//
// The Beauty Profile's chip vocabularies. Moved verbatim out of
// BeautyProfileScreen.tsx when it was split; the values are what's stored in
// the users row, so changing a string here changes what providers read.

import type { Gender } from '../../types/beautyProfile';
import type { TranslationKey } from '../../i18n/types';
import { hairTypeLabel } from '../../constants/hairTypes';
import { skinToneLabel } from '../../constants/skinTones';

export const SCALP_CONDITIONS = ['Healthy', 'Dry', 'Oily', 'Sensitive', 'Flaky'];
export const HAIR_GOALS       = ['Length retention', 'Volume', 'Colour / highlights', 'Moisture', 'Definition', 'Protective styling'];
export const SKIN_TYPES       = ['Normal', 'Oily', 'Dry', 'Combination', 'Sensitive'];

export const SKIN_CONCERNS    = [
  'Acne prone', 'Hyperpigmentation', 'Rosacea', 'Eczema',
  'Psoriasis', 'Fine lines', 'Dark circles', 'Dry patches', 'Oiliness',
];
export const SENSITIVE_AREAS  = ['Face', 'Arms', 'Legs', 'Back', 'Chest', 'Bikini / Brazilian', 'None'];
export const ALLERGENS        = [
  'Latex', 'Fragrances', 'Dyes / PPD', 'Nuts', 'Nickel',
  'Sulfates', 'Parabens', 'Lanolin', 'Shellfish', 'Gluten', 'None known',
];
export const NAIL_LENGTHS     = ['Short', 'Medium', 'Long', 'Extra long'];
export const NAIL_SHAPES      = ['Round', 'Square', 'Oval', 'Coffin', 'Almond', 'Stiletto'];
export const LASH_STYLES      = ['Natural', 'Wispy', 'Dramatic', 'Mega volume'];
export const LASH_STATUS      = ['Currently have extensions', 'Growing out', 'No extensions'];
export const BROW_STYLES      = ['Natural', 'Defined', 'Laminated', 'Fluffy', 'Feathered'];
export const BROW_CONDITIONS  = ['Full', 'Sparse', 'Uneven', 'Overplucked'];
export const MAKEUP_COVERAGE  = ['Sheer / natural', 'Medium coverage', 'Full glam'];
export const MAKEUP_FINISH    = ['Matte', 'Dewy', 'Satin'];
export const MAKEUP_EYES      = ['Subtle', 'Defined', 'Bold / dramatic'];
export const MAKEUP_LIPS      = ['Nude', 'Berry / wine', 'Coral / peach', 'Classic red', 'Bold colour'];
export const STYLE_VIBES      = ['Natural', 'Glam', 'Bold', 'Classic', 'Editorial', 'Low-maintenance', 'Experimental'];
export const TREATMENT_HISTORY = [
  'Virgin hair', 'Coloured', 'Bleached / lightened', 'Relaxed / permed',
  'Hair extensions', 'Lash extensions', 'Microblading', 'Fillers / Botox', 'Chemical peels',
];

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
