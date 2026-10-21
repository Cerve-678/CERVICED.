// src/features/beauty-profile/options.ts
//
// The Beauty Profile's chip vocabularies. Moved verbatim out of
// BeautyProfileScreen.tsx when it was split; the values are what's stored in
// the users row, so changing a string here changes what providers read.

import type { Gender } from '../../types/beautyProfile';

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
