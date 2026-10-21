import type { TranslationKey } from '../i18n/types';

// Hair type vocabulary, shared across every screen that asks about hair
// type — the client's own hair type (BeautyProfileScreen, SignUpStep4Screen),
// which hair types a provider's HAIR service suits (InfoRegScreen, stored in
// services.hair_types_suitable), and the client-side Search "Hair Type"
// filter (SearchScreen). A single shared list so the value picked in one
// place always means the same thing everywhere else.
export const HAIR_TYPES = ['Straight', 'Wavy', 'Curly', 'Coily', '4A', '4B', '4C'];

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
