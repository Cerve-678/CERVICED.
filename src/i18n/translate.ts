import { en } from './catalogs/en';
import { es } from './catalogs/es';
import { fr } from './catalogs/fr';
import type { BaseCatalog, Catalog, TranslationKey, TranslationParams } from './types';

// The pure translation resolver. No React and no I/O — the active language is
// passed in (the React layer reads it from DisplaySettingsContext, see
// ./useTranslation.ts), so this file is trivially unit-testable.

/**
 * Keys HELD IN ENGLISH regardless of the chosen language: legal, refund /
 * cancellation, payment, and health-safety copy. CERVICED has no in-house
 * legal review, so this copy is never machine-translated — the resolver always
 * returns the English source for these keys, even if a language catalog were
 * to contain a translation for one. Add a key here the moment its copy becomes
 * legal- or health-adjacent.
 */
export const DO_NOT_TRANSLATE: ReadonlySet<TranslationKey> = new Set<TranslationKey>([
  'helpCentre.faq.cancel.a', // cancellation / refund policy
  'helpCentre.faq.payment.a', // payment handling
  'helpCentre.action.terms', // legal reference
  'profile.appInfo.terms.title', // legal reference
  'profile.appInfo.terms.sub', // legal reference
  'providerAccount.appInfo.terms.title', // legal reference
  'providerAccount.appInfo.terms.sub', // legal reference
]);

/** Registered language catalogs, keyed by language code. */
export const CATALOGS: Readonly<Record<string, Catalog>> = { en, es, fr };

/** Replace every `{name}` token with the matching param, leaving unknown
 *  tokens intact so a missing param is visible rather than silently blank. */
export function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

/**
 * Pure resolver, with every dependency injected so tests can drive it with a
 * fabricated catalog (e.g. to prove the do-not-translate guard overrides a
 * translation that DOES exist). Resolution order:
 *   1. held key or English target      -> English source
 *   2. language catalog has the key     -> that translation
 *   3. otherwise (missing key / unknown language) -> English source
 */
export function resolveTranslation(
  catalogs: Readonly<Record<string, Catalog>>,
  doNotTranslate: ReadonlySet<TranslationKey>,
  base: BaseCatalog,
  lang: string,
  key: TranslationKey,
  params?: TranslationParams,
): string {
  const english = base[key];
  if (lang === 'en' || doNotTranslate.has(key)) {
    return interpolate(english, params);
  }
  const translated = catalogs[lang]?.[key] ?? english;
  return interpolate(translated, params);
}

/** App-facing resolver bound to the registered catalogs and English source. */
export function translate(lang: string, key: TranslationKey, params?: TranslationParams): string {
  return resolveTranslation(CATALOGS, DO_NOT_TRANSLATE, en, lang, key, params);
}

/** Runtime guard for an arbitrary string being a known key (rarely needed —
 *  the TranslationKey type catches typos at compile time). */
export function isTranslationKey(value: string): value is TranslationKey {
  return Object.prototype.hasOwnProperty.call(en, value);
}
