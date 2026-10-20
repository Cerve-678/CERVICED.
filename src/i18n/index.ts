// CERVICED in-house i18n layer. Dependency-light and native-free: a typed
// catalog lookup driven by the active language in DisplaySettingsContext, with
// English fallback, plurals and `{param}` interpolation. See
// ./catalogs/en/index.ts for how to add keys and the legal/health hold.
export { useTranslation } from './useTranslation';
export { useDynamicTranslation } from './useDynamicTranslation';
export {
  translate,
  translatePlural,
  tr,
  trp,
  resolveTranslation,
  interpolate,
  isTranslationKey,
  DO_NOT_TRANSLATE,
  CATALOGS,
} from './translate';
export { getLanguage, localeForLanguage } from './languageStore';
export { pluralCategory } from './plural';
export { en } from './catalogs/en';
export type {
  TranslationKey,
  TranslationParams,
  PluralKey,
  PluralCategory,
  Catalog,
  BaseCatalog,
  AreaCatalog,
} from './types';
