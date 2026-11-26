import { useCallback } from 'react';
import { useOptionalLanguage } from '../contexts/DisplaySettingsContext';
import { getLanguage } from './languageStore';
import { translate, translatePlural } from './translate';
import type { PluralKey, TranslationKey, TranslationParams } from './types';

export interface UseTranslation {
  /** Look up a UI string in the active language, with English fallback. */
  t: (key: TranslationKey, params?: TranslationParams) => string;
  /** Plural lookup: `tp('x', n)` reads `x.one` / `x.other` (and Polish
   *  `x.few` / `x.many`), with `{count}` filled in. */
  tp: (base: PluralKey, count: number, params?: TranslationParams) => string;
  /** The active language code (from DisplaySettingsContext). */
  language: string;
}

/**
 * The React binding for the i18n layer. Reads the active language from
 * DisplaySettingsContext (the single source of truth for locale — do not
 * introduce a second language store), so when the user changes language on
 * LanguageRegionScreen the context updates and every screen using this hook
 * re-renders its translated text live, with no app restart. Rendered outside
 * the provider it uses the language store's value instead of throwing.
 *
 * `t` and `tp` are memoized on `language` so a screen passing them into a
 * child or a memo dependency list stays stable between renders at the same
 * locale.
 */
export function useTranslation(): UseTranslation {
  // Outside the provider (error boundary, isolated tests) read the store.
  const language = useOptionalLanguage() ?? getLanguage();
  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams) => translate(language, key, params),
    [language],
  );
  const tp = useCallback(
    (base: PluralKey, count: number, params?: TranslationParams) =>
      translatePlural(language, base, count, params),
    [language],
  );
  return { t, tp, language };
}
