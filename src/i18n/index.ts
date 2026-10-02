// CERVICED in-house i18n layer. Dependency-light and native-free: a typed
// catalog lookup driven by the active language in DisplaySettingsContext, with
// English fallback and `{param}` interpolation. See ./catalogs/en.ts for how
// to add keys and ./translate.ts (DO_NOT_TRANSLATE) for the legal/health hold.
export { useTranslation } from './useTranslation';
export { useDynamicTranslation } from './useDynamicTranslation';
export {
  translate,
  resolveTranslation,
  interpolate,
  isTranslationKey,
  DO_NOT_TRANSLATE,
  CATALOGS,
} from './translate';
export { en } from './catalogs/en';
export type { TranslationKey, TranslationParams, Catalog, BaseCatalog } from './types';
