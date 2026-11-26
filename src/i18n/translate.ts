import { en, HELD_KEYS } from './catalogs/en';
import { es } from './catalogs/es';
import { fr } from './catalogs/fr';
import { pl } from './catalogs/pl';
import { de } from './catalogs/de';
import { pluralCategory } from './plural';
import { getLanguage } from './languageStore';
import type { BaseCatalog, Catalog, PluralKey, TranslationKey, TranslationParams } from './types';

// The pure translation resolver. No React and no I/O — the active language is
// passed in (the React layer reads it from DisplaySettingsContext, see
// ./useTranslation.ts), so this file is trivially unit-testable.

/**
 * Keys HELD IN ENGLISH regardless of the chosen language: legal, refund /
 * cancellation, payment, age and health-safety copy. CERVICED has no in-house
 * legal review, so this copy is never machine-translated — the resolver always
 * returns the English source for these keys, even if a language catalog were
 * to contain a translation for one. Each area declares its own held keys in
 * its `<area>Held` array (see ./catalogs/en/index.ts).
 */
export const DO_NOT_TRANSLATE: ReadonlySet<TranslationKey> = new Set<TranslationKey>(HELD_KEYS);

/** Registered language catalogs, keyed by language code. */
export const CATALOGS: Readonly<Record<string, Catalog>> = { en, es, fr, pl, de };

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

/**
 * Plural resolver: picks `base.one|few|many|other` by the language's plural
 * rule, falling back to `base.other` in that language, then to English. The
 * count is always available to the template as `{count}`.
 */
export function translatePlural(
  lang: string,
  base: PluralKey,
  count: number,
  params?: TranslationParams,
): string {
  const allParams = { count, ...params };
  const otherKey = `${base}.other` as TranslationKey;
  const englishKey = (count === 1 ? `${base}.one` : otherKey) as TranslationKey;
  if (lang === 'en' || DO_NOT_TRANSLATE.has(otherKey)) {
    return interpolate(en[englishKey], allParams);
  }
  const catalog: Readonly<Record<string, string | undefined>> = CATALOGS[lang] ?? {};
  const category = pluralCategory(lang, count);
  const template = catalog[`${base}.${category}`] ?? catalog[otherKey] ?? en[englishKey];
  return interpolate(template, allParams);
}

/**
 * Translate in the CURRENT language, for code outside React render (an Alert
 * raised from a context, a helper in src/utils). Inside a component use
 * `useTranslation()` instead: only the hook re-renders when the language
 * changes.
 */
export function tr(key: TranslationKey, params?: TranslationParams): string {
  return translate(getLanguage(), key, params);
}

/** Plural form of `tr`, for code outside React render. */
export function trp(base: PluralKey, count: number, params?: TranslationParams): string {
  return translatePlural(getLanguage(), base, count, params);
}

/** Runtime guard for an arbitrary string being a known key (rarely needed —
 *  the TranslationKey type catches typos at compile time). */
export function isTranslationKey(value: string): value is TranslationKey {
  return Object.prototype.hasOwnProperty.call(en, value);
}
