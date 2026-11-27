import type { TranslationKey } from '../i18n/types';

// Hair type vocabulary, shared across every screen that asks about hair
// type — the client's own hair type (BeautyProfileScreen, SignUpStep4Screen),
// which hair types a provider's HAIR service suits (InfoRegScreen, stored in
// services.hair_types_suitable), and the client-side Search "Hair Type"
// filter (SearchScreen). A single shared list so the value picked in one
// place always means the same thing everywhere else.
//
// The 2A–3C curl codes were added 2026-11-27 (Pinterest's curly-routine
// searches name them: "2c 3a", "3b", "4a"). Each code sits after its family
// word, and matches it both ways (HAIR_TYPE_FAMILY, utils/hairTypeMatch.ts).
export const HAIR_TYPES = [
  'Straight', 'Wavy', '2A', '2B', '2C', 'Curly', '3A', '3B', '3C', 'Coily', '4A', '4B', '4C',
];

/** The word type each curl code belongs to. Mirrored in SQL by
 *  public.hair_type_family (20261127110000), which search matches with. */
export const HAIR_TYPE_FAMILY: Readonly<Record<string, 'Wavy' | 'Curly' | 'Coily'>> = {
  '2A': 'Wavy', '2B': 'Wavy', '2C': 'Wavy',
  '3A': 'Curly', '3B': 'Curly', '3C': 'Curly',
  '4A': 'Coily', '4B': 'Coily', '4C': 'Coily',
};

/** 'Curly' for 3B, and a word type for itself ('Straight' stays 'Straight'). */
export function hairTypeFamily(type: string): string {
  return HAIR_TYPE_FAMILY[type] ?? type;
}

/** Whether any of these hair types is in a family: 'Coily' for 4C or Coily. */
export function hasHairFamily(types: readonly string[], family: string): boolean {
  return types.some(t => hairTypeFamily(t) === family);
}

/** Display labels for HAIR_TYPES. The English values above are what gets
 *  stored and matched (utils/hairTypeMatch.ts) — translate only at render.
 *  The 4A/4B/4C codes are the same in every language, so they have no key. */
const HAIR_TYPE_LABEL_KEYS: Readonly<Record<string, TranslationKey>> = {
  Straight: 'clientAccount.hairType.straight',
  Wavy: 'clientAccount.hairType.wavy',
  Curly: 'clientAccount.hairType.curly',
  Coily: 'clientAccount.hairType.coily',
};

/** The label to show for a stored hair-type value, in the current language. */
export function hairTypeLabel(value: string, t: (key: TranslationKey) => string): string {
  const key = HAIR_TYPE_LABEL_KEYS[value];
  return key ? t(key) : value;
}
