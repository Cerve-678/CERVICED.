import type { TranslationKey } from '../i18n/types';

/** Shared vocabulary for client profiles, service suitability and discovery. */
export const SKIN_TONES = ['Fair', 'Light', 'Medium', 'Tan', 'Deep', 'Rich'];

/** Display labels for SKIN_TONES. The English values above are what gets
 *  stored and matched — translate only at render. */
const SKIN_TONE_LABEL_KEYS: Readonly<Record<string, TranslationKey>> = {
  Fair: 'clientAccount.skinTone.fair',
  Light: 'clientAccount.skinTone.light',
  Medium: 'clientAccount.skinTone.medium',
  Tan: 'clientAccount.skinTone.tan',
  Deep: 'clientAccount.skinTone.deep',
  Rich: 'clientAccount.skinTone.rich',
};

/** The label to show for a stored skin-tone value, in the current language. */
export function skinToneLabel(value: string, t: (key: TranslationKey) => string): string {
  const key = SKIN_TONE_LABEL_KEYS[value];
  return key ? t(key) : value;
}

/** Unspecified suitability is unknown, so it must not claim a filter match. */
export function matchesSkinTone(tones: readonly string[] | null | undefined, tone: string): boolean {
  return !!tones?.some(value => value.toLowerCase() === tone.toLowerCase());
}
