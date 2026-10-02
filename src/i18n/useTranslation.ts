import { useCallback } from 'react';
import { useDisplaySettings } from '../contexts/DisplaySettingsContext';
import { translate } from './translate';
import type { TranslationKey, TranslationParams } from './types';

export interface UseTranslation {
  /** Look up a UI string in the active language, with English fallback. */
  t: (key: TranslationKey, params?: TranslationParams) => string;
  /** The active language code (from DisplaySettingsContext). */
  language: string;
}

/**
 * The React binding for the i18n layer. Reads the active language from
 * DisplaySettingsContext (the single source of truth for locale — do not
 * introduce a second language store), so when the user changes language on
 * LanguageRegionScreen the context updates and every screen using this hook
 * re-renders its translated text live, with no app restart.
 *
 * `t` is memoized on `language` so a screen passing it into a child or a
 * memo dependency list stays stable between renders at the same locale.
 */
export function useTranslation(): UseTranslation {
  const { language } = useDisplaySettings();
  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams) => translate(language, key, params),
    [language],
  );
  return { t, language };
}
